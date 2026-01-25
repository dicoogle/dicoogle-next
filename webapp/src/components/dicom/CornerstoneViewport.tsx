import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as cornerstone from "@cornerstonejs/core";
import { Enums as csEnums } from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { initializeCornerstone } from "@/utils/cornerstoneInit";
import { Button } from "@/components/ui/Button";
import { dicoogleService } from "@/services/dicoogleService";
import {
  ZoomIn,
  Move,
  Maximize2,
  RotateCw,
  Settings,
  X,
  Loader2,
  Square,
  Pen,
  Info,
  Circle,
} from "lucide-react";

interface DicomViewerProps {
  imageUrls: string[];
  initialIndex?: number;
  onClose?: () => void;
  title?: string;
}

const RENDERING_ENGINE_ID = "dicoogleViewerEngine";
const VIEWPORT_ID = "dicoogleViewport";
const TOOL_GROUP_ID = "dicoogleToolGroup";

// Global tracker to manage cache persistence across component mounts
let lastSeriesSignature: string | null = null;

export function DicomViewer({
  imageUrls,
  initialIndex = 0,
  onClose,
  title,
}: DicomViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tools
  const [activeTool, setActiveTool] = useState<string>(
    cornerstoneTools.WindowLevelTool.toolName,
  );

  // Metadata States
  const [showMetadata, setShowMetadata] = useState(false);
  const [currentImageId, setCurrentImageId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [metadata, setMetadata] = useState<any>(null);
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);

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

  // 4. Prefetch Images & Progressive Stack Update
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

  // 5. Dynamic Stack Update (Blocking Logic)
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

  // --- Metadata Fetching ---
  useEffect(() => {
    if (!showMetadata || !currentImageId) return;

    const fetchMetadata = async () => {
      setIsMetadataLoading(true);
      try {
        const match = currentImageId.match(/uid=([^&]*)/);
        if (match && match[1]) {
          const uid = match[1];
          const data = await dicoogleService.getDICOMMetadata(uid);
          setMetadata(data.results?.fields || data.results);
        }
      } catch (e) {
        console.error("Failed to fetch metadata", e);
      } finally {
        setIsMetadataLoading(false);
      }
    };

    fetchMetadata();
  }, [currentImageId, showMetadata]);

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
    <div className="fixed inset-0 bg-black z-[100] flex flex-col font-sans">
      {/* Header */}
      <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-3 flex items-center justify-between relative select-none">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 px-2 py-1 rounded text-xs font-bold text-white">
            CS3D
          </div>
          <div>
            <h2 className="text-white font-semibold text-sm">
              {title || "Advanced Workstation"}
            </h2>
            {imageIds.length > 1 && (
              <p className="text-neutral-400 text-xs flex items-center gap-2">
                <span>
                  Image:{" "}
                  <span className="text-white font-mono">
                    {currentIndex + 1}
                  </span>{" "}
                  / {imageIds.length}
                </span>
                {loadedCount < imageIds.length && (
                  <span className="text-blue-400 ml-2">
                    {/* Safe Percentage Calculation */}
                    (Downloading:{" "}
                    {imageIds.length > 0
                      ? Math.round((loadedCount / imageIds.length) * 100)
                      : 0}
                    %)
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
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

        {/* PROGRESS & POSITION BAR */}
        {imageIds.length > 1 && (
          <div
            ref={progressBarRef}
            className="absolute bottom-0 left-0 h-1.5 bg-neutral-800 w-full cursor-pointer hover:h-2.5 transition-all group"
            onMouseDown={handleMouseDown}
          >
            {/* 1. Blue Bar: Download Progress */}
            <div
              className="absolute top-0 left-0 h-full bg-blue-900/60 transition-all duration-300 ease-out pointer-events-none"
              style={{ width: `${(loadedCount / imageIds.length) * 100}%` }}
            />

            {/* 2. White Indicator: Current Scroll Position */}
            <div
              className="absolute top-0 h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] z-10 transition-all duration-75 pointer-events-none"
              style={{
                // SAFE MATH: Prevent division by zero if length is 1 or less
                left: `${imageIds.length > 1 ? (currentIndex / (imageIds.length < 1 ? -1 : imageIds.length)) * 100 : 0}%`,
                width: `max(20px, ${imageIds.length > 0 ? 100 / imageIds.length : 100}%)`,
              }}
            />
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-2 flex items-center gap-2 justify-center overflow-x-auto">
        <Button
          variant={
            activeTool === cornerstoneTools.WindowLevelTool.toolName
              ? "default"
              : "outline"
          }
          size="sm"
          onClick={() => setTool(cornerstoneTools.WindowLevelTool.toolName)}
          className={getBtnClass(cornerstoneTools.WindowLevelTool.toolName)}
        >
          <Settings className="w-4 h-4 mr-2" />
          Levels
        </Button>
        <Button
          variant={
            activeTool === cornerstoneTools.PanTool.toolName
              ? "default"
              : "outline"
          }
          size="sm"
          onClick={() => setTool(cornerstoneTools.PanTool.toolName)}
          className={getBtnClass(cornerstoneTools.PanTool.toolName)}
        >
          <Move className="w-4 h-4 mr-2" />
          Pan
        </Button>
        <Button
          variant={
            activeTool === cornerstoneTools.ZoomTool.toolName
              ? "default"
              : "outline"
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
              : "outline"
          }
          size="sm"
          onClick={() => setTool(cornerstoneTools.RectangleROITool.toolName)}
          className={getBtnClass(cornerstoneTools.RectangleROITool.toolName)}
        >
          <Square className="w-4 h-4 mr-2" />
          Rect ROI
        </Button>
        <Button
          variant={
            activeTool === cornerstoneTools.EllipticalROITool.toolName
              ? "default"
              : "outline"
          }
          size="sm"
          onClick={() => setTool(cornerstoneTools.EllipticalROITool.toolName)}
          className={getBtnClass(cornerstoneTools.EllipticalROITool.toolName)}
        >
          <Circle className="w-4 h-4 mr-2" />
          Circle
        </Button>
        <Button
          variant={
            activeTool === cornerstoneTools.PlanarFreehandROITool.toolName
              ? "default"
              : "outline"
          }
          size="sm"
          onClick={() =>
            setTool(cornerstoneTools.PlanarFreehandROITool.toolName)
          }
          className={getBtnClass(
            cornerstoneTools.PlanarFreehandROITool.toolName,
          )}
        >
          <Pen className="w-4 h-4 mr-2" />
          Freehand
        </Button>

        <div className="w-px h-6 bg-neutral-700 mx-2" />

        <Button
          variant="outline"
          size="sm"
          onClick={rotateImage}
          className="text-neutral-300 border-neutral-700 hover:bg-neutral-800"
        >
          <RotateCw className="w-4 h-4 mr-2" />
          Rotate
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={resetView}
          className="text-neutral-300 border-neutral-700 hover:bg-neutral-800"
        >
          <Maximize2 className="w-4 h-4 mr-2" />
          Reset
        </Button>

        <div className="w-px h-6 bg-neutral-700 mx-2" />

        <Button
          variant={showMetadata ? "default" : "outline"}
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
            className="w-full h-full outline-none"
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>

        {/* Metadata Sidebar */}
        {showMetadata && (
          <div className="w-80 bg-neutral-900 border-l border-neutral-800 overflow-y-auto z-10 transition-all duration-300">
            <div className="p-4">
              <h3 className="text-white font-semibold mb-4 flex items-center justify-between">
                <span>DICOM Tags</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMetadata(false)}
                  className="h-6 w-6 p-0 hover:bg-neutral-800 text-neutral-400"
                >
                  <X className="w-4 h-4" />
                </Button>
              </h3>

              {isMetadataLoading ? (
                <div className="flex flex-col items-center justify-center py-10 text-neutral-500">
                  <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  <span className="text-xs">Reading Tags...</span>
                </div>
              ) : metadata ? (
                <div className="space-y-2 font-mono text-[10px] text-neutral-300">
                  {Object.entries(metadata).map(([key, value]) => (
                    <div
                      key={key}
                      className="border-b border-neutral-800 pb-1 break-words"
                    >
                      <span className="text-neutral-500 block mb-0.5">
                        {key}
                      </span>
                      <span className="select-text">{String(value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-500 text-sm text-center py-4">
                  No metadata available
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Instructions */}
      <div className="bg-neutral-900 border-t border-neutral-800 px-4 py-1.5 text-neutral-500 text-[10px] flex justify-between">
        <span>Left Click: {activeTool}</span>
        <span>Wheel: Stack Scroll</span>
        <span>Right Click: Zoom (always active)</span>
      </div>
    </div>
  );
}
