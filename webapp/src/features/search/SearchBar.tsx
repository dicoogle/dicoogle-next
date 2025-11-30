import { useState, FormEvent } from "react";
import { useSearchStore } from "@/stores/SearchStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Search, X } from "lucide-react";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const { search, clearResults } = useSearchStore();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    search({
      query: query.trim(),
    });
  };

  const handleClear = () => {
    setQuery("");
    clearResults();
  };

  return (
    <div className="space-y-4">
      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 relative">
          <Input
            type="text"
            placeholder='Enter search query (e.g., "Modality:CT" or "chest CT")'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pr-10"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>
        <Button type="submit" disabled={!query.trim()}>
          <Search className="w-4 h-4 mr-2" />
          Search
        </Button>
      </form>
    </div>
  );
}
