import { X, MonitorPlay } from "lucide-react";
import { DicomViewer } from "@/components/dicom/CornerstoneViewport";
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

  if (!series.images || series.images.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-black/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/80">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <MonitorPlay className="w-4 h-4" /> DICOM Viewer - Series #{" "}
            {series.seriesNumber}
          </h3>
          <p className="text-xs text-muted-foreground">
            {series.seriesDescription || "No description"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Cornerstone Viewer */}
      <div className="flex-1 bg-black">
        <DicomViewer
          imageUrls={getSeriesUrls()}
          initialIndex={initialIndex}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
