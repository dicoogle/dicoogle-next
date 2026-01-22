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
  MonitorPlay,
  AlertCircle,
  LayoutGrid,
  List,
  Search as SearchIcon,
  FileText,
} from "lucide-react";
import { dicoogleService } from "@/services/dicoogleService";
import { DicomViewer } from "@/components/dicom/CornerstoneViewport";
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

  // Quick Viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentSeries, setCurrentSeries] = useState<Series | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showMetadata, setShowMetadata] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [tagSearchQuery, setTagSearchQuery] = useState("");

  // Advanced Viewer state
  const [showAdvancedViewer, setShowAdvancedViewer] = useState(false);

  // SOP List Modal state
  const [sopListModalOpen, setSopListModalOpen] = useState(false);
  const [selectedSeriesForSops, setSelectedSeriesForSops] =
    useState<Series | null>(null);
  const [sopPageIndex, setSopPageIndex] = useState(0);
  const [sopSearchQuery, setSopSearchQuery] = useState("");
  const SOP_PAGE_SIZE = 10;

  // Metadata state
  const [metadata, setMetadata] = useState<DICOMAttribute | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const currentImage: DICOMImage | undefined =
    currentSeries?.images?.[currentImageIndex];

  // --- Handlers ---

  const handleOpenViewer = (s: Series) => {
    if (!s.images || s.images.length === 0) return;
    setCurrentSeries(s);
    setCurrentImageIndex(0);
    setViewerOpen(true);
    setShowMetadata(false);
    setShowAdvancedViewer(false);
  };

  const handleOpenWorkstation = (s: Series) => {
    if (!s.images || s.images.length === 0) return;
    setCurrentSeries(s);
    setViewerOpen(false);
    setShowAdvancedViewer(true);
  };

  const handleOpenSopList = (s: Series) => {
    setSelectedSeriesForSops(s);
    setSopPageIndex(0);
    setSopSearchQuery("");
    setSopListModalOpen(true);
  };

  const handleViewSop = (sopIndex: number) => {
    if (!selectedSeriesForSops) return;
    setCurrentSeries(selectedSeriesForSops);
    setCurrentImageIndex(sopIndex);
    setSopListModalOpen(false);
    setViewerOpen(true);
    setShowMetadata(false);
    setShowAdvancedViewer(false);
  };

  const handleViewSopInAdvanced = (sopIndex: number) => {
    if (!selectedSeriesForSops) return;
    setCurrentSeries(selectedSeriesForSops);
    setCurrentImageIndex(sopIndex);
    setSopListModalOpen(false);
    setViewerOpen(false);
    setShowAdvancedViewer(true);
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setCurrentSeries(null);
    setCurrentImageIndex(0);
    setShowMetadata(false);
    setMetadata(null);
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
    if (showAdvancedViewer) return;
    if (e.key === "ArrowRight") handleNextImage();
    if (e.key === "ArrowLeft") handlePreviousImage();
    if (e.key === "Escape") handleCloseViewer();
    if (e.key === "i" || e.key === "I") setShowMetadata((prev) => !prev);
  };

  // Fix: Reset loading state when image changes
  useEffect(() => {
    if (currentImage) {
      setImageLoading(true);
    }
  }, [currentImage]);

  // Fetch metadata dump
  useEffect(() => {
    const loadMetadata = async () => {
      if (!viewerOpen || !currentImage || !showMetadata) return;
      setMetadataLoading(true);
      setMetadataError(null);
      try {
        const dump = await dicoogleService.getDICOMMetadata(
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
  }, [viewerOpen, currentImage, showMetadata]);

  const getSeriesUrls = () => {
    if (!currentSeries?.images) return [];
    return currentSeries.images.map((img) =>
      dicoogleService.getDICOMFileUrl(img.sopInstanceUID),
    );
  };

  // Filter SOPs based on search query
  const getFilteredSops = () => {
    if (!selectedSeriesForSops?.images) return [];
    if (!sopSearchQuery.trim()) return selectedSeriesForSops.images;

    const query = sopSearchQuery.toLowerCase();
    return selectedSeriesForSops.images.filter((image) => {
      const uidMatch = image.sopInstanceUID.toLowerCase().includes(query);
      const instanceMatch = image.instanceNumber
        ? String(image.instanceNumber).includes(query)
        : false;
      return uidMatch || instanceMatch;
    });
  };

  // Pagination helpers
  const getPaginatedSops = () => {
    const filtered = getFilteredSops();
    const start = sopPageIndex * SOP_PAGE_SIZE;
    const end = start + SOP_PAGE_SIZE;
    return filtered.slice(start, end);
  };

  const getTotalSopPages = () => {
    const filtered = getFilteredSops();
    return Math.ceil(filtered.length / SOP_PAGE_SIZE);
  };

  // Reset to page 0 when search query changes
  useEffect(() => {
    setSopPageIndex(0);
  }, [sopSearchQuery]);

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
      {/* --- Series List (Grid) --- */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Series for Selected Study</CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {study.patientName} -{" "}
                {study.studyDescription || "No description"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={viewMode === "list" ? "default" : "outline"}
                onClick={() => setViewMode("list")}
              >
                <List className="w-4 h-4 mr-1" />
                List
              </Button>
              <Button
                size="sm"
                variant={viewMode === "grid" ? "default" : "outline"}
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="w-4 h-4 mr-1" />
                Grid
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {series.map((s) => (
                <div
                  key={s.seriesInstanceUID}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-primary-500 transition-colors group flex flex-col h-full"
                >
                  <button
                    onClick={() => handleOpenViewer(s)}
                    disabled={!s.images || s.images.length === 0}
                    className="w-full h-40 bg-gray-100 dark:bg-gray-800 rounded-md mb-3 relative overflow-hidden group-hover:opacity-90 transition-opacity flex-shrink-0"
                  >
                    {s.images && s.images.length > 0 ? (
                      <img
                        src={dicoogleService.getThumbnail(
                          s.images[0].sopInstanceUID,
                        )}
                        alt="Thumbnail"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <ImageIcon className="w-12 h-12 text-gray-400 m-auto" />
                    )}
                  </button>

                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm">
                        Series #{s.seriesNumber}
                      </span>
                      <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded">
                        {s.modality || "US"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">
                      {s.seriesDescription || "No description"}
                    </p>
                    <p className="text-xs text-gray-400 pb-2">
                      {s.images?.length || 0} images
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-auto pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenViewer(s)}
                      disabled={!s.images || s.images.length === 0}
                      className="w-full text-xs px-2"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" /> Quick
                    </Button>

                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleOpenWorkstation(s)}
                      disabled={!s.images || s.images.length === 0}
                      className="w-full text-xs px-2 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <MonitorPlay className="w-3.5 h-3.5 mr-1.5" /> Advanced
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenSopList(s)}
                      disabled={!s.images || s.images.length === 0}
                      className="w-full text-xs px-2"
                    >
                      <FileText className="w-3.5 h-3.5 mr-1.5" /> Select Image
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {series.map((s) => (
                <div
                  key={s.seriesInstanceUID}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-primary-500 transition-colors flex gap-4"
                >
                  <button
                    onClick={() => handleOpenViewer(s)}
                    disabled={!s.images || s.images.length === 0}
                    className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-md relative overflow-hidden hover:opacity-90 transition-opacity flex-shrink-0"
                  >
                    {s.images && s.images.length > 0 ? (
                      <img
                        src={dicoogleService.getThumbnail(
                          s.images[0].sopInstanceUID,
                        )}
                        alt="Thumbnail"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-400 m-auto" />
                    )}
                  </button>

                  <div className="flex-1 flex items-center gap-6">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          Series #{s.seriesNumber}
                        </span>
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded">
                          {s.modality || "US"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-1">
                        {s.seriesDescription || "No description"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {s.images?.length || 0} images
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenViewer(s)}
                          disabled={!s.images || s.images.length === 0}
                        >
                          <Eye className="w-4 h-4 mr-1" /> Quick
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleOpenWorkstation(s)}
                          disabled={!s.images || s.images.length === 0}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <MonitorPlay className="w-4 h-4 mr-1" /> Advanced
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenSopList(s)}
                          disabled={!s.images || s.images.length === 0}
                        >
                          <FileText className="w-4 h-4 mr-1" /> Select Image
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Quick Viewer Modal --- */}
      {viewerOpen && currentSeries && currentImage && (
        <div
          className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-sm flex items-center justify-center !mt-0"
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          {/* Top Bar */}
          <div className="absolute top-4 left-4 right-4 flex justify-between z-50 pointer-events-none">
            {/* Left: Info & Workstation */}
            <div className="flex gap-4 pointer-events-auto items-center">
              <div className="bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700 text-white text-sm font-mono">
                {currentImageIndex + 1} / {currentSeries.images.length}
              </div>

              <Button
                onClick={() => {
                  setShowAdvancedViewer(true);
                }}
                size="sm"
                className="bg-blue-600/80 hover:bg-blue-600 text-white border border-blue-500/50"
              >
                <MonitorPlay className="w-4 h-4 mr-2" /> Open Workstation
              </Button>
            </div>

            {/* Right: Controls */}
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
                onClick={handleCloseViewer}
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
              {/* Prev Arrow */}
              <button
                onClick={handlePreviousImage}
                className="absolute left-0 p-4 text-white hover:text-blue-400 transition-colors z-40 disabled:opacity-30 disabled:hover:text-white"
                disabled={currentImageIndex === 0}
              >
                <ChevronLeft className="w-10 h-10" />
              </button>

              {/* Simple Image (JPEG/PNG) */}
              <div className="relative max-h-full max-w-full">
                {imageLoading && (
                  <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 text-blue-500 animate-spin" />
                )}
                <img
                  src={dicoogleService.getImage(currentImage.sopInstanceUID)}
                  className="max-h-[85vh] object-contain transition-opacity duration-200"
                  style={{ opacity: imageLoading ? 0.5 : 1 }}
                  onLoad={() => setImageLoading(false)}
                  // Fix: Removed onLoadStart
                  alt="DICOM Preview"
                />
              </div>

              {/* Next Arrow */}
              <button
                onClick={handleNextImage}
                className="absolute right-0 p-4 text-white hover:text-blue-400 transition-colors z-40 disabled:opacity-30 disabled:hover:text-white"
                disabled={currentImageIndex === currentSeries.images.length - 1}
              >
                <ChevronRight className="w-10 h-10" />
              </button>
            </div>

            {/* Metadata Panel */}
            {showMetadata && (
              <div className="w-80 bg-gray-900 border-l border-gray-700 p-4 overflow-y-auto rounded-lg animate-in slide-in-from-right-10">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                  <h3 className="text-white font-bold">DICOM Tags</h3>
                </div>

                {/* Search box for tags */}
                <div className="mb-4">
                  <div className="relative">
                    <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search tags..."
                      value={tagSearchQuery}
                      onChange={(e) => setTagSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {metadataLoading ? (
                  <div className="text-gray-400 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                  </div>
                ) : metadataError ? (
                  <div className="text-red-400 flex items-center gap-2 text-sm p-2 bg-red-900/20 rounded">
                    <AlertCircle className="w-4 h-4" />
                    <span>{metadataError}</span>
                  </div>
                ) : (
                  <div className="space-y-2 text-xs font-mono text-gray-300">
                    {metadata &&
                      Object.entries(metadata.fields)
                        .filter(([k, v]) => {
                          if (!tagSearchQuery) return true;
                          const query = tagSearchQuery.toLowerCase();
                          return (
                            k.toLowerCase().includes(query) ||
                            String(v).toLowerCase().includes(query)
                          );
                        })
                        .map(([k, v]) => (
                          <div
                            key={k}
                            className="border-b border-gray-800 pb-1"
                          >
                            <div className="text-gray-500">{k}</div>
                            <div className="break-all">{String(v)}</div>
                          </div>
                        ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- ADVANCED VIEWER (Cornerstone) --- */}
      {showAdvancedViewer && currentSeries && (
        <div className="fixed inset-0 z-[1000] bg-black/95 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/80">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <MonitorPlay className="w-4 h-4" /> DICOM Viewer - Series #{" "}
                {currentSeries.seriesNumber}
              </h3>
              <p className="text-xs text-muted-foreground">
                {currentSeries.seriesDescription || "No description"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowAdvancedViewer(false);
                  setCurrentSeries(null);
                }}
                className="p-2 rounded-md hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 bg-black">
            <DicomViewer
              imageUrls={getSeriesUrls()}
              initialIndex={currentImageIndex}
              onClose={() => {
                setShowAdvancedViewer(false);
                setCurrentSeries(null);
              }}
            />
          </div>
        </div>
      )}

      {/* --- SOP LIST MODAL (Bigger & Paginated with Search) --- */}
      {sopListModalOpen && selectedSeriesForSops && (
        <div className="fixed inset-0 z-[1001] bg-black/80 backdrop-blur-sm flex items-center justify-center !mt-0">
          <div className="bg-card border border-border rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h3 className="text-xl font-semibold text-foreground">
                  SOP Instances - Series #{selectedSeriesForSops.seriesNumber}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedSeriesForSops.seriesDescription || "No description"}{" "}
                  • {selectedSeriesForSops.images?.length || 0} total images
                </p>
              </div>
              <button
                onClick={() => setSopListModalOpen(false)}
                className="p-2 rounded-md hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="p-5 border-b border-border">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by SOP UID or Instance Number..."
                  value={sopSearchQuery}
                  onChange={(e) => setSopSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              {sopSearchQuery && (
                <p className="text-xs text-muted-foreground mt-2">
                  Found {getFilteredSops().length} matching images
                </p>
              )}
            </div>

            {/* SOP List */}
            <div className="flex-1 overflow-y-auto p-5">
              {getFilteredSops().length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <AlertCircle className="w-12 h-12 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">
                    No images match your search
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {getPaginatedSops().map((image) => {
                    // Find the actual index in the original array
                    const absoluteIndex =
                      selectedSeriesForSops.images!.findIndex(
                        (img) => img.sopInstanceUID === image.sopInstanceUID,
                      );
                    return (
                      <div
                        key={image.sopInstanceUID}
                        className="border border-border rounded-lg p-4 hover:border-primary transition-colors flex items-center gap-4"
                      >
                        {/* Thumbnail */}
                        <div className="w-20 h-20 bg-muted rounded flex-shrink-0 overflow-hidden">
                          <img
                            src={dicoogleService.getThumbnail(
                              image.sopInstanceUID,
                            )}
                            alt={`SOP ${absoluteIndex + 1}`}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-muted-foreground font-mono max-w-[900px] truncate">
                              UID: {image.sopInstanceUID}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            {image.instanceNumber && (
                              <div>Instance: {image.instanceNumber}</div>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewSop(absoluteIndex)}
                            title="View in Quick Viewer"
                          >
                            <Eye className="w-4 h-4 mr-2" /> Quick
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() =>
                              handleViewSopInAdvanced(absoluteIndex)
                            }
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            title="View in Advanced Viewer"
                          >
                            <MonitorPlay className="w-4 h-4 mr-2" /> Advanced
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer with Pagination */}
            {getFilteredSops().length > 0 && (
              <div className="p-5 border-t border-border bg-muted/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {sopPageIndex * SOP_PAGE_SIZE + 1} -{" "}
                    {Math.min(
                      (sopPageIndex + 1) * SOP_PAGE_SIZE,
                      getFilteredSops().length,
                    )}{" "}
                    of {getFilteredSops().length} images
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSopPageIndex((prev) => Math.max(0, prev - 1))
                      }
                      disabled={sopPageIndex === 0}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                    </Button>
                    <span className="text-sm text-muted-foreground px-3">
                      Page {sopPageIndex + 1} of {getTotalSopPages()}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSopPageIndex((prev) =>
                          Math.min(getTotalSopPages() - 1, prev + 1),
                        )
                      }
                      disabled={sopPageIndex >= getTotalSopPages() - 1}
                    >
                      Next <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
