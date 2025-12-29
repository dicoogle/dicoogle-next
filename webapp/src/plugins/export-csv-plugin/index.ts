/**
 * Export CSV Plugin - Result Batch Type
 * Exports selected search results to CSV file
 */

import { WebUIPlugin, ResultBatchExtension, PluginContext } from "@/plugins";
import { FileDown } from "lucide-react";

const exportCsvPlugin: WebUIPlugin = {
  metadata: {
    id: "export-csv",
    name: "Export to CSV",
    version: "1.0.0",
    description: "Export selected search results to CSV file",
    author: "Dicoogle Team",
    type: "result-batch",
  },

  init: async (context: PluginContext) => {
    context.logger.info("Export CSV Plugin initialized");
  },

  getResultBatchExtensions: (): ResultBatchExtension[] => [
    {
      id: "export-csv-button",
      label: "Export CSV",
      icon: "na",
      order: 10,

      // Only enable if at least one result is selected
      enabled: (results) => results.length > 0,

      action: async (results, context) => {
        context.logger.info(`Exporting ${results.length} results to CSV`);

        try {
          // Convert results to CSV
          const csv = convertToCSV(results);

          // Create blob and download
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `dicoogle-export-${Date.now()}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          context.ui?.showToast(
            `Exported ${results.length} result${results.length > 1 ? "s" : ""}`,
            "success",
          );

          // Store export in history
          const history = context.storage.get("export-history") || [];
          history.push({
            timestamp: Date.now(),
            count: results.length,
          });
          context.storage.set("export-history", history.slice(-10)); // Keep last 10
        } catch (error) {
          context.logger.error("Export failed", error);
          context.ui?.showToast("Export failed", "error");
        }
      },
    },
  ],
};

/**
 * Convert DICOM results to CSV format
 */
function convertToCSV(results: any[]): string {
  // Define CSV headers
  const headers = [
    "Patient Name",
    "Patient ID",
    "Study Date",
    "Study Time",
    "Modality",
    "Study Description",
    "Series Number",
    "Instance Number",
    "SOP Instance UID",
    "URI",
  ];

  // Convert each result to CSV row
  const rows = results.map((result) => {
    const fields = result.fields || {};
    return [
      escapeCSV(fields.PatientName || ""),
      escapeCSV(fields.PatientID || ""),
      escapeCSV(fields.StudyDate || ""),
      escapeCSV(fields.StudyTime || ""),
      escapeCSV(fields.Modality || ""),
      escapeCSV(fields.StudyDescription || ""),
      escapeCSV(fields.SeriesNumber || ""),
      escapeCSV(fields.InstanceNumber || ""),
      escapeCSV(fields.SOPInstanceUID || ""),
      escapeCSV(result.uri || ""),
    ].join(",");
  });

  // Combine headers and rows
  return [headers.join(","), ...rows].join("\n");
}

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
function escapeCSV(field: string): string {
  if (typeof field !== "string") {
    field = String(field);
  }

  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }

  return field;
}

export default exportCsvPlugin;
