import { useState, useEffect, useRef } from "react";
import { useSearchStore } from "@/stores/SearchStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Eye,
  Image as ImageIcon,
  LayoutGrid,
  List,
  FileText,
  ArrowLeft,
} from "lucide-react";
import { dicoogleService } from "@/services/dicoogleService";
import { ImageList } from "./components/ImageList";
import { DICOMDumpModal } from "./components/DICOMDumpModal";
import { QuickViewer } from "./components/QuickViewer";
import { AdvancedViewer } from "./components/AdvancedViewer";
import type { Study, Series } from "@/types";

interface SeriesViewerProps {
  study: Study;
}

export function SeriesViewer({ study }: SeriesViewerProps) {
  const { selectedSeries, deselectStudy } = useSearchStore();
  const series = selectedSeries || [];
  const containerRef = useRef<HTMLDivElement>(null);

  // Navigation state
  const [selectedSeriesForImages, setSelectedSeriesForImages] =
    useState<Series | null>(null);

  // Viewer states
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentSeries, setCurrentSeries] = useState<Series | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showAdvancedViewer, setShowAdvancedViewer] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  // DICOM Dump Modal state
  const [dumpModalOpen, setDumpModalOpen] = useState(false);
  const [dumpSopInstanceUID, setDumpSopInstanceUID] = useState<string | null>(
    null,
  );
  const [dumpSearchQuery, setDumpSearchQuery] = useState("");

  // Auto-scroll to SeriesViewer when mounted or when navigating back from images
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selectedSeriesForImages]); // Re-scroll when toggling between series list and image list

  // --- Handlers ---

  const handleBackToStudies = () => {
    deselectStudy(); // Safely deselect the current study
  };

  const handleOpenQuickViewer = (s: Series, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!s.images || s.images.length === 0) return;
    setCurrentSeries(s);
    setCurrentImageIndex(0);
    setViewerOpen(true);
    setShowAdvancedViewer(false);
  };

  const handleShowImages = (s: Series, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedSeriesForImages(s);
  };

  const handleBackToSeries = () => {
    setSelectedSeriesForImages(null);
  };

  const handleCardClick = (s: Series) => {
    handleShowImages(s);
  };

  const handleViewImageQuick = (sopIndex: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!selectedSeriesForImages) return;
    setCurrentSeries(selectedSeriesForImages);
    setCurrentImageIndex(sopIndex);
    setViewerOpen(true);
    setShowAdvancedViewer(false);
  };

  const handleViewImageAdvanced = (sopIndex: number) => {
    if (!selectedSeriesForImages) return;
    setCurrentSeries(selectedSeriesForImages);
    setCurrentImageIndex(sopIndex);
    setViewerOpen(false);
    setShowAdvancedViewer(true);
  };

  const handleOpenDump = (sopInstanceUID: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDumpSopInstanceUID(sopInstanceUID);
    setDumpSearchQuery("");
    setDumpModalOpen(true);
  };

  const handleCloseDump = () => {
    setDumpModalOpen(false);
    setDumpSopInstanceUID(null);
    setDumpSearchQuery("");
  };

  const handleCloseQuickViewer = () => {
    setViewerOpen(false);
    setCurrentSeries(null);
    setCurrentImageIndex(0);
  };

  const handleCloseAdvancedViewer = () => {
    setShowAdvancedViewer(false);
    setCurrentSeries(null);
    setCurrentImageIndex(0);
  };

  const handleSwitchToAdvanced = () => {
    setViewerOpen(false);
    setShowAdvancedViewer(true);
  };

  if (series.length === 0) {
    return (
      <Card ref={containerRef}>
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

  // If a series is selected, show the image list
  if (selectedSeriesForImages) {
    return (
      <div ref={containerRef}>
        <ImageList
          series={selectedSeriesForImages}
          onViewQuick={handleViewImageQuick}
          onViewAdvanced={handleViewImageAdvanced}
          onViewDump={handleOpenDump}
          onBack={handleBackToSeries}
        />

        {/* --- Quick Viewer --- */}
        {viewerOpen && currentSeries && (
          <QuickViewer
            series={currentSeries}
            initialIndex={currentImageIndex}
            onClose={handleCloseQuickViewer}
            onOpenAdvanced={handleSwitchToAdvanced}
          />
        )}

        {/* --- Advanced Viewer --- */}
        {showAdvancedViewer && currentSeries && (
          <AdvancedViewer
            series={currentSeries}
            initialIndex={currentImageIndex}
            onClose={handleCloseAdvancedViewer}
          />
        )}

        {/* --- DICOM DUMP MODAL --- */}
        {dumpModalOpen && dumpSopInstanceUID && (
          <DICOMDumpModal
            sopInstanceUID={dumpSopInstanceUID}
            searchQuery={dumpSearchQuery}
            onSearchChange={setDumpSearchQuery}
            onClose={handleCloseDump}
          />
        )}
      </div>
    );
  }

  // Otherwise show the series list
  return (
    <div ref={containerRef}>
      {/* --- Series List --- */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button size="sm" variant="ghost" onClick={handleBackToStudies}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Studies
              </Button>
              <div className="border-l border-border h-8" />
              <div>
                <CardTitle>Series for Selected Study</CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {study.patientName} -{" "}
                  {study.studyDescription || "No description"}
                </p>
              </div>
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
                  onClick={() => handleCardClick(s)}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-primary-500 transition-colors group flex flex-col h-full cursor-pointer"
                >
                  <div className="w-full h-40 bg-gray-100 dark:bg-gray-800 rounded-md mb-3 relative overflow-hidden group-hover:opacity-90 transition-opacity flex-shrink-0">
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
                  </div>

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

                  <div className="grid grid-cols-2 gap-2 mt-auto pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => handleOpenQuickViewer(s, e)}
                      disabled={!s.images || s.images.length === 0}
                      className="w-full text-xs px-2"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" /> View
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => handleShowImages(s, e)}
                      disabled={!s.images || s.images.length === 0}
                      className="w-full text-xs px-2"
                    >
                      <FileText className="w-3.5 h-3.5 mr-1.5" /> Images
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
                  onClick={() => handleCardClick(s)}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-primary-500 transition-colors flex gap-4 cursor-pointer"
                >
                  <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-md relative overflow-hidden hover:opacity-90 transition-opacity flex-shrink-0">
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
                  </div>

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

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleOpenQuickViewer(s, e)}
                        disabled={!s.images || s.images.length === 0}
                      >
                        <Eye className="w-4 h-4 mr-1" /> View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleShowImages(s, e)}
                        disabled={!s.images || s.images.length === 0}
                      >
                        <FileText className="w-4 h-4 mr-1" /> View Images
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Quick Viewer --- */}
      {viewerOpen && currentSeries && (
        <QuickViewer
          series={currentSeries}
          initialIndex={currentImageIndex}
          onClose={handleCloseQuickViewer}
          onOpenAdvanced={handleSwitchToAdvanced}
        />
      )}

      {/* --- Advanced Viewer --- */}
      {showAdvancedViewer && currentSeries && (
        <AdvancedViewer
          series={currentSeries}
          initialIndex={currentImageIndex}
          onClose={handleCloseAdvancedViewer}
        />
      )}
    </div>
  );
}
