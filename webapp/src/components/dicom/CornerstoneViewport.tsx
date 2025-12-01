import { useEffect, useRef, useState } from "react";
import * as cornerstone from "@cornerstonejs/core";
import { Enums as csEnums } from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { initCornerstone } from "@/utils/cornerstone-init";
import { Button } from "@/components/ui/Button";
import { apiService } from "@/services/api"; // Import API service
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
  Info, // Import Info icon
} from "lucide-react";

interface DicomViewerProps {
  imageUrls: string[];
  onClose?: () => void;
  title?: string;
}

const RENDERING_ENGINE_ID = "dicoogleViewerEngine";
const VIEWPORT_ID = "dicoogleViewport";
const TOOL_GROUP_ID = "dicoogleToolGroup";

export function DicomViewer({ imageUrls, onClose, title }: DicomViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string>("WindowLevel");

  // Metadata States
  const [showMetadata, setShowMetadata] = useState(false);
  const [currentImageId, setCurrentImageId] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);

  const isSetupRef = useRef(false);
  const renderingEngineRef = useRef<cornerstone.RenderingEngine | null>(null);

  useEffect(() => {
    const setup = async () => {
      if (!viewerRef.current || isSetupRef.current) return;

      try {
        setIsLoading(true);
        isSetupRef.current = true;

        await initCornerstone();

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

        const imageIds = imageUrls.map((url) => {
          if (url.startsWith("wadouri:") || url.startsWith("dicomweb:"))
            return url;
          const fullUrl = url.startsWith("http")
            ? url
            : `${window.location.origin}${url}`;
          return `wadouri:${fullUrl}`;
        });

        await viewport.setStack(imageIds);
        viewport.render();

        // Set initial image ID
        setCurrentImageId(imageIds[0]);

        // Add Event Listener for Stack Scroll
        element.addEventListener(csEnums.Events.STACK_NEW_IMAGE, (evt: any) => {
          setCurrentImageId(evt.detail.imageId);
        });

        const {
          WindowLevelTool,
          PanTool,
          ZoomTool,
          StackScrollMouseWheelTool,
          RectangleROITool,
          PlanarFreehandROITool,
        } = cornerstoneTools;

        [
          WindowLevelTool,
          PanTool,
          ZoomTool,
          StackScrollMouseWheelTool,
          RectangleROITool,
          PlanarFreehandROITool,
        ].forEach((tool) => {
          try {
            if (tool) cornerstoneTools.addTool(tool);
          } catch (e) {
            // Tool already added
          }
        });

        try {
          cornerstoneTools.ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID);
        } catch (e) {
          console.log(e);
        }

        const toolGroup =
          cornerstoneTools.ToolGroupManager.createToolGroup(TOOL_GROUP_ID);

        if (toolGroup) {
          toolGroup.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID);

          toolGroup.addTool(WindowLevelTool.toolName);
          toolGroup.addTool(PanTool.toolName);
          toolGroup.addTool(ZoomTool.toolName);
          toolGroup.addTool(StackScrollMouseWheelTool.toolName);
          toolGroup.addTool(RectangleROITool.toolName);
          toolGroup.addTool(PlanarFreehandROITool.toolName);

          toolGroup.setToolActive(WindowLevelTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
            ],
          });

          toolGroup.setToolActive(ZoomTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
            ],
          });

          toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

          toolGroup.setToolPassive(PanTool.toolName);
          toolGroup.setToolPassive(RectangleROITool.toolName);
          toolGroup.setToolPassive(PlanarFreehandROITool.toolName);
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
  }, [imageUrls]);

  // --- Metadata Fetching Effect ---
  useEffect(() => {
    if (!showMetadata || !currentImageId) return;

    const fetchMetadata = async () => {
      setIsMetadataLoading(true);
      try {
        // Extract UID from the wadouri URL (e.g., ...?uid=1.2.3...)
        const match = currentImageId.match(/uid=([^&]*)/);
        if (match && match[1]) {
          const uid = match[1];
          const data = await apiService.getDICOMMetadata(uid);
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

  // --- Tool Switching Helpers ---
  const setTool = (toolName: string) => {
    const toolGroup =
      cornerstoneTools.ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
    if (!toolGroup) return;

    const primaryTools = [
      "WindowLevel",
      "Pan",
      "Zoom",
      "RectangleROI",
      "PlanarFreehandROI",
    ];

    primaryTools.forEach((t) => {
      if (t !== "Zoom" && t !== toolName) {
        toolGroup.setToolPassive(t);
      }
    });

    if (toolName === "Zoom") {
      toolGroup.setToolActive("Zoom", {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
        ],
      });
    } else {
      toolGroup.setToolActive("Zoom", {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
        ],
      });

      toolGroup.setToolActive(toolName, {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
        ],
      });
    }

    setActiveTool(toolName);
  };

  const resetView = () => {
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
      viewport.setViewPresentation({ rotation: ((rotation ?? 0) + 90) % 360 });
      viewport.render();
    }
  };

  const getBtnClass = (name: string) =>
    activeTool === name
      ? "bg-blue-600 hover:bg-blue-700 text-white border-none"
      : "text-neutral-300 border-neutral-700 hover:bg-neutral-800";

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col font-sans">
      {/* Header */}
      <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 px-2 py-1 rounded text-xs font-bold text-white">
            CS3D
          </div>
          <div>
            <h2 className="text-white font-semibold text-sm">
              {title || "Advanced Workstation"}
            </h2>
            {imageUrls.length > 1 && (
              <p className="text-neutral-400 text-xs">
                Stack Size: {imageUrls.length} images
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
      </div>

      {/* Toolbar */}
      <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-2 flex items-center gap-2 justify-center overflow-x-auto">
        <Button
          variant={activeTool === "WindowLevel" ? "default" : "outline"}
          size="sm"
          onClick={() => setTool("WindowLevel")}
          className={getBtnClass("WindowLevel")}
        >
          <Settings className="w-4 h-4 mr-2" />
          Levels
        </Button>
        <Button
          variant={activeTool === "Pan" ? "default" : "outline"}
          size="sm"
          onClick={() => setTool("Pan")}
          className={getBtnClass("Pan")}
        >
          <Move className="w-4 h-4 mr-2" />
          Pan
        </Button>
        <Button
          variant={activeTool === "Zoom" ? "default" : "outline"}
          size="sm"
          onClick={() => setTool("Zoom")}
          className={getBtnClass("Zoom")}
        >
          <ZoomIn className="w-4 h-4 mr-2" />
          Zoom
        </Button>

        <div className="w-px h-6 bg-neutral-700 mx-2" />

        <Button
          variant={activeTool === "RectangleROI" ? "default" : "outline"}
          size="sm"
          onClick={() => setTool("RectangleROI")}
          className={getBtnClass("RectangleROI")}
        >
          <Square className="w-4 h-4 mr-2" />
          Rect ROI
        </Button>
        <Button
          variant={activeTool === "PlanarFreehandROI" ? "default" : "outline"}
          size="sm"
          onClick={() => setTool("PlanarFreehandROI")}
          className={getBtnClass("PlanarFreehandROI")}
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

        {/* Metadata Toggle Button */}
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

        {/* The Container for Cornerstone */}
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
