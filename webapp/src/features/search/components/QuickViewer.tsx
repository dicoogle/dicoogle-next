import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, X, Info, Loader2, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { dicoogleService } from "@/services/dicoogleService";
import { MetadataPanel } from "./MetadataPanel";
import { useMetadata } from "../hooks/useMetadata";
import type { Series, Image as DICOMImage } from "@/types";

interface QuickViewerProps {
  series: Series;
  initialIndex?: number;
  onClose: () => void;
  onOpenAdvanced?: () => void;
}

export function QuickViewer({
  series,
  initialIndex = 0,
  onClose,
  onOpenAdvanced,
}: QuickViewerProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(initialIndex);
  const [showMetadata, setShowMetadata] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState("");

  const currentImage: DICOMImage | undefined = series.images?.[currentImageIndex];

  // Use metadata hook
  const {
    metadata,
    loading: metadataLoading,
    error: metadataError,
  } = useMetadata(currentImage?.sopInstanceUID || null, showMetadata);

  // Handlers
  const handleNextImage = () => {
    if (!series.images) return;
    setCurrentImageIndex((prev) =>
      prev < series.images.length - 1 ? prev + 1 : prev,
    );
  };

  const handlePreviousImage = () => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") handleNextImage();
    if (e.key === "ArrowLeft") handlePreviousImage();
    if (e.key === "Escape") onClose();
    if (e.key === "i" || e.key === "I") setShowMetadata((prev) => !prev);
  };

  useEffect(() => {
    if (currentImage) {
      setImageLoading(true);
    }
  }, [currentImage]);

  if (!series.images || series.images.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-sm flex items-center justify-center !mt-0"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Top Bar */}
      <div className="absolute top-4 left-4 right-4 flex justify-between z-50 pointer-events-none">
        <div className="flex gap-4 pointer-events-auto items-center">
          <div className="bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700 text-white text-sm font-mono">
            {currentImageIndex + 1} / {series.images.length}
          </div>

          {onOpenAdvanced && (
            <Button
              onClick={onOpenAdvanced}
              size="sm"
              className="bg-blue-600/80 hover:bg-blue-600 text-white border border-blue-500/50"
            >
              <MonitorPlay className="w-4 h-4 mr-2" /> Open Workstation
            </Button>
          )}
        </div>

        <div className="flex gap-2 pointer-events-auto">
          <button
            onClick={() => setShowMetadata((prev) => !prev)}
            className={`p-2 rounded-lg border ${
              showMetadata
                ? "bg-blue-600 border-blue-500 text-white"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
            }`}
            title="View Metadata"
          >
            <Info className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 bg-gray-800 border border-gray-700 rounded-lg text-white hover:bg-red-900/50 hover:border-red-800"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex w-full h-full pt-16 pb-4 px-4 gap-4">
        <div className="flex-1 relative flex items-center justify-center">
          <button
            onClick={handlePreviousImage}
            className="absolute left-0 p-4 text-white hover:text-blue-400 transition-colors z-40 disabled:opacity-30 disabled:hover:text-white"
            disabled={currentImageIndex === 0}
          >
            <ChevronLeft className="w-10 h-10" />
          </button>

          <div className="relative max-h-full max-w-full">
            {imageLoading && (
              <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 text-blue-500 animate-spin" />
            )}
            {currentImage && (
              <img
                src={dicoogleService.getImage(currentImage.sopInstanceUID)}
                className="max-h-[85vh] object-contain transition-opacity duration-200"
                style={{ opacity: imageLoading ? 0.5 : 1 }}
                onLoad={() => setImageLoading(false)}
                alt="DICOM Preview"
              />
            )}
          </div>

          <button
            onClick={handleNextImage}
            className="absolute right-0 p-4 text-white hover:text-blue-400 transition-colors z-40 disabled:opacity-30 disabled:hover:text-white"
            disabled={currentImageIndex === series.images.length - 1}
          >
            <ChevronRight className="w-10 h-10" />
          </button>
        </div>

        {/* Shared Metadata Panel */}
        {showMetadata && (
          <MetadataPanel
            metadata={metadata}
            loading={metadataLoading}
            error={metadataError}
            searchQuery={tagSearchQuery}
            onSearchChange={setTagSearchQuery}
          />
        )}
      </div>
    </div>
  );
}
