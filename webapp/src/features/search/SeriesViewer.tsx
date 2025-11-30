import { useState, useEffect } from "react";
import { useSearchStore } from "@/stores/SearchStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Eye,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  X,
  Info,
  Loader2,
} from "lucide-react";
import { apiService } from "@/services/api";
import type {
  Study,
  Series,
  Image as DICOMImage,
  DICOMAttribute,
} from "@/types";

interface SeriesViewerProps {
  study: Study;
}

export function SeriesViewer({ study }: SeriesViewerProps) {
  const { selectedSeries } = useSearchStore();
  const series = selectedSeries || [];

  // Viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentSeries, setCurrentSeries] = useState<Series | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showMetadata, setShowMetadata] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  // Metadata state
  const [metadata, setMetadata] = useState<DICOMAttribute | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const currentImage: DICOMImage | undefined =
    currentSeries?.images?.[currentImageIndex];

  const handleOpenViewer = (s: Series) => {
    if (!s.images || s.images.length === 0) return;
    setCurrentSeries(s);
    setCurrentImageIndex(0);
    setViewerOpen(true);
    setShowMetadata(false);
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setCurrentSeries(null);
    setCurrentImageIndex(0);
    setShowMetadata(false);
    setMetadata(null);
    setMetadataError(null);
  };

  const handleNextImage = () => {
    if (!currentSeries?.images) return;
    setCurrentImageIndex((prev) =>
      prev < currentSeries.images.length - 1 ? prev + 1 : prev,
    );
  };

  const handlePreviousImage = () => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") handleNextImage();
    if (e.key === "ArrowLeft") handlePreviousImage();
    if (e.key === "Escape") handleCloseViewer();
    if (e.key === "i" || e.key === "I") setShowMetadata((prev) => !prev);
  };

  // Fetch full dump when image or viewer changes (and metadata panel is open)
  useEffect(() => {
    const loadMetadata = async () => {
      if (!viewerOpen || !currentImage) return;
      setMetadataLoading(true);
      setMetadataError(null);
      try {
        const dump = await apiService.getDICOMMetadata(
          currentImage.sopInstanceUID,
        );

        setMetadata(() => dump.results);
      } catch (err: any) {
        setMetadata(null);
        setMetadataError(err?.message || "Failed to load metadata");
      } finally {
        setMetadataLoading(false);
      }
    };

    loadMetadata();
  }, [viewerOpen, currentImage?.sopInstanceUID, currentImage]);

  if (series.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Series</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 dark:text-gray-400">
            No series found for this study.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Series for Selected Study</CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {study.patientName} - {study.studyDescription || "No description"}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {series.map((s) => (
              <div
                key={s.seriesInstanceUID}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-primary-500 dark:hover:border-primary-400 transition-colors group"
              >
                {/* Series preview - clickable */}
                <button
                  onClick={() => handleOpenViewer(s)}
                  disabled={!s.images || s.images.length === 0}
                  className="w-full flex items-center justify-center h-32 bg-gray-100 dark:bg-gray-800 rounded-md mb-3 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {s.images && s.images.length > 0 ? (
                    <img
                      src={apiService.getThumbnail(s.images[0].sopInstanceUID)}
                      alt="Series thumbnail"
                      className="object-contain w-full h-full"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <ImageIcon className="w-12 h-12 text-gray-400 group-hover:text-gray-500 transition-colors" />
                  )}

                  {s.images && s.images.length > 0 && (
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center">
                      <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}
                </button>

                {/* Series info */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Series #{s.seriesNumber || "N/A"}
                    </span>
                    {s.modality && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        {s.modality}
                      </span>
                    )}
                  </div>

                  {s.seriesDescription && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {s.seriesDescription}
                    </p>
                  )}

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {s.images?.length || 0} images
                  </p>

                  <Button
                    onClick={() => handleOpenViewer(s)}
                    size="sm"
                    className="w-full mt-2"
                    disabled={!s.images || s.images.length === 0}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Quick View{" "}
                    {s.images?.length ? `(${s.images.length})` : "(No images)"}
                  </Button>

                  <details className="text-xs text-gray-500 dark:text-gray-400">
                    <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                      Series UID
                    </summary>
                    <code className="block mt-1 bg-gray-100 dark:bg-gray-800 p-2 rounded font-mono break-all text-[10px]">
                      {s.seriesInstanceUID}
                    </code>
                  </details>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
              <p className="font-semibold">Viewing Options:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  <strong>Quick View:</strong> Basic image preview (click series
                  above)
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {viewerOpen && currentSeries && currentImage && (
        <div
          className="fixed inset-0 z-auto bg-black/95 flex items-center justify-center"
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          {/* Close button */}
          <button
            onClick={handleCloseViewer}
            className="absolute top-4 right-4 z-50 p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white transition-colors"
            title="Close (Esc)"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Metadata toggle button */}
          <button
            onClick={() => setShowMetadata((prev) => !prev)}
            className="absolute top-4 right-16 z-50 p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white transition-colors"
            title="Toggle Metadata (I)"
          >
            <Info className="w-6 h-6" />
          </button>

          {/* Image counter */}
          <div className="absolute top-4 left-4 z-50 px-4 py-2 bg-gray-800 rounded-lg text-white text-sm">
            {currentImageIndex + 1} / {currentSeries.images.length}
          </div>

          <div className="flex w-full h-full">
            {/* Image area, slightly smaller */}
            <div className="flex-1 flex items-center justify-center relative px-8 py-8">
              {currentImageIndex > 0 && (
                <button
                  onClick={handlePreviousImage}
                  className="absolute left-6 z-40 p-3 bg-gray-800 hover:bg-gray-700 rounded-full text-white transition-colors"
                  title="Previous (←)"
                >
                  <ChevronLeft className="w-7 h-7" />
                </button>
              )}

              <div className="relative max-w-[80%] max-h-[80vh] flex items-center justify-center">
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-white animate-spin" />
                  </div>
                )}
                <img
                  src={apiService.getImage(currentImage.sopInstanceUID)}
                  alt={`Image ${currentImageIndex + 1}`}
                  className="max-w-full max-h-full object-contain"
                  onLoad={() => setImageLoading(false)}
                  onError={() => setImageLoading(false)}
                />
              </div>

              {currentImageIndex < currentSeries.images.length - 1 && (
                <button
                  onClick={handleNextImage}
                  className="absolute right-6 z-40 p-3 bg-gray-800 hover:bg-gray-700 rounded-full text-white transition-colors"
                  title="Next (→)"
                >
                  <ChevronRight className="w-7 h-7" />
                </button>
              )}
            </div>

            {/* Metadata sidebar (full dump) */}
            {showMetadata && (
              <div className="w-96 bg-gray-900 text-white overflow-y-auto p-4 border-l border-gray-700">
                <h3 className="text-lg font-semibold mb-4">
                  Image Metadata (Dump)
                </h3>

                {metadataLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading metadata…</span>
                  </div>
                )}

                {metadataError && (
                  <p className="text-sm text-red-400">{metadataError}</p>
                )}

                {!metadataLoading && !metadataError && metadata && (
                  <div className="space-y-3 text-xs">
                    {Object.entries(metadata.fields).map(([key, value]) => (
                      <div key={key} className="border-b border-gray-800 pb-2">
                        <div className="flex justify-between gap-2">
                          <span className="font-mono text-[10px] text-gray-400">
                            {key}
                          </span>
                        </div>

                        <div className="mt-1 text-gray-200 break-words">
                          {value || " "}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-gray-700 text-xs text-gray-400">
                  <p className="font-semibold mb-2">Keyboard Shortcuts:</p>
                  <ul className="space-y-1">
                    <li>← / → : Previous/Next image</li>
                    <li>I : Toggle metadata</li>
                    <li>Esc : Close viewer</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
