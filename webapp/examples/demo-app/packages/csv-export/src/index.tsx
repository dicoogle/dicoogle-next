/**
 * CSV export: a batch action on all current search results.
 * Extension point: getResultBatchExtensions; announces exports on the plugin event bus.
 */
import { FileSpreadsheet } from "lucide-react";
import {
  defineDicooglePlugin,
  type ResultBatchActionArgs,
  type Study,
} from "@dicoogle/dicoogle-next-webapp";

/** Event emitted on the plugin event bus after each export. */
export const CSV_EXPORTED_EVENT = "demo:csv-exported";

export interface CsvExportedEvent {
  filename: string;
  count: number;
  /** Epoch milliseconds. */
  at: number;
}

const COLUMNS: Array<[header: string, value: (study: Study) => unknown]> = [
  ["PatientName", (s) => s.patientName],
  ["PatientID", (s) => s.patientID],
  ["StudyDate", (s) => s.studyDate],
  ["StudyDescription", (s) => s.studyDescription],
  ["Modality", (s) => s.modality],
  ["Series", (s) => s.numberOfSeries],
  ["Images", (s) => s.numberOfImages],
  ["StudyInstanceUID", (s) => s.studyInstanceUID],
];

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function studiesToCsv(studies: Study[]): string {
  const header = COLUMNS.map(([name]) => name).join(",");
  const rows = studies.map((study) => COLUMNS.map(([, value]) => csvCell(value(study))).join(","));
  return [header, ...rows].join("\r\n");
}

function download(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default defineDicooglePlugin({
  metadata: {
    id: "demo-csv-export",
    name: "CSV export",
    version: "1.0.0",
    description: "Export search results as CSV",
    author: "Demo",
  },

  getResultBatchExtensions: () => [
    {
      id: "export-csv",
      label: "Export CSV",
      icon: <FileSpreadsheet className="w-4 h-4 mr-1" />,
      action: ({ results, context }: ResultBatchActionArgs) => {
        const filename = `studies-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
        download(filename, studiesToCsv(results));
        context.ui?.showToast(`Exported ${results.length} studies to ${filename}`, "success");
        const event: CsvExportedEvent = { filename, count: results.length, at: Date.now() };
        context.eventBus.emit(CSV_EXPORTED_EVENT, event);
      },
    },
  ],
});
