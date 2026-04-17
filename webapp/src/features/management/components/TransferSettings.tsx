// webapp/src/features/management/components/TransferSettings.tsx
import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  dicoogleService,
  type PaginatedTransferSyntax,
} from "@/services/dicoogleService";
import { toast } from "@/utils/toast";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Search,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

export function TransferSettings() {
  const [data, setData] = useState<PaginatedTransferSyntax>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 5,
  });
  const [loading, setLoading] = useState(true);
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const result = await dicoogleService.getTransferSyntaxesPaginated(
        searchTerm,
        currentPage,
        data.pageSize,
      );
      setData(result);
    } catch (err) {
      toast.error("Failed to load transfer settings");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, currentPage, data.pageSize]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleToggleOption = async (
    uid: string,
    option: string,
    currentValue: boolean,
  ) => {
    try {
      await dicoogleService.setTransferSyntaxOption(uid, option, !currentValue);
      // Optimistic update
      setData((prev) => ({
        ...prev,
        items: prev.items.map((s) => {
          if (s.uid !== uid) return s;
          return {
            ...s,
            options: s.options.map((o) =>
              o.name === option ? { ...o, value: !currentValue } : o,
            ),
          };
        }),
      }));
      toast.success("Option updated");
    } catch (err) {
      toast.error("Failed to update option");
      loadSettings(); // Revert on error
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to page 1 on new search
  };

  const totalPages = Math.ceil(data.total / data.pageSize);

  if (loading && data.items.length === 0) {
    return <div>Loading settings...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Storage Transfer Capabilities
        </h2>
        <p className="text-sm text-muted-foreground">
          Configure accepted transfer syntaxes for each SOP Class.
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by SOP name or UID..."
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Results Count */}
      <div className="text-sm text-muted-foreground">
        Showing {data.items.length} of {data.total} transfer syntaxes
      </div>

      {/* List */}
      <div className="grid gap-2">
        {data.items.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No transfer syntaxes found matching "{searchTerm}"
          </Card>
        ) : (
          data.items.map((syntax) => (
            <Card key={syntax.uid} className="overflow-hidden">
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() =>
                  setExpandedUid(expandedUid === syntax.uid ? null : syntax.uid)
                }
              >
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{syntax.sop_name}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {syntax.uid}
                  </span>
                </div>
                {expandedUid === syntax.uid ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>

              {expandedUid === syntax.uid && (
                <div className="border-t bg-muted/20 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {syntax.options.map((option) => (
                      <label
                        key={option.name}
                        className="flex items-center gap-3 p-2 rounded hover:bg-background border border-transparent hover:border-border cursor-pointer"
                      >
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center ${option.value ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground"}`}
                        >
                          {option.value && <Check className="h-3 w-3" />}
                        </div>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={option.value}
                          onChange={() =>
                            handleToggleOption(
                              syntax.uid,
                              option.name,
                              option.value,
                            )
                          }
                        />
                        <span className="text-sm">{option.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline-solid"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline-solid"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || loading}
            >
              Next
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
