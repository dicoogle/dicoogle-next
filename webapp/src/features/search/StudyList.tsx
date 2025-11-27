import { useState } from "react";
import { useSearchStore } from "@/stores/SearchStore";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Calendar,
  User,
  FileText,
  ChevronRight,
  ChevronDown,
  MapPin,
  ChevronLeft,
} from "lucide-react";
import type { Study } from "@/types";

interface StudyListProps {
  studies: Study[];
}

const ITEMS_PER_PAGE = 3;

export function StudyList({ studies }: StudyListProps) {
  const { selectStudy, selectedStudy } = useSearchStore();
  const [currentPage, setCurrentPage] = useState(1);

  const handleStudyClick = (study: Study) => {
    selectStudy(study);
  };

  const formatDate = (date?: string) => {
    if (!date) return "N/A";
    // DICOM date format is YYYYMMDD
    const year = date.substring(0, 4);
    const month = date.substring(4, 6);
    const day = date.substring(6, 8);
    return `${year}-${month}-${day}`;
  };

  // Filter: if a study is selected, only show that one
  const filteredStudies = selectedStudy
    ? studies.filter(
        (s) => s.studyInstanceUID === selectedStudy.studyInstanceUID,
      )
    : studies;

  // Pagination
  const totalPages = Math.ceil(filteredStudies.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const displayedStudies = filteredStudies.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  // Reset to page 1 when selection changes
  const handleStudyClickWithReset = (study: Study) => {
    handleStudyClick(study);
    if (!selectedStudy) {
      setCurrentPage(1);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Studies{" "}
          {selectedStudy && (
            <span className="text-sm text-gray-500">(1 selected)</span>
          )}
        </h2>
        {!selectedStudy && filteredStudies.length > ITEMS_PER_PAGE && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {currentPage} of {totalPages}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {displayedStudies.map((study) => {
          const isSelected =
            selectedStudy?.studyInstanceUID === study.studyInstanceUID;

          return (
            <Card
              key={study.studyInstanceUID}
              className={`transition-all cursor-pointer ${
                isSelected
                  ? "ring-2 ring-primary-500 shadow-lg"
                  : "hover:shadow-md"
              }`}
              onClick={() => handleStudyClickWithReset(study)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    {/* Patient info */}
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-500" />
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {study.patientName || "Unknown Patient"}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Patient ID: {study.patientID || "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(study.studyDate)}
                      </div>
                      {study.modality && (
                        <div className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          Modality: {study.modality}
                        </div>
                      )}
                      {study.InstitutionName && (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {study.InstitutionName}
                        </div>
                      )}
                    </div>

                    {/* Study description */}
                    {study.studyDescription && (
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {study.studyDescription}
                      </p>
                    )}

                    {/* Study UID (collapsed by default) */}
                    <details className="text-xs text-gray-500 dark:text-gray-400">
                      <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                        Study UID
                      </summary>
                      <code className="block mt-1 bg-gray-100 dark:bg-gray-800 p-2 rounded font-mono">
                        {study.studyInstanceUID}
                      </code>
                    </details>
                  </div>

                  {/* Action indicator */}
                  <div className="flex items-center ml-4">
                    {isSelected ? (
                      <ChevronDown className="w-5 h-5 text-primary-500" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pagination controls - only show when not viewing a selected study */}
      {!selectedStudy && filteredStudies.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousPage}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(page)}
                className="w-8 h-8 p-0"
              >
                {page}
              </Button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
