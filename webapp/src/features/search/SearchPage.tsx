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
import { Loader2, Search as SearchIcon } from "lucide-react";

export function SearchPage() {
  const { studies, loading, error, selectedStudy, query } = useSearchStore();

  return (
    <div className="space-y-6 px-16">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Search Medical Images
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Search DICOM studies using Lucene query syntax or free-text search
        </p>
      </div>

      {/* Search section */}
      <Card>
        <CardHeader>
          <CardTitle>Search Criteria</CardTitle>
          <CardDescription>
            Use query syntax (e.g., &quot;Modality:CT&quot;) or free-text search
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SearchBar />
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">
            Searching...
          </span>
        </div>
      )}

      {/* Error state */}
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

      {/* Results */}
      {!loading && studies.length > 0 && (
        <div className="space-y-6">
          {/* Results info */}
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

          {/* Study list */}
          <StudyList studies={studies} />

          {/* Series viewer (when study is selected) */}
          {selectedStudy && <SeriesViewer study={selectedStudy} />}
        </div>
      )}

      {/* Empty state */}
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

      {/* Initial state */}
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
  );
}
