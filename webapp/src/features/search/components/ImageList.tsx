import { useMemo, useState } from "react";
import {
  Search as SearchIcon,
  AlertCircle,
  Eye,
  MonitorPlay,
  Info,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  LayoutGrid,
  List,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { dicoogleService } from "@/services/dicoogleService";
import { usePagination } from "../hooks/usePagination";
import type { Series } from "@/types";

interface ImageListProps {
  series: Series;
  onViewQuick: (sopIndex: number) => void;
  onViewAdvanced: (sopIndex: number) => void;
  onViewDump: (sopInstanceUID: string) => void;
  onBack: () => void;
}

const PAGE_SIZE = 10;

export function ImageList({
  series,
  onViewQuick,
  onViewAdvanced,
  onViewDump,
  onBack,
}: ImageListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Filter SOPs based on search query
  const filteredImages = useMemo(() => {
    if (!series.images) return [];
    if (!searchQuery.trim()) return series.images;

    const query = searchQuery.toLowerCase();
    return series.images.filter((image) => {
      const uidMatch = image.sopInstanceUID.toLowerCase().includes(query);
      const instanceMatch = image.instanceNumber
        ? String(image.instanceNumber).includes(query)
        : false;
      return uidMatch || instanceMatch;
    });
  }, [series.images, searchQuery]);

  const pagination = usePagination(filteredImages, PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button size="sm" variant="ghost" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Series
            </Button>
            <div className="border-l border-border h-8" />
            <div>
              <CardTitle>Images - Series #{series.seriesNumber}</CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {series.seriesDescription || "No description"} •{" "}
                {series.images?.length || 0} total images
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
        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by SOP UID or Instance Number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          {searchQuery && (
            <p className="text-xs text-muted-foreground mt-2">
              Found {filteredImages.length} matching images
            </p>
          )}
        </div>

        {/* Image List */}
        {filteredImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12">
            <AlertCircle className="w-12 h-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No images match your search</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagination.paginatedItems.map((image) => {
              const absoluteIndex = series.images!.findIndex(
                (img) => img.sopInstanceUID === image.sopInstanceUID,
              );
              return (
                <div
                  key={image.sopInstanceUID}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-primary-500 transition-colors group flex flex-col h-full"
                >
                  <div className="w-full h-40 bg-gray-100 dark:bg-gray-800 rounded-md mb-3 relative overflow-hidden group-hover:opacity-90 transition-opacity flex-shrink-0">
                    <img
                      src={dicoogleService.getThumbnail(image.sopInstanceUID)}
                      alt={`Image ${absoluteIndex + 1}`}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>

                  <div className="flex-1 space-y-1 mb-3">
                    <div className="text-xs text-muted-foreground">
                      {image.instanceNumber && (
                        <div className="font-medium">Instance: {image.instanceNumber}</div>
                      )}
                      <div className="font-mono truncate" title={image.sopInstanceUID}>
                        UID: {image.sopInstanceUID.slice(-12)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-auto pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onViewQuick(absoluteIndex)}
                      className="w-full text-xs px-2"
                      title="View in Quick Viewer"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" /> Quick
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onViewAdvanced(absoluteIndex)}
                      className="w-full text-xs px-2 bg-blue-600 hover:bg-blue-700 text-white"
                      title="View in Advanced Viewer"
                    >
                      <MonitorPlay className="w-3.5 h-3.5 mr-1" /> Advanced
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onViewDump(image.sopInstanceUID)}
                      className="w-full text-xs px-2"
                      title="View DICOM Tags"
                    >
                      <Info className="w-3.5 h-3.5 mr-1" /> Tags
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {pagination.paginatedItems.map((image) => {
              const absoluteIndex = series.images!.findIndex(
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
                      src={dicoogleService.getThumbnail(image.sopInstanceUID)}
                      alt={`Image ${absoluteIndex + 1}`}
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
                      onClick={() => onViewQuick(absoluteIndex)}
                      title="View in Quick Viewer"
                    >
                      <Eye className="w-4 h-4 mr-2" /> Quick
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onViewAdvanced(absoluteIndex)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      title="View in Advanced Viewer"
                    >
                      <MonitorPlay className="w-4 h-4 mr-2" /> Advanced
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onViewDump(image.sopInstanceUID)}
                      title="View DICOM Tags"
                    >
                      <Info className="w-4 h-4 mr-2" /> Tags
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {filteredImages.length > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Showing {pagination.startIndex + 1} - {pagination.endIndex} of{" "}
              {filteredImages.length} images
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={pagination.previousPage}
                disabled={pagination.isFirstPage}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground px-3">
                Page {pagination.currentPage + 1} of {pagination.totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={pagination.nextPage}
                disabled={pagination.isLastPage}
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
