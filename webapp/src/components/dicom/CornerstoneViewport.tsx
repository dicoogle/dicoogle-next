import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as cornerstone from "@cornerstonejs/core";
import { Enums as csEnums } from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { initializeCornerstone } from "@/utils/cornerstoneInit";
import { Button } from "@/components/ui/Button";
import { MetadataPanel } from "@/features/search/components/MetadataPanel";
import { useMetadata } from "@/features/search/hooks/useMetadata";
import {
  ZoomIn,
  Hand,
  RotateCw,
  SunMoon,
  X,
  Loader2,
  RectangleHorizontal,
  Pencil,
  Info,
  CircleDot,
  Minimize2,
  Maximize2,
  Undo2,
} from "lucide-react";

import { DicomViewerProps } from "@/types";

const RENDERING_ENGINE_ID = "dicoogleViewerEngine";
const VIEWPORT_ID = "dicoogleViewport";
const TOOL_GROUP_ID = "dicoogleToolGroup";

// Global tracker to manage cache persistence across component mounts
let lastSeriesSignature: string | null = null;

export function DicomViewer({
  imageUrls,
  initialIndex = 0,
  onClose,
}: DicomViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Tools
  const [activeTool, setActiveTool] = useState<string>(
    cornerstoneTools.WindowLevelTool.toolName,
  );

  // Metadata States
  const [showMetadata, setShowMetadata] = useState(false);
  const [currentImageId, setCurrentImageId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [tagSearchQuery, setTagSearchQuery] = useState("");

  // Extract SOP UID from current image ID
  const currentSopUID = useMemo(() => {
    if (!currentImageId) return null;
    const match = currentImageId.match(/uid=([^&]*)/);
    return match && match[1] ? match[1] : null;
  }, [currentImageId]);

  // Use shared metadata hook
  const {
    metadata,
    loading: isMetadataLoading,
    error: metadataError,
  } = useMetadata(currentSopUID, showMetadata);

  // Progress State
  const [loadedCount, setLoadedCount] = useState(0);
  // Ref to track loaded count inside event listeners without re-binding
  const loadedCountRef = useRef(0);

  // Dragging State
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isSetupRef = useRef(false);
  const renderingEngineRef = useRef<cornerstone.RenderingEngine | null>(null);
  const initialIndexRef = useRef(initialIndex);

  // Update ref whenever state changes
  useEffect(() => {
    loadedCountRef.current = loadedCount;
  }, [loadedCount]);

  // 1. Memoize Image IDs
  // We use a stable key for image URLs to prevent unnecessary re-initialization
  // when the array reference changes but content is same.
  const imageUrlsStr = imageUrls.join(",");
  const imageIds = useMemo(() => {
    return imageUrls.map((url) => {
      if (url.startsWith("wadouri:") || url.startsWith("dicomweb:")) return url;
      const fullUrl = url.startsWith("http")
        ? url
        : `${window.location.origin}${url}`;
      return `wadouri:${fullUrl}`;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrlsStr]);

  // 2. Setup Cornerstone & Viewport
  useEffect(() => {
    const setup = async () => {
      if (!viewerRef.current || isSetupRef.current || imageIds.length === 0)
        return;

      try {
        setIsLoading(true);
        isSetupRef.current = true;

        await initializeCornerstone();

        // --- CACHE MANAGEMENT ---
        const currentSignature = imageIds[0];

        if (lastSeriesSignature && lastSeriesSignature !== currentSignature) {
          cornerstone.cache.purgeCache();
          console.log("[DicomViewer] Switched series - Cache purged");
        } else {
          console.log("[DicomViewer] Same series - Cache preserved");
        }

        lastSeriesSignature = currentSignature;
        // ------------------------

        const existingEngine =
          cornerstone.getRenderingEngine(RENDERING_ENGINE_ID);
        if (existingEngine) existingEngine.destroy();

        const renderingEngine = new cornerstone.RenderingEngine(
          RENDERING_ENGINE_ID,
        );
        renderingEngineRef.current = renderingEngine;

        const element = viewerRef.current;
        const viewportInput = {
          viewportId: VIEWPORT_ID,
          type: csEnums.ViewportType.STACK,
          element,
          defaultOptions: {
            background: [0, 0, 0] as [number, number, number],
          },
        };

        renderingEngine.enableElement(viewportInput);

        const viewport = renderingEngine.getViewport(
          VIEWPORT_ID,
        ) as cornerstone.StackViewport;

        // Calculate safe start index
        const startIndex = Math.min(
          Math.max(0, initialIndexRef.current),
          imageIds.length - 1,
        );

        // Set full stack but start at the requested index
        await viewport.setStack(imageIds, startIndex);
        viewport.render();

        setCurrentImageId(imageIds[startIndex]);
        setCurrentIndex(startIndex);
        setLoadedCount(1); // At least the first image is loaded

        // Note: Event listener moved to separate useEffect for reliability

        // --- Register Tools ---
        const toolsToRegister = [
          cornerstoneTools.WindowLevelTool,
          cornerstoneTools.PanTool,
          cornerstoneTools.ZoomTool,
          cornerstoneTools.StackScrollMouseWheelTool,
          cornerstoneTools.RectangleROITool,
          cornerstoneTools.PlanarFreehandROITool,
          cornerstoneTools.EllipticalROITool,
        ];

        toolsToRegister.forEach((tool) => {
          try {
            if (tool) cornerstoneTools.addTool(tool);
          } catch (e) {
            /* ignore if tool already exists */
            console.debug(e);
          }
        });

        try {
          cornerstoneTools.ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID);
        } catch (e) {
          console.debug(e);
        }

        const toolGroup =
          cornerstoneTools.ToolGroupManager.createToolGroup(TOOL_GROUP_ID);

        if (toolGroup) {
          toolGroup.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID);

          toolsToRegister.forEach((tool) => {
            if (tool) toolGroup.addTool(tool.toolName);
          });

          // Initial Tool State
          toolGroup.setToolActive(cornerstoneTools.WindowLevelTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
            ],
          });
          toolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
            ],
          });
          toolGroup.setToolActive(
            cornerstoneTools.StackScrollMouseWheelTool.toolName,
          );

          toolGroup.setToolPassive(cornerstoneTools.PanTool.toolName);
          toolGroup.setToolPassive(cornerstoneTools.RectangleROITool.toolName);
          toolGroup.setToolPassive(cornerstoneTools.EllipticalROITool.toolName);
          toolGroup.setToolPassive(
            cornerstoneTools.PlanarFreehandROITool.toolName,
          );
        }

        setIsLoading(false);
      } catch (err: any) {
        console.error("[DicomViewer] Setup error:", err);
        setError(`Failed to load viewer: ${err.message}`);
        setIsLoading(false);
      }
    };

    setup();

    return () => {
      isSetupRef.current = false;
      try {
        if (renderingEngineRef.current) renderingEngineRef.current.destroy();
        cornerstoneTools.ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID);
      } catch (e) {
        console.error(e);
      }
    };
  }, [imageIds]);

  // 3. Handle Scroll Events (Counter Update)
  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;

    const onNewImage = (evt: any) => {
      const { imageId, newImageIdIndex, imageIdIndex } = evt.detail;
      setCurrentImageId(imageId);
      setCurrentIndex(newImageIdIndex ?? imageIdIndex ?? 0);
    };

    element.addEventListener(csEnums.Events.STACK_NEW_IMAGE, onNewImage);

    return () => {
      element.removeEventListener(csEnums.Events.STACK_NEW_IMAGE, onNewImage);
    };
  }, []);

  // 4. Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      const renderingEngine =
        cornerstone.getRenderingEngine(RENDERING_ENGINE_ID);
      const viewport = renderingEngine?.getViewport(
        VIEWPORT_ID,
      ) as cornerstone.StackViewport;

      if (!viewport) return;

      const maxIndex = Math.max(0, loadedCountRef.current - 1);
      let newIndex = currentIndex;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        newIndex = Math.min(currentIndex + 1, maxIndex);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        newIndex = Math.max(currentIndex - 1, 0);
      } else if (e.key === "Escape" && onClose) {
        e.preventDefault();
        onClose();
        return;
      } else {
        return; // Not a key we handle
      }

      if (newIndex !== currentIndex) {
        viewport.setImageIdIndex(newIndex);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, onClose]);

  // 5. Prefetch Images & Progressive Stack Update
  useEffect(() => {
    if (isLoading || imageIds.length === 0) return;

    let mounted = true;

    const loadAll = async () => {
      const promises = imageIds.map(async (imageId) => {
        try {
          const isCached = cornerstone.cache.getImageLoadObject(imageId);
          if (isCached) {
            if (mounted)
              setLoadedCount((prev) => Math.min(prev + 1, imageIds.length));
            return;
          }

          await cornerstone.imageLoader.loadAndCacheImage(imageId);
          if (mounted) {
            setLoadedCount((prev) => Math.min(prev + 1, imageIds.length));
          }
        } catch (err) {
          console.warn(`Failed to prefetch image: ${imageId}`, err);
        }
      });

      await Promise.allSettled(promises);
    };

    loadAll();

    return () => {
      mounted = false;
    };
  }, [imageIds, isLoading]);

  // 6. Dynamic Stack Update (Blocking Logic)
  useEffect(() => {
    const updateStack = async () => {
      const renderingEngine =
        cornerstone.getRenderingEngine(RENDERING_ENGINE_ID);
      const viewport = renderingEngine?.getViewport(
        VIEWPORT_ID,
      ) as cornerstone.StackViewport;

      if (!viewport) return;

      const limit = Math.max(1, loadedCount);
      const availableImages = imageIds.slice(0, limit);
      const currentStack = viewport.getImageIds();

      // Only update if we have new images to add
      if (currentStack.length < availableImages.length) {
        let newIndex = viewport.getCurrentImageIdIndex();
        if (newIndex >= availableImages.length) {
          newIndex = availableImages.length - 1;
        }
        await viewport.setStack(availableImages, newIndex);
      }
    };

    updateStack();
  }, [loadedCount, imageIds]);

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    const container = document.querySelector(".fixed.inset-0.bg-black");
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  };

  // --- Tool Switching ---
  const setTool = (toolName: string) => {
    const toolGroup =
      cornerstoneTools.ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
    if (!toolGroup) return;

    const primaryTools = [
      cornerstoneTools.WindowLevelTool.toolName,
      cornerstoneTools.PanTool.toolName,
      cornerstoneTools.ZoomTool.toolName,
      cornerstoneTools.RectangleROITool.toolName,
      cornerstoneTools.PlanarFreehandROITool.toolName,
      cornerstoneTools.EllipticalROITool.toolName,
    ];

    primaryTools.forEach((t) => toolGroup.setToolPassive(t));

    toolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
      bindings: [
        { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
      ],
    });

    if (toolName === cornerstoneTools.ZoomTool.toolName) {
      toolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
        ],
      });
    } else {
      toolGroup.setToolActive(toolName, {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
        ],
      });
    }

    setActiveTool(toolName);
  };

  const resetView = () => {
    cornerstoneTools.annotation.state.removeAllAnnotations();
    const renderingEngine = cornerstone.getRenderingEngine(RENDERING_ENGINE_ID);
    const viewport = renderingEngine?.getViewport(
      VIEWPORT_ID,
    ) as cornerstone.StackViewport;
    if (viewport) {
      viewport.resetCamera();
      viewport.render();
    }
  };

  const rotateImage = () => {
    const renderingEngine = cornerstone.getRenderingEngine(RENDERING_ENGINE_ID);
    const viewport = renderingEngine?.getViewport(
      VIEWPORT_ID,
    ) as cornerstone.StackViewport;
    if (viewport) {
      const { rotation } = viewport.getViewPresentation();
      viewport.setViewPresentation({
        rotation: ((rotation ?? 0) + 90) % 360,
      });
      viewport.render();
    }
  };

  // --- DRAG / SCRUBBER LOGIC ---
  const handleSeek = useCallback(
    (clientX: number) => {
      if (!progressBarRef.current || imageIds.length <= 1) return;

      const rect = progressBarRef.current.getBoundingClientRect();
      // Calculate percentage (0 to 1) based on click position
      const ratio = Math.max(
        0,
        Math.min((clientX - rect.left) / rect.width, 1),
      );

      // Map percentage to an index in the total image array
      const total = imageIds.length;
      const targetIndex = Math.round(ratio * (total - 1));

      // Limit to loaded images only!
      // loadedCount is 1-based, indices are 0-based. Max index is loadedCount - 1
      const maxIndex = Math.max(0, loadedCountRef.current - 1);
      const finalIndex = Math.min(targetIndex, maxIndex);

      const renderingEngine =
        cornerstone.getRenderingEngine(RENDERING_ENGINE_ID);
      const viewport = renderingEngine?.getViewport(
        VIEWPORT_ID,
      ) as cornerstone.StackViewport;

      if (viewport) {
        // This updates the viewport but NOT our 'currentIndex' state directly.
        // The event listener STACK_NEW_IMAGE handles the state update.
        viewport.setImageIdIndex(finalIndex);
      }
    },
    [imageIds],
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only Left Click
    setIsDragging(true);
    handleSeek(e.clientX);
  };

  // Attach global mouse listeners when dragging starts
  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault(); // Stop text selection
      handleSeek(e.clientX);
    };

    const onMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, handleSeek]);

  const getBtnClass = (name: string) =>
    activeTool === name
      ? "bg-blue-600 hover:bg-blue-700 text-white border-none"
      : "text-neutral-300 border-neutral-700 hover:bg-neutral-800";

  return (
    <div className="fixed inset-0 bg-black z-100 flex flex-col font-sans">
      {/* PROGRESS BAR - Minimal Modern Design */}
      {imageIds.length > 1 && (
        <div
          ref={progressBarRef}
          className="absolute bottom-0 left-0 h-1 bg-neutral-900/40 w-full cursor-pointer hover:h-1.5 transition-all duration-200 group"
          onMouseDown={handleMouseDown}
        >
          {/* Background track */}
          <div className="absolute inset-0 bg-neutral-800/60" />

          {/* Download progress */}
          <div
            className="absolute inset-y-0 left-0 bg-blue-500/30 transition-all duration-300"
            style={{ width: `${(loadedCount / imageIds.length) * 100}%` }}
          />

          {/* Current position indicator */}
          <div
            className="absolute inset-y-0 bg-blue-500 transition-all duration-75"
            style={{
              left: `${imageIds.length > 1 ? (currentIndex / imageIds.length) * 100 : 0}%`,
              width: `${imageIds.length > 0 ? Math.max(0.2, 100 / imageIds.length) : 100}%`,
            }}
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-2 flex items-center gap-3">
        {/* Dicoogle Logo - Left */}
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Dicoogle"
          className="h-8"
        />

        {/* Tool Buttons - Center */}
        <div className="flex-1 flex items-center gap-2 justify-center overflow-x-auto">
          <Button
            variant={
              activeTool === cornerstoneTools.WindowLevelTool.toolName
                ? "default"
                : "outline-solid"
            }
            size="sm"
            onClick={() => setTool(cornerstoneTools.WindowLevelTool.toolName)}
            className={getBtnClass(cornerstoneTools.WindowLevelTool.toolName)}
          >
            <SunMoon className="w-4 h-4 mr-2" />
            Contrast
          </Button>
          <Button
            variant={
              activeTool === cornerstoneTools.PanTool.toolName
                ? "default"
                : "outline-solid"
            }
            size="sm"
            onClick={() => setTool(cornerstoneTools.PanTool.toolName)}
            className={getBtnClass(cornerstoneTools.PanTool.toolName)}
          >
            <Hand className="w-4 h-4 mr-2" />
            Pan
          </Button>
          <Button
            variant={
              activeTool === cornerstoneTools.ZoomTool.toolName
                ? "default"
                : "outline-solid"
            }
            size="sm"
            onClick={() => setTool(cornerstoneTools.ZoomTool.toolName)}
            className={getBtnClass(cornerstoneTools.ZoomTool.toolName)}
          >
            <ZoomIn className="w-4 h-4 mr-2" />
            Zoom
          </Button>

          <div className="w-px h-6 bg-neutral-700 mx-2" />

          <Button
            variant={
              activeTool === cornerstoneTools.RectangleROITool.toolName
                ? "default"
                : "outline-solid"
            }
            size="sm"
            onClick={() => setTool(cornerstoneTools.RectangleROITool.toolName)}
            className={getBtnClass(cornerstoneTools.RectangleROITool.toolName)}
          >
            <RectangleHorizontal className="w-4 h-4 mr-2" />
            Rectangle
          </Button>
          <Button
            variant={
              activeTool === cornerstoneTools.EllipticalROITool.toolName
                ? "default"
                : "outline-solid"
            }
            size="sm"
            onClick={() => setTool(cornerstoneTools.EllipticalROITool.toolName)}
            className={getBtnClass(cornerstoneTools.EllipticalROITool.toolName)}
          >
            <CircleDot className="w-4 h-4 mr-2" />
            Ellipse
          </Button>
          <Button
            variant={
              activeTool === cornerstoneTools.PlanarFreehandROITool.toolName
                ? "default"
                : "outline-solid"
            }
            size="sm"
            onClick={() =>
              setTool(cornerstoneTools.PlanarFreehandROITool.toolName)
            }
            className={getBtnClass(
              cornerstoneTools.PlanarFreehandROITool.toolName,
            )}
          >
            <Pencil className="w-4 h-4 mr-2" />
            Freehand
          </Button>

          <div className="w-px h-6 bg-neutral-700 mx-2" />

          <Button
            variant="outline-solid"
            size="sm"
            onClick={rotateImage}
            className="text-neutral-300 border-neutral-700 hover:bg-neutral-800"
          >
            <RotateCw className="w-4 h-4 mr-2" />
            Rotate
          </Button>
          <Button
            variant="outline-solid"
            size="sm"
            onClick={resetView}
            className="text-neutral-300 border-neutral-700 hover:bg-neutral-800"
          >
            <Undo2 className="w-4 h-4 mr-2" />
            Reset
          </Button>

          <div className="w-px h-6 bg-neutral-700 mx-2" />

          <Button
            variant={showMetadata ? "default" : "outline-solid"}
            size="sm"
            onClick={() => setShowMetadata(!showMetadata)}
            className={
              showMetadata
                ? "bg-blue-600 text-white border-none"
                : "text-neutral-300 border-neutral-700 hover:bg-neutral-800"
            }
          >
            <Info className="w-4 h-4 mr-2" />
            Tags
          </Button>
        </div>

        {/* Right Side Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline-solid"
            size="sm"
            onClick={toggleFullscreen}
            className="text-neutral-300 border-neutral-700 hover:bg-neutral-800"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </Button>

          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-neutral-400 hover:text-white hover:bg-neutral-800"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Viewport Area */}
      <div className="flex-1 relative bg-black flex overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
              <p className="text-neutral-400 text-sm">
                Initializing Rendering Engine...
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
            <div className="bg-red-900/20 border border-red-800 p-6 rounded-lg text-center">
              <p className="text-red-400 font-semibold mb-2">
                Error Loading DICOM
              </p>
              <p className="text-red-300 text-sm">{error}</p>
              <Button
                onClick={onClose}
                className="mt-4 bg-red-900 hover:bg-red-800 text-white"
              >
                Close
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 relative">
          <div
            ref={viewerRef}
            className="w-full h-full outline-hidden"
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>

        {/* Shared Metadata Panel */}
        {showMetadata && (
          <MetadataPanel
            metadata={metadata}
            loading={isMetadataLoading}
            error={metadataError}
            searchQuery={tagSearchQuery}
            onSearchChange={setTagSearchQuery}
          />
        )}
      </div>

      {/* Footer with image counter */}
      <div className="bg-neutral-900 border-t border-neutral-800 px-4 py-1.5 text-neutral-500 text-[10px] flex items-center justify-between">
        {imageIds.length > 1 && (
          <span className="text-neutral-400 font-medium">
            Image {currentIndex + 1} / {imageIds.length}
          </span>
        )}

        <div className="flex gap-4">
          <span>Left Click: {activeTool}</span>
          <span>Wheel/Arrows: Stack Scroll</span>
          <span>Right Click: Zoom</span>
        </div>
      </div>
    </div>
  );
}
