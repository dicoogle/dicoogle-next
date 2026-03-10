import { useEffect } from "react";
import { DicomViewerLazy } from "@/components/dicom/DicomViewerLazy";
import { dicoogleService } from "@/services/dicoogleService";
import type { Series } from "@/types";

interface AdvancedViewerProps {
  series: Series;
  initialIndex?: number;
  onClose: () => void;
}

export function AdvancedViewer({
  series,
  initialIndex = 0,
  onClose,
}: AdvancedViewerProps) {
  const getSeriesUrls = () => {
    if (!series.images) return [];
    return series.images.map((img) =>
      dicoogleService.getDICOMFileUrl(img.sopInstanceUID),
    );
  };

  // Global keyboard handler for Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!series.images || series.images.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-black/95 flex flex-col">
      {/* Cornerstone Viewer fills everything; toolbar/header are handled inside */}
      <div className="flex-1 bg-black">
        <DicomViewerLazy
          imageUrls={getSeriesUrls()}
          initialIndex={initialIndex}
          onClose={onClose}
          title={`Series #${series.seriesNumber} — ${series.seriesDescription || "No description"
            }`}
        />
      </div>
    </div>
  );
}
