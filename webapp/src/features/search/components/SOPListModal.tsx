import { useMemo } from "react";
import {
  X,
  Search as SearchIcon,
  AlertCircle,
  Eye,
  MonitorPlay,
  Info,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { dicoogleService } from "@/services/dicoogleService";
import { usePagination } from "../hooks/usePagination";
import type { Series } from "@/types";

interface SOPListModalProps {
  series: Series;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onViewQuick: (sopIndex: number) => void;
  onViewAdvanced: (sopIndex: number) => void;
  onViewDump: (sopInstanceUID: string) => void;
  onClose: () => void;
}

const PAGE_SIZE = 10;

export function SOPListModal({
  series,
  searchQuery,
  onSearchChange,
  onViewQuick,
  onViewAdvanced,
  onViewDump,
  onClose,
}: SOPListModalProps) {
  // Filter SOPs based on search query
  const filteredSops = useMemo(() => {
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

  const pagination = usePagination(filteredSops, PAGE_SIZE);

  return (
    <div className="fixed inset-0 z-[1001] bg-black/80 backdrop-blur-sm flex items-center justify-center !mt-0">
      <div className="bg-card border border-border rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="text-xl font-semibold text-foreground">
              SOP Instances - Series #{series.seriesNumber}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {series.seriesDescription || "No description"} •{" "}
              {series.images?.length || 0} total images
            </p>
          </div>
          <button
            onClick={onClose}
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
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          {searchQuery && (
            <p className="text-xs text-muted-foreground mt-2">
              Found {filteredSops.length} matching images
            </p>
          )}
        </div>

        {/* SOP List */}
        <div className="flex-1 overflow-y-auto p-5">
          {filteredSops.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <AlertCircle className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                No images match your search
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pagination.paginatedItems.map((image) => {
                // Find the actual index in the original array
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
                        title="View DICOM Dump"
                      >
                        <Info className="w-4 h-4 mr-2" /> Tags
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer with Pagination */}
        {filteredSops.length > 0 && (
          <div className="p-5 border-t border-border bg-muted/30">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {pagination.startIndex + 1} - {pagination.endIndex} of{" "}
                {filteredSops.length} images
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
          </div>
        )}
      </div>
    </div>
  );
}
