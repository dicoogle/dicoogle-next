import { init as csRenderInit } from "@cornerstonejs/core";
import { init as csToolsInit } from "@cornerstonejs/tools";
import * as cornerstoneDICOMImageLoader from "@cornerstonejs/dicom-image-loader";
import * as cornerstone from "@cornerstonejs/core";
import dicomParser from "dicom-parser";

// Singleton promise to handle race conditions and HMR correctly
let csInitPromise: Promise<void> | null = null;

export function initCornerstone() {
  // If already initializing or initialized, return the existing promise
  if (csInitPromise) return csInitPromise;

  csInitPromise = (async () => {
    try {
      // 1. Initialize Core and Tools
      await csRenderInit();
      await csToolsInit();

      // 2. Configure Image Loader
      // Assign the cornerstone instance to the loader
      cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
      // Assign dicomParser to the loader (REQUIRED)
      cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;

      // Configure Web Workers
      // Switched to jsDelivr to avoid "disallowed MIME type" errors common with unpkg
      cornerstoneDICOMImageLoader.webWorkerManager.initialize({
        maxWebWorkers: navigator.hardwareConcurrency || 1,
        startWebWorkersOnDemand: true,
        taskConfiguration: {
          decodeTask: {
            initializeCodecsOnStartup: false,
          },
        },
        webWorkerTaskPaths: [
          "https://cdn.jsdelivr.net/npm/@cornerstonejs/dicom-image-loader@1.63.1/dist/dynamic-import/610.min.worker.js",
          "https://cdn.jsdelivr.net/npm/@cornerstonejs/dicom-image-loader@1.63.1/dist/dynamic-import/945.min.worker.js",
        ],
      });

      // 3. Configure Auth Headers
      cornerstoneDICOMImageLoader.configure({
        beforeSend: (xhr: XMLHttpRequest) => {
          const token = localStorage.getItem("dicoogle_token");
          if (token) {
            xhr.setRequestHeader("Authorization", token);
          }
        },
      });
    } catch (error) {
      // Reset promise on error so it can be retried
      csInitPromise = null;
      console.error("Cornerstone initialization failed:", error);
      throw error;
    }
  })();

  return csInitPromise;
}
