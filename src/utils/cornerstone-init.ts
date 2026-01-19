import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import * as cornerstoneDICOMImageLoader from "@cornerstonejs/dicom-image-loader";
import dicomParser from "dicom-parser";

let csInitPromise: Promise<void> | null = null;

export function initCornerstone() {
  if (csInitPromise) return csInitPromise;

  csInitPromise = (async () => {
    try {
      // 1. Initialize Core
      await cornerstone.init();

      // 2. Initialize Tools
      await cornerstoneTools.init();

      // 3. Configure Image Loader
      // Explicitly link the same cornerstone instance
      cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
      cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;

      // 4. Configure Web Workers
      // We use window.location.origin to ensure absolute paths.
      // This prevents 404s when you are on a sub-route (e.g. /study/123)
      const baseUrl = window.location.origin;

      cornerstoneDICOMImageLoader.webWorkerManager.initialize({
        maxWebWorkers: navigator.hardwareConcurrency || 1,
        startWebWorkersOnDemand: true,
        taskConfiguration: {
          decodeTask: {
            initializeCodecsOnStartup: false,
          },
        },
        webWorkerTaskPaths: [
          // IMPORTANT: Check that these files exist in your public/dicom-workers/ folder
          `${baseUrl}/dicom-workers/610.min.worker.js`,
          `${baseUrl}/dicom-workers/945.min.worker.js`,
        ],
      });

      // 5. Configure Auth
      cornerstoneDICOMImageLoader.configure({
        beforeSend: (xhr: XMLHttpRequest) => {
          const token = localStorage.getItem("dicoogle_token");
          if (token) {
            xhr.setRequestHeader("Authorization", token);
          }
        },
      });

      console.log("[Cornerstone] Initialization complete");
    } catch (error) {
      csInitPromise = null;
      console.error("[Cornerstone] Initialization failed:", error);
      throw error;
    }
  })();

  return csInitPromise;
}
