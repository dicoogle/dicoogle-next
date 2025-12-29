/**
 * Download Plugin - Result Options Type
 * Adds a download button to each search result
 */

import { WebUIPlugin, ResultOptionsExtension, PluginContext } from "@/plugins";
import { Download } from "lucide-react";

const downloadPlugin: WebUIPlugin = {
  metadata: {
    id: "download-dicom",
    name: "Download DICOM",
    version: "1.0.0",
    description: "Download DICOM files directly from search results",
    author: "Dicoogle Team",
    type: "result-options",
  },

  init: async (context: PluginContext) => {
    context.logger.info("Download Plugin initialized");
  },

  getResultOptionsExtensions: (): ResultOptionsExtension[] => [
    {
      id: "download-button",
      label: "Download",
      icon: "na",
      order: 20,

      // Only show download for CT and MR images
      condition: (result) => {
        const modality = result.fields?.Modality;
        return modality === "CT" || modality === "MR" || modality === "US";
      },

      action: async (result, context) => {
        context.logger.info("Downloading DICOM file", { uri: result.uri });

        try {
          // Get the DICOM file URL
          const fileUrl = context.dicoogle.getDICOMFileUrl(result.uri);

          // Create download link
          const a = document.createElement("a");
          a.href = fileUrl;
          a.download = `${result.fields.SOPInstanceUID || "dicom"}.dcm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          context.ui?.showToast(
            `Downloading ${result.fields.PatientName || "DICOM file"}`,
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
