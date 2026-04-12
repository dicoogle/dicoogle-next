/**
 * Download Plugin - Result Options Type
 * Adds a download button to each search result
 * 
 * Metadata is defined in plugin.config.json
 */

import {
  WebUIPlugin,
  ResultOptionsExtension,
  ResultBatchExtension,
  PluginContext,
  ResultOptionActionArgs,
  ResultBatchActionArgs,
} from "@/plugin-system";
import { Download } from "lucide-react";
import JSZip from "jszip";

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "_");
}

async function downloadStudyAsZip(studyUID: string, context: PluginContext) {
  const searchResults = await context.dicoogle.search(`StudyInstanceUID:${studyUID}`);

  if (!searchResults.results || searchResults.results.length === 0) {
    return {
      zip: null as JSZip | null,
      successCount: 0,
    };
  }

  const zip = new JSZip();
  let successCount = 0;

  for (const fileResult of searchResults.results) {
    if (!fileResult.uri) {
      continue;
    }

    try {
      const sopUID = fileResult.fields?.SOPInstanceUID;
      const downloadUrl = `${context.dicoogle.getBase()}/legacy/file?uid=${encodeURIComponent(sopUID)}`;

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        context.logger.warn(`Failed to fetch ${sopUID}: ${response.statusText}`);
        continue;
      }

      const blob = await response.blob();
      zip.file(`${sopUID}.dcm`, blob);
      successCount++;
    } catch (err) {
      context.logger.warn(`Error fetching file: ${err}`);
    }
  }

  return { zip, successCount };
}

function getResultField(result: { fields: Record<string, any> }, ...keys: string[]): string {
  for (const key of keys) {
    const value = result.fields?.[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return "";
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current], current);
    }
  };

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => runWorker(),
  );
  await Promise.all(workers);
  return results;
}

let batchDownloadRunning = false;

const downloadPlugin: WebUIPlugin = {
  // No metadata needed - it's in plugin.config.json!

  init: async (context: PluginContext) => {
    context.logger.info("Download Plugin initialized");
  },

  getResultOptionsExtensions: (): ResultOptionsExtension[] => [
    {
      id: "download-button",
      label: "Download Study",
      icon: <Download className="w-4 h-4" />,
      order: 20,

      action: async ({ result, context }: ResultOptionActionArgs) => {
        context.logger.info("Downloading DICOM study", {
          uid: result.studyInstanceUID,
        });

        try {
          const { zip, successCount } = await downloadStudyAsZip(
            result.studyInstanceUID,
            context,
          );

          if (!zip || successCount === 0) {
            context.ui?.showToast("No files found for this study", "error");
            return;
          }

          // Generate the zip file
          context.ui?.showToast("Creating zip file...", "info");
          const zipBlob = await zip.generateAsync({ type: "blob" });

          // Create download link for the zip
          const a = document.createElement("a");
          const url = URL.createObjectURL(zipBlob);
          a.href = url;
          
          // Create a nice filename
          const patientName = sanitizeFilename(result.patientName || "study");
          const studyDate = result.studyDate || "";
          a.download = `${patientName}_${studyDate}_${result.studyInstanceUID.slice(-8)}.zip`;
          
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          // Clean up the object URL
          URL.revokeObjectURL(url);

          context.ui?.showToast(
            `Downloaded ${successCount} file(s) from ${result.patientName || "study"}`,
            "success",
          );
        } catch (error) {
          context.logger.error("Download failed", error);
          context.ui?.showToast("Download failed", "error");
        }
      },
    },
  ],

  getResultBatchExtensions: (): ResultBatchExtension[] => [
    {
      id: "download-all-search-results",
      label: "Download All Results",
      icon: <Download className="w-4 h-4" />,
      order: 10,
      action: async ({ results, searchResults, context, signal }: ResultBatchActionArgs) => {
        if (batchDownloadRunning) {
          context.ui?.showToast("Batch download already running", "warning");
          return;
        }

        if (!results || results.length === 0) {
          context.ui?.showToast("No studies to download", "warning");
          return;
        }

        if (!searchResults || searchResults.length === 0) {
          context.ui?.showToast(
            "No raw search results available for batch download",
            "error",
          );
          return;
        }

        batchDownloadRunning = true;

        try {
          const studyUIDSet = new Set(
            results.map((study) => study.studyInstanceUID).filter(Boolean),
          );

          const candidateFiles = searchResults
            .map((result) => {
              const studyUID = getResultField(result, "StudyInstanceUID", "studyInstanceUID");
              const sopUID = getResultField(result, "SOPInstanceUID", "sopInstanceUID");
              if (!studyUID || !sopUID || !studyUIDSet.has(studyUID)) {
                return null;
              }

              return {
                studyUID,
                sopUID,
                downloadUrl: `${context.dicoogle.getBase()}/legacy/file?uid=${encodeURIComponent(sopUID)}`,
              };
            })
            .filter((item): item is { studyUID: string; sopUID: string; downloadUrl: string } =>
              Boolean(item),
            );

          if (candidateFiles.length === 0) {
            context.ui?.showToast("No files found for the current query", "error");
            return;
          }

          context.ui?.showToast(
            `Downloading ${candidateFiles.length} files from ${studyUIDSet.size} studies...`,
            "info",
          );

          const batchZip = new JSZip();
          let completed = 0;

          const fileResults = await mapWithConcurrency(candidateFiles, 4, async (file, idx) => {
            if (signal?.aborted) {
              return { ...file, ok: false as const, blob: null };
            }

            try {
              const response = await fetch(file.downloadUrl);
              if (!response.ok) {
                context.logger.warn(
                  `Failed to fetch ${file.sopUID}: ${response.status} ${response.statusText}`,
                );
                return { ...file, ok: false as const, blob: null };
              }

              const blob = await response.blob();
              completed += 1;
              if (idx % 20 === 0 || idx === candidateFiles.length - 1) {
                context.logger.info("Batch download progress", {
                  completed,
                  total: candidateFiles.length,
                });
              }
              return { ...file, ok: true as const, blob };
            } catch (error) {
              context.logger.warn(`Error fetching ${file.sopUID}`, error);
              return { ...file, ok: false as const, blob: null };
            }
          });

          const successful = fileResults.filter((item) => item.ok && item.blob);

          if (successful.length === 0) {
            context.ui?.showToast("Could not download any file", "error");
            return;
          }

          successful.forEach((item) => {
            const folder = batchZip.folder(item.studyUID.slice(-12));
            if (!folder || !item.blob) {
              return;
            }
            folder.file(`${item.sopUID}.dcm`, item.blob);
          });

          const zipBlob = await batchZip.generateAsync({ type: "blob" });
          const a = document.createElement("a");
          const url = URL.createObjectURL(zipBlob);
          a.href = url;
          a.download = `batch_results_${new Date().toISOString().slice(0, 10)}.zip`;

          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          context.ui?.showToast(
            `Downloaded ${successful.length} files from ${studyUIDSet.size} studies`,
            "success",
          );
        } finally {
          batchDownloadRunning = false;
        }
      },
    },
  ],
};

export default downloadPlugin;
