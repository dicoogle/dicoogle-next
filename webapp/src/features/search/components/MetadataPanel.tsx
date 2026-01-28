import { Search as SearchIcon, Loader2, AlertCircle } from "lucide-react";
import type { DICOMAttribute } from "@/types";

interface MetadataPanelProps {
  metadata: DICOMAttribute | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function MetadataPanel({
  metadata,
  loading,
  error,
  searchQuery,
  onSearchChange,
}: MetadataPanelProps) {
  return (
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
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading...
        </div>
      ) : error ? (
        <div className="text-red-400 flex items-center gap-2 text-sm p-2 bg-red-900/20 rounded">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      ) : (
        <div className="space-y-2 text-xs font-mono text-gray-300">
          {metadata &&
            Object.entries(metadata.fields)
              .filter(([k, v]) => {
                if (!searchQuery) return true;
                const query = searchQuery.toLowerCase();
                return (
                  k.toLowerCase().includes(query) ||
                  String(v).toLowerCase().includes(query)
                );
              })
              .map(([k, v]) => (
                <div key={k} className="border-b border-gray-800 pb-1">
                  <div className="text-gray-500">{k}</div>
                  <div className="break-all">{String(v)}</div>
                </div>
              ))}
        </div>
      )}
    </div>
  );
}
