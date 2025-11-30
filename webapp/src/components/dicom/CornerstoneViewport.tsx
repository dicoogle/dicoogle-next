import { useEffect, useRef, useState } from "react";
import * as cornerstone from "@cornerstonejs/core";
import { Enums as csEnums } from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { initCornerstone } from "@/utils/cornerstone-init";
import { Button } from "@/components/ui/Button";
import {
  ZoomIn,
  Move,
  Maximize2,
  RotateCw,
  Settings,
  X,
  Loader2,
  Square,
  Circle,
  Pen,
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
  const isSetupRef = useRef(false);
  const renderingEngineRef = useRef<cornerstone.RenderingEngine | null>(null);

  useEffect(() => {
    const setup = async () => {
      // Prevent double-initialization in React Strict Mode
      if (!viewerRef.current || isSetupRef.current) return;

      try {
        setIsLoading(true);
        isSetupRef.current = true;

        // 1. Init Global Cornerstone
        await initCornerstone();

        // 2. Create Rendering Engine
        const existingEngine =
          cornerstone.getRenderingEngine(RENDERING_ENGINE_ID);
        if (existingEngine) existingEngine.destroy();

        const renderingEngine = new cornerstone.RenderingEngine(
          RENDERING_ENGINE_ID,
        );
        renderingEngineRef.current = renderingEngine;

        // 3. Enable Viewport
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

        // 4. Load Images
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

        // 5. Setup Tools (SAFE MODE)
        const {
          WindowLevelTool,
          PanTool,
          ZoomTool,
          RectangleROITool,
          EllipticalROITool,
          PlanarFreehandROITool,
          StackScrollMouseWheelTool,
        } = cornerstoneTools;

        [
          WindowLevelTool,
          PanTool,
          ZoomTool,
          StackScrollMouseWheelTool,
          RectangleROITool,
          PlanarFreehandROITool,
          EllipticalROITool,
        ].forEach((tool) => {
          try {
            cornerstoneTools.addTool(tool);
          } catch (e) {}
        });

        // 6. Setup ToolGroup
        try {
          cornerstoneTools.ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID);
        } catch (e) {}

        const toolGroup =
          cornerstoneTools.ToolGroupManager.createToolGroup(TOOL_GROUP_ID);

        if (toolGroup) {
          toolGroup.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID);

          // Add tools to the group
          toolGroup.addTool(WindowLevelTool.toolName);
          toolGroup.addTool(PanTool.toolName);
          toolGroup.addTool(ZoomTool.toolName);
          toolGroup.addTool(StackScrollMouseWheelTool.toolName);
          toolGroup.addTool(RectangleROITool.toolName);
          toolGroup.addTool(EllipticalROITool.toolName);
          toolGroup.addTool(PlanarFreehandROITool.toolName);

          // --- Set Active Tools ---

          // 1. Left Click: Window/Level (Default)
          toolGroup.setToolActive(WindowLevelTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
            ],
          });

          // 2. Right Click: Zoom (Fixed)
          toolGroup.setToolActive(ZoomTool.toolName, {
            bindings: [
              { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
            ],
          });

          // 3. Wheel: Stack Scroll
          toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

          // Set others as passive
          toolGroup.setToolPassive(PanTool.toolName);
          toolGroup.setToolPassive(RectangleROITool.toolName);
          toolGroup.setToolPassive(EllipticalROITool.toolName);
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

  // --- Tool Switching Helpers ---
  const setTool = (toolName: string) => {
    const toolGroup =
      cornerstoneTools.ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
    if (!toolGroup) return;

    // Exclusive Left-Click tools
    // Note: Use 'RectangleROI' and 'EllipseROI' to match toolName properties
    const primaryTools = [
      "WindowLevel",
      "Pan",
      "Zoom",
      cornerstoneTools.RectangleROITool.toolName,
      cornerstoneTools.EllipticalROITool.toolName,
      cornerstoneTools.PlanarFreehandROITool.toolName,
    ];

    // 1. Disable other primary tools (EXCEPT Zoom, see logic below)
    primaryTools.forEach((t) => {
      if (t !== "Zoom" && t !== toolName) {
        toolGroup.setToolPassive(t);
      }
    });

    // 2. Configure Zoom Persistence
    // If the user selects "Zoom" as the main tool, we want it on Left AND Right click.
    // If the user selects another tool (e.g., Pan), we want Zoom ONLY on Right click.
    if (toolName === "Zoom") {
      toolGroup.setToolActive("Zoom", {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
        ],
      });
    } else {
      // Ensure Zoom stays active on Right Click when switching to other tools
      toolGroup.setToolActive("Zoom", {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
        ],
      });

      // Activate the requested tool on Left Click
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
      viewport.setViewPresentation({ rotation: (rotation + 90) % 360 });
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

        {/* ROI Tools */}
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
          Ellipse
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
          Free hand
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
      </div>

      {/* Viewport Area */}
      <div className="flex-1 relative bg-black">
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
        <div
          ref={viewerRef}
          className="w-full h-full outline-none"
          onContextMenu={(e) => e.preventDefault()}
        />
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
