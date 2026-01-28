import { useSearchStore } from "@/stores/SearchStore";
import { SearchBar } from "./SearchBar";
import { StudyList } from "./StudyList";
import { SeriesViewer } from "./SeriesViewer";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import {
  Loader2,
  Search as SearchIcon,
  Filter,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState, useEffect, Suspense, useMemo } from "react";
import { useEnabledPlugins, usePluginContext } from "@/plugin-system";
import { Button } from "@/components/ui/Button";

export function SearchPage() {
  const {
    studies,
    loading,
    error,
    selectedStudy,
    query,
    search,
    clearResults,
  } = useSearchStore();
  const [showFilters, setShowFilters] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const plugins = useEnabledPlugins();
  const context = usePluginContext();

  const filterExtensions = useMemo(
    () =>
      plugins.flatMap((plugin) =>
        plugin.getQueryFilterExtensions
          ? plugin.getQueryFilterExtensions()
          : [],
      ),
    [plugins],
  );

  // Initialize filter values with defaults
  useEffect(() => {
    const initialValues: Record<string, any> = {};
    filterExtensions.forEach((ext) => {
      initialValues[ext.id] = ext.defaultValue;
    });
    setFilterValues(initialValues);
  }, [filterExtensions]);

  // Cleanup: Clear search results when leaving the page
  useEffect(() => {
    return () => {
      clearResults();
    };
  }, [clearResults]);

  // Count active filters
  const activeFilterCount = filterExtensions.filter((ext) => {
    const value = filterValues[ext.id];
    if (typeof value === "object" && value !== null) {
      return value.enabled === true;
    }
    return value !== ext.defaultValue && value !== null && value !== "";
  }).length;

  const handleFilterChange = (filterId: string, value: any) => {
    setFilterValues((prev) => ({
      ...prev,
      [filterId]: value,
    }));

    // If there's an active query, re-run the search with filters applied
    if (query) {
      // Build filter query parts
      const filterParts: string[] = [];

      // Apply this filter
      const filter = filterExtensions.find((f) => f.id === filterId);
      if (filter && filter.applyFilter) {
        const filterQuery = filter.applyFilter(value);
        if (filterQuery) {
          filterParts.push(filterQuery);
        }
      }

      // Apply other active filters
      Object.entries(filterValues).forEach(([id, val]) => {
        if (id !== filterId) {
          const otherFilter = filterExtensions.find((f) => f.id === id);
          if (otherFilter && otherFilter.applyFilter) {
            const filterQuery = otherFilter.applyFilter(val);
            if (filterQuery) {
              filterParts.push(filterQuery);
            }
          }
        }
      });

      // Combine base query with filters
      const baseQuery = query
        .split(" AND ")
        .filter(
          (part) =>
            !filterExtensions.some(
              (ext) => ext.applyFilter && part.includes(ext.id),
            ),
        )
        .join(" AND ");

      const fullQuery = [baseQuery, ...filterParts]
        .filter(Boolean)
        .join(" AND ");

      // Re-run search with filtered query
      search({ query: fullQuery });
    }
  };

  return (
    <div className="px-16 h-[calc(100vh-3.5rem)] overflow-y-auto">
      <div className="max-w-8xl mx-auto space-y-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Search Criteria</CardTitle>
            <CardDescription>
              Use query syntax (e.g., &quot;Modality:CT&quot;) or free-text
              search
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SearchBar />
          </CardContent>
        </Card>

        {/* Only show filters card if there are filter plugins */}
        {filterExtensions.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-gray-500" />
                  <CardTitle className="text-lg">Filters</CardTitle>
                  {activeFilterCount > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-white bg-blue-600 rounded-full">
                      {activeFilterCount}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className="gap-1"
                >
                  {showFilters ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      Hide
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Show
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {showFilters && (
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filterExtensions
                    .sort((a, b) => (a.order || 999) - (b.order || 999))
                    .map((ext) => {
                      const FilterComponent = ext.component;
                      return (
                        <div
                          key={ext.id}
                          className="p-4 border border-border rounded-lg bg-card"
                        >
                          <div className="mb-3">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                              {ext.label}
                            </h3>
                            {ext.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {ext.description}
                              </p>
                            )}
                          </div>
                          <Suspense
                            fallback={
                              <div className="text-xs text-gray-500">
                                Loading...
                              </div>
                            }
                          >
                            <FilterComponent
                              value={filterValues[ext.id] ?? ext.defaultValue}
                              onChange={(value) =>
                                handleFilterChange(ext.id, value)
                              }
                              context={context}
                            />
                          </Suspense>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            <span className="ml-3 text-gray-600 dark:text-gray-400">
              Searching...
            </span>
          </div>
        )}

        {error && (
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <SearchIcon className="w-5 h-5" />
                <p>{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && studies.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <p>
                Found{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {studies.length}
                </span>{" "}
                studies
                {query && (
                  <span>
                    {" "}
                    for query:{" "}
                    <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                      {query}
                    </span>
                  </span>
                )}
              </p>
            </div>

            <StudyList studies={studies} />

            {selectedStudy && <SeriesViewer study={selectedStudy} />}
          </div>
        )}

        {!loading && !error && studies.length === 0 && query && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <SearchIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  No results found
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Try adjusting your search criteria or use different keywords
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && !query && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <SearchIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Ready to search
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Enter your search criteria above to find DICOM studies
                </p>
                <div className="max-w-md mx-auto text-left space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <p className="font-semibold">Example queries:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>
                      <code className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                        Modality:CT
                      </code>{" "}
                      - Find CT scans
                    </li>
                    <li>
                      <code className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                        PatientName:Smith*
                      </code>{" "}
                      - Find patients with surname Smith
                    </li>
                    <li>
                      <code className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                        StudyDate:[20230101 TO 20231231]
                      </code>{" "}
                      - Studies from 2023
                    </li>
                    <li>
                      <code className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                        chest CT
                      </code>{" "}
                      - Free-text search
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
