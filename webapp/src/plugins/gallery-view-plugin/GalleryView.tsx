import { ResultRendererProps } from "@/plugin-system";
import { SearchResult } from "@/types";
import { useMemo, useState } from "react";
import {
  Calendar,
  Eye,
  FileScan,
  Layers,
  User,
} from "lucide-react";

type TriageRow = {
  key: string;
  patientName: string;
  modality: string;
  studyDate: string;
  studyUID: string;
  seriesUID: string;
  instanceUID: string;
  description: string;
  previewUrl: string | null;
};

export default function StudyTriageWorkspace({
  results,
  loading,
  context,
  onResultSelect,
}: ResultRendererProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const rows = useMemo(() => toTriageRows(results, context), [results, context]);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) =>
        normalizeDate(b.studyDate).localeCompare(normalizeDate(a.studyDate)),
      ),
    [rows],
  );

  const selectedRow =
    sortedRows.find((row) => row.key === selectedKey) || sortedRows[0] || null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-muted-foreground">Loading triage workspace...</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <Layers className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h3 className="text-lg font-semibold">No studies available</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Run a search to review studies in this workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Study Workbench</h2>
            <p className="text-sm text-muted-foreground">
              Left side keeps a paginated study list, right side gives quick preview.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md bg-muted px-2 py-1">
              {sortedRows.length} studies on this page
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">
            Study List
          </div>
          <div className="max-h-[34rem] overflow-auto">
            <div className="grid grid-cols-[2fr_100px_90px_2fr] gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <div>Patient</div>
              <div>Date</div>
              <div>Modality</div>
              <div>Description</div>
            </div>
            {sortedRows.map((row) => {
              const isActive = selectedRow?.key === row.key;
              return (
                <button
                  key={row.key}
                  className={`grid w-full grid-cols-[2fr_100px_90px_2fr] gap-2 border-b border-border px-4 py-3 text-left text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10"
                      : "hover:bg-muted/60"
                  }`}
                  onClick={() => setSelectedKey(row.key)}
                >
                  <div className="truncate font-medium">{row.patientName}</div>
                  <div className="truncate text-muted-foreground">
                    {formatStudyDate(row.studyDate)}
                  </div>
                  <div>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">
                      {row.modality}
                    </span>
                  </div>
                  <div className="truncate text-muted-foreground">
                    {row.description || "No description"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selectedRow && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Selected Study</h3>
              <span className="rounded bg-muted px-2 py-1 text-xs">{selectedRow.modality}</span>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
              <div className="aspect-[4/3] w-full bg-muted">
                {selectedRow.previewUrl ? (
                  <img
                    src={selectedRow.previewUrl}
                    alt={selectedRow.patientName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No preview available
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="inline-flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{selectedRow.patientName}</span>
              </div>
              <div className="inline-flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{formatStudyDate(selectedRow.studyDate)}</span>
              </div>
              <div className="inline-flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">Series: {shortenUid(selectedRow.seriesUID)}</span>
              </div>
              <div className="inline-flex items-center gap-2">
                <FileScan className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">Study: {shortenUid(selectedRow.studyUID)}</span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="col-span-2 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
                onClick={() => {
                  onResultSelect?.(toSearchResult(selectedRow));
                  context.ui?.showToast("Opened selected study", "success");
                }}
              >
                <Eye className="h-4 w-4" />
                Open Study
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function toTriageRows(
  results: SearchResult[],
  context: ResultRendererProps["context"],
): TriageRow[] {
  const byStudy = new Map<string, SearchResult>();

  for (const result of results) {
    const studyUID = getStudyUID(result);
    if (!studyUID || byStudy.has(studyUID)) {
      continue;
    }
    byStudy.set(studyUID, result);
  }

  return Array.from(byStudy.values()).map((result) => {
    const studyUID = getStudyUID(result) || "unknown-study";
    const seriesUID =
      toStringField(result.fields.SeriesInstanceUID) ||
      toStringField(result.fields.seriesInstanceUID) ||
      "unknown-series";
    const instanceUID =
      toStringField(result.fields.SOPInstanceUID) ||
      toStringField(result.fields.sopInstanceUID) ||
      result.uri;
    const previewUrl =
      instanceUID && context.dicoogle
        ? context.dicoogle.getThumbnailUrl(instanceUID)
        : null;

    return {
      key: studyUID,
      patientName: toStringField(result.fields.PatientName) || "Unknown Patient",
      modality: toStringField(result.fields.Modality) || "N/A",
      studyDate: toStringField(result.fields.StudyDate) || "",
      studyUID,
      seriesUID,
      instanceUID,
      description:
        toStringField(result.fields.StudyDescription) ||
        toStringField(result.fields.SeriesDescription) ||
        "",
      previewUrl,
    };
  });
}

function toSearchResult(row: TriageRow): SearchResult {
  return {
    uri: row.instanceUID,
    fields: {
      StudyInstanceUID: row.studyUID,
      SeriesInstanceUID: row.seriesUID,
      SOPInstanceUID: row.instanceUID,
      PatientName: row.patientName,
      Modality: row.modality,
      StudyDate: row.studyDate,
      StudyDescription: row.description,
    },
  };
}

function getStudyUID(result: SearchResult): string {
  return (
    toStringField(result.fields.StudyInstanceUID) ||
    toStringField(result.fields.studyInstanceUID) ||
    result.uri
  );
}

function toStringField(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

function formatStudyDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 8) {
    return "Unknown date";
  }

  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return `${year}-${month}-${day}`;
}

function normalizeDate(dateStr: string): string {
  if (!dateStr) {
    return "00000000";
  }
  return dateStr.slice(0, 8).padEnd(8, "0");
}

function shortenUid(uid: string): string {
  if (uid.length <= 18) {
    return uid;
  }
  return `${uid.slice(0, 8)}...${uid.slice(-8)}`;
}
