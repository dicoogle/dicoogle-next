import { useState, Suspense } from "react";
import { useSearchStore } from "@/stores/SearchStore";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Calendar,
  User,
  FileText,
  ChevronRight,
  X,
  MapPin,
  ChevronLeft,
  LayoutList,
  Grid3X3,
} from "lucide-react";
import type { Study } from "@/types";
import {
  useResultOptionsExtensions,
  useResultBatchExtensions,
  useResultRendererExtensions,
  usePluginContext,
  invokeResultOptionAction,
  invokeResultBatchAction,
} from "@/plugin-system";

interface StudyListProps {
  studies: Study[];
}

interface StudyItemProps {
  study: Study;
  isSelected: boolean;
  onClick: () => void;
  index?: number;
}

const ITEMS_PER_PAGE_CARD = 3;
const ITEMS_PER_PAGE_LIST = 10;

const formatDate = (date?: string) => {
  if (!date) return "N/A";
  const year = date.substring(0, 4);
  const month = date.substring(4, 6);
  const day = date.substring(6, 8);
  return `${year}-${month}-${day}`;
};

const TableHeader = ({ showActions }: { showActions: boolean }) => (
  <div
    className={`grid ${showActions ? "grid-cols-[60px_1fr_140px_120px_80px_120px]" : "grid-cols-[60px_1fr_140px_120px_80px]"} items-center gap-3 py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-border`}
  >
    <div className="text-center">#</div>
    <div>Patient Name</div>
    <div>Study Date</div>
    <div>Modality</div>
    <div className="text-right">UID</div>
    {showActions && <div className="text-right">Actions</div>}
  </div>
);

const StudyCard = ({ study, isSelected, onClick }: StudyItemProps) => {
  const optionExtensions = useResultOptionsExtensions();
  const context = usePluginContext();

  return (
    <Card
      className={`transition-all cursor-pointer ${
        isSelected ? "ring-2 ring-primary-500 shadow-lg" : "hover:shadow-md"
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
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
                  {study.modality}
                </div>
              )}
              {study.InstitutionName && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {study.InstitutionName}
                </div>
              )}
            </div>
            {study.studyDescription && (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {study.studyDescription}
              </p>
            )}
            <details
              className="text-xs text-gray-500 dark:text-gray-400"
              onClick={(e) => e.stopPropagation()}
            >
              <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                Study UID
              </summary>
              <code className="block mt-1 bg-gray-100 dark:bg-gray-800 p-2 rounded font-mono">
                {study.studyInstanceUID}
              </code>
            </details>

            {optionExtensions.length > 0 && (
              <div
                className="flex items-center gap-2 pt-2"
                onClick={(e) => e.stopPropagation()}
              >
                {optionExtensions.filter(
                  (ext) => !ext.condition || ext.condition(study),
                )
                  .map((ext) => (
                    <Button
                      key={ext.id}
                      variant="outline-solid"
                      size="sm"
                      onClick={() => invokeResultOptionAction(ext, study, context)}
                    >
                      {ext.icon}
                      {ext.label}
                    </Button>
                  ))}
              </div>
            )}
          </div>
          <div className="flex items-center ml-4">
            {isSelected ? (
              <X className="w-5 h-5 text-primary-500" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const StudyListItem = ({
  study,
  isSelected,
  onClick,
  index = 0,
  showActions = true,
}: StudyItemProps & { showActions?: boolean }) => {
  const optionExtensions = useResultOptionsExtensions();
  const context = usePluginContext();

  return (
    <div
      className={`grid ${showActions ? "grid-cols-[60px_1fr_140px_120px_80px_120px]" : "grid-cols-[60px_1fr_140px_120px_80px]"} items-center gap-3 py-2 px-3 rounded-lg transition-all cursor-pointer hover:bg-muted/50 dark:hover:bg-muted ${
        isSelected
          ? "bg-primary-50 dark:bg-primary-950/50 border border-primary-500"
          : "border border-border"
      }`}
      onClick={onClick}
    >
      <div className="text-center text-xs font-mono text-gray-600 dark:text-gray-400">
        {index}
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1">
          <User className="w-3 h-3 text-gray-500 shrink-0" />
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {study.patientName || "Unknown Patient"}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
          ID: {study.patientID || "N/A"}
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs">
        <Calendar className="w-3 h-3 text-gray-500 shrink-0" />
        <span className="truncate">{formatDate(study.studyDate)}</span>
      </div>
      <div className="text-xs">
        {study.modality ? (
          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded whitespace-nowrap">
            {study.modality}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 text-right truncate">
        {study.studyInstanceUID.slice(-8)}
      </div>
      {showActions && (
        <div
          className="flex items-center justify-end gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {optionExtensions
            .filter((ext) => !ext.condition || ext.condition(study))
            .map((ext) => (
              <Button
                key={ext.id}
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => invokeResultOptionAction(ext, study, context)}
              >
                {ext.icon}
              </Button>
            ))}
        </div>
      )}
    </div>
  );
};

export function StudyList({ studies }: StudyListProps) {
  const { selectStudy, selectedStudy, results } = useSearchStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<string>("list");
  const rendererExtensions = useResultRendererExtensions();
  const optionExtensions = useResultOptionsExtensions();
  const batchExtensions = useResultBatchExtensions();
  const context = usePluginContext();
  const isCustomRendererView = rendererExtensions.some((r) => r.id === viewMode);

  const hasActions = optionExtensions.length > 0;

  const handleStudyClick = (study: Study) => {
    selectStudy(study);
  };

  const filteredStudies = selectedStudy
    ? studies.filter(
        (s) => s.studyInstanceUID === selectedStudy.studyInstanceUID,
      )
    : studies;

  const itemsPerPage =
    viewMode === "list" || isCustomRendererView
      ? ITEMS_PER_PAGE_LIST
      : ITEMS_PER_PAGE_CARD;
  const totalPages = Math.ceil(filteredStudies.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedStudies = filteredStudies.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  const handleViewModeChange = (newMode: string) => {
    setViewMode(newMode);
    setCurrentPage(1);
  };

  const resetToPage1 = (study: Study) => {
    handleStudyClick(study);
    if (!selectedStudy) {
      setCurrentPage(1);
    }
  };

  const renderContent = () => {
    if (displayedStudies.length === 0 && !selectedStudy) {
      return (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p>No studies to display</p>
        </div>
      );
    }

    const customRenderer = rendererExtensions.find((r) => r.id === viewMode);
    if (customRenderer) {
      const RendererComponent = customRenderer.component;

      // Filter raw results to match displayed studies
      const displayedStudyUIDs = new Set(
        displayedStudies.map((s) => s.studyInstanceUID),
      );
      const displayedResults = results.filter(
        (r) =>
          displayedStudyUIDs.has(r.fields.StudyInstanceUID) ||
          displayedStudyUIDs.has(r.fields.studyInstanceUID),
      );

      return (
        <Suspense fallback={<div>Loading...</div>}>
          <RendererComponent
            results={displayedResults}
            loading={false}
            context={context}
            onResultSelect={(result) => {
              // Find the study that matches this result
              const studyUID =
                result.fields.StudyInstanceUID ||
                result.fields.studyInstanceUID;
              const study = studies.find(
                (s) => s.studyInstanceUID === studyUID,
              );
              if (study) {
                handleStudyClick(study);
              }
            }}
          />
        </Suspense>
      );
    }

    if (viewMode === "list") {
      return (
        <div className="space-y-1">
          <TableHeader showActions={hasActions} />
          <div className="space-y-0.5">
            {displayedStudies.map((study, index) => (
              <StudyListItem
                key={study.studyInstanceUID}
                study={study}
                isSelected={
                  selectedStudy?.studyInstanceUID === study.studyInstanceUID
                }
                onClick={() => resetToPage1(study)}
                index={startIndex + index + 1}
                showActions={hasActions}
              />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-3">
        {displayedStudies.map((study) => (
          <StudyCard
            key={study.studyInstanceUID}
            study={study}
            isSelected={
              selectedStudy?.studyInstanceUID === study.studyInstanceUID
            }
            onClick={() => resetToPage1(study)}
          />
        ))}
      </div>
    );
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

        {!selectedStudy && filteredStudies.length > itemsPerPage && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {currentPage} of {totalPages}
          </span>
        )}

        {!selectedStudy && batchExtensions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Batch Actions (All Results)
            </span>
            {batchExtensions.map((ext) => (
              <Button
                key={ext.id}
                variant="outline-solid"
                size="sm"
                disabled={filteredStudies.length === 0}
                onClick={() =>
                  invokeResultBatchAction(ext, filteredStudies, context, {
                    searchResults: results,
                  })
                }
              >
                {ext.icon}
                {ext.label}
              </Button>
            ))}
          </div>
        )}

        {/* Only show view mode buttons if there are results and renderer plugins exist */}
        {!selectedStudy &&
          filteredStudies.length > 0 &&
          rendererExtensions.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline-solid"
                size="sm"
                onClick={() => handleViewModeChange("list")}
                className={viewMode === "list" ? "border-primary" : ""}
              >
                <LayoutList className="w-4 h-4 mr-1" />
                List
              </Button>
              <Button
                variant="outline-solid"
                size="sm"
                onClick={() => handleViewModeChange("card")}
                className={viewMode === "card" ? "border-primary" : ""}
              >
                <Grid3X3 className="w-4 h-4 mr-1" />
                Cards
              </Button>

              {rendererExtensions.map((ext) => (
                <Button
                  key={ext.id}
                  variant="outline-solid"
                  size="sm"
                  onClick={() => handleViewModeChange(ext.id)}
                  className={viewMode === ext.id ? "border-primary" : ""}
                >
                  {ext.icon}
                  {ext.name}
                </Button>
              ))}
            </div>
          )}
      </div>

      {selectedStudy && filteredStudies.length > 0 ? (
        <StudyCard
          key={selectedStudy.studyInstanceUID}
          study={selectedStudy}
          isSelected={true}
          onClick={() => resetToPage1(selectedStudy)}
        />
      ) : (
        renderContent()
      )}

      {!selectedStudy && filteredStudies.length > itemsPerPage && (
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="outline-solid"
            size="sm"
            onClick={handlePreviousPage}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline-solid"}
                size="sm"
                onClick={() => setCurrentPage(page)}
                className="w-8 h-8 p-0"
              >
                {page}
              </Button>
            ))}
          </div>

          <Button
            variant="outline-solid"
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
