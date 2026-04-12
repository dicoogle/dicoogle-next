import { useMemo } from "react";
import {
  X,
  Info,
  Loader2,
  AlertCircle,
  Search as SearchIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useMetadata } from "../hooks/useMetadata";
import { usePagination } from "../hooks/usePagination";

interface DICOMDumpModalProps {
  sopInstanceUID: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClose: () => void;
}

const PAGE_SIZE = 7;

export function DICOMDumpModal({
  sopInstanceUID,
  searchQuery,
  onSearchChange,
  onClose,
}: DICOMDumpModalProps) {
  const { metadata, loading, error } = useMetadata(sopInstanceUID, true);

  // Filter tags based on search query
  const filteredTags = useMemo(() => {
    if (!metadata) return [];
    const entries = Object.entries(metadata.fields);
    if (!searchQuery.trim()) return entries;

    const query = searchQuery.toLowerCase();
    return entries.filter(([k, v]) => {
      return (
        k.toLowerCase().includes(query) ||
        String(v).toLowerCase().includes(query)
      );
    });
  }, [metadata, searchQuery]);

  const pagination = usePagination(filteredTags, PAGE_SIZE);

  return (
    <div className="fixed inset-0 z-[1002] bg-black/80 backdrop-blur-sm flex items-center justify-center !mt-0">
      <div className="bg-card border border-border rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Info className="w-5 h-5" /> DICOM Metadata Dump
            </h3>
            <p className="text-xs text-muted-foreground font-mono mt-1 truncate max-w-2xl">
              {sopInstanceUID}
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
              placeholder="Search tags..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          {searchQuery && (
            <p className="text-xs text-muted-foreground mt-2">
              Found {filteredTags.length} matching tags
            </p>
          )}
        </div>

        {/* Metadata Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <span className="ml-3 text-muted-foreground">
                Loading metadata...
              </span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <AlertCircle className="w-12 h-12 text-destructive mb-3" />
              <p className="text-destructive font-medium">
                Failed to load metadata
              </p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          ) : filteredTags.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <AlertCircle className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No tags match your search</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pagination.paginatedItems.map(([k, v]) => (
                <div
                  key={k}
                  className="border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    {k}
                  </div>
                  <div className="text-sm font-mono text-foreground break-all">
                    {String(v)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with Pagination */}
        {!loading && !error && filteredTags.length > 0 && (
          <div className="p-5 border-t border-border bg-muted/30">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {pagination.startIndex + 1} - {pagination.endIndex} of{" "}
                {filteredTags.length} tags
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
