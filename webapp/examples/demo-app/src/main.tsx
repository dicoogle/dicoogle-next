import "./index.css";
import { createDicoogleApp } from "@dicoogle/dicoogle-next-webapp";
import csvExportPlugin from "@demo/dicoogle-csv-export";
import overviewPlugin from "./plugins/overview";
import modalityFilterPlugin from "./plugins/modality-filter";
import studyToolsPlugin from "./plugins/study-tools";
import patientTimelinePlugin from "./plugins/patient-timeline";

createDicoogleApp("#root", {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "/next/api",
  basePath: import.meta.env.BASE_URL,
  publicBaseUrl: import.meta.env.BASE_URL,
  appVersion: "0.0.0-demo",
  branding: {
    appName: "Demo PACS",
    tagline: "A Dicoogle Next demo with custom plugins",
    logoUrl: `${import.meta.env.BASE_URL}demo-logo.svg`,
  },
  plugins: [
    // Plugins in this app: metadata given at registration, like a plugin.config.json would.
    {
      plugin: overviewPlugin,
      metadata: { id: "demo-overview", name: "Overview", version: "1.0.0", author: "Demo" },
    },
    {
      plugin: modalityFilterPlugin,
      metadata: { id: "demo-modality-filter", name: "Modality filter", version: "1.0.0" },
    },
    {
      plugin: studyToolsPlugin,
      metadata: { id: "demo-study-tools", name: "Study tools", version: "1.0.0" },
    },
    {
      plugin: patientTimelinePlugin,
      metadata: { id: "demo-patient-timeline", name: "Patient timeline", version: "1.0.0" },
      enabled: false, // off until switched on in Management > Plugins
    },
    // A plugin from its own npm package; it carries its own metadata.
    csvExportPlugin,
  ],
});
