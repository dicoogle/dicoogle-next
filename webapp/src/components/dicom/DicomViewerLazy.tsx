import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Lazy load the heavy DICOM viewer component
// This prevents Cornerstone.js (~3MB) from being loaded until needed
const DicomViewerComponent = lazy(() =>
  import("./CornerstoneViewport").then((module) => ({
    default: module.DicomViewer,
  }))
);

interface DicomViewerProps {
  imageUrls: string[];
  initialIndex?: number;
  onClose?: () => void;
  title?: string;
}

/**
 * Lazy-loaded wrapper for DicomViewer
 * 
 * This component dynamically imports the full DICOM viewer only when needed,
 * preventing the heavy Cornerstone.js library from blocking initial app load.
 * 
 * Benefits:
 * - Reduces initial bundle by ~3MB
 * - Improves First Contentful Paint (FCP)
 * - Better perceived performance
 * - WASM files loaded on-demand
 */
export function DicomViewerLazy(props: DicomViewerProps) {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-neutral-300 text-lg font-medium">
              Loading DICOM Viewer...
            </p>
            <p className="text-neutral-500 text-sm mt-2">
              Initializing rendering engine
            </p>
          </div>
        </div>
      }
    >
      <DicomViewerComponent {...props} />
    </Suspense>
  );
}
