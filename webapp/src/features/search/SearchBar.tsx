import { useState, FormEvent, useEffect } from "react";
import { useSearchStore } from "@/stores/SearchStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Search, X } from "lucide-react";
import { dicoogleService } from "@/services/dicoogleService";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const { search, clearResults } = useSearchStore();

  // Fetch available providers on mount
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const providers = await dicoogleService.getQueryProviders();
        setAvailableProviders(providers);
      } catch (error) {
        console.error("Failed to fetch query providers:", error);
      }
    };
    fetchProviders();
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    // If query is empty, search for all (*:*)
    const searchQuery = query.trim() || "*:*";

    search({
      query: searchQuery,
      // If no providers selected, pass undefined to search all
      providers: selectedProviders.length > 0 ? selectedProviders : undefined,
    });
  };

  const handleClear = () => {
    setQuery("");
    clearResults();
  };

  const toggleProvider = (provider: string) => {
    setSelectedProviders(prev => 
      prev.includes(provider)
        ? prev.filter(p => p !== provider)
        : [...prev, provider]
    );
  };

  const selectAllProviders = () => {
    setSelectedProviders([]);
  };

  return (
    <div className="space-y-4">
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
        <Button type="submit">
          <Search className="w-4 h-4 mr-2" />
          Search
        </Button>
      </form>

      {/* Provider selection */}
      {availableProviders.length > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-600 dark:text-gray-400 font-medium">
            Providers:
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAllProviders}
              className={`px-3 py-1 rounded-md transition-colors ${
                selectedProviders.length === 0
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              All
            </button>
            {availableProviders.map(provider => (
              <button
                key={provider}
                type="button"
                onClick={() => toggleProvider(provider)}
                className={`px-3 py-1 rounded-md transition-colors ${
                  selectedProviders.includes(provider)
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {provider}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
