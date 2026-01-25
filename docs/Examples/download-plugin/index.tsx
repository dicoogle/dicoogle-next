/**
 * Download Plugin - Result Options Type
 * Adds a download button to each search result
 * 
 * Metadata is defined in plugin.config.json
 */

import { WebUIPlugin, ResultOptionsExtension, PluginContext } from "@/plugin-system";
import { Download } from "lucide-react";
import type { Study } from "@/types";
import JSZip from "jszip";

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

      action: async (result: Study, context) => {
        context.logger.info("Downloading DICOM study", {
          uid: result.studyInstanceUID,
        });

        try {
          // Query all files in this study
          const searchQuery = `StudyInstanceUID:${result.studyInstanceUID}`;
          const searchResults = await context.dicoogle.search(searchQuery);

          if (!searchResults.results || searchResults.results.length === 0) {
            context.ui?.showToast("No files found for this study", "error");
            return;
          }

          context.ui?.showToast(
            `Preparing ${searchResults.results.length} file(s) for download...`,
            "info",
          );

          // Create a new JSZip instance
          const zip = new JSZip();

          // Fetch and add each file to the zip
          let successCount = 0;
          for (const fileResult of searchResults.results) {
            if (fileResult.uri) {
              try {
                const sopUID = fileResult.fields?.SOPInstanceUID;
                const downloadUrl = `${context.dicoogle.getBase()}/legacy/file?uid=${encodeURIComponent(sopUID)}`;
                
                // Fetch the DICOM file as a blob
                const response = await fetch(downloadUrl);
                if (!response.ok) {
                  context.logger.warn(`Failed to fetch ${sopUID}: ${response.statusText}`);
                  continue;
                }
                
                const blob = await response.blob();
                
                // Add file to zip with .dcm extension
                zip.file(`${sopUID}.dcm`, blob);
                successCount++;
              } catch (err) {
                context.logger.warn(`Error fetching file: ${err}`);
              }
            }
          }

          if (successCount === 0) {
            context.ui?.showToast("Failed to download any files", "error");
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
          const patientName = result.patientName?.replace(/[^a-z0-9]/gi, '_') || "study";
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
};

export default downloadPlugin;
