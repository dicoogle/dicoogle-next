import "./index.css";
import { registerAllPlugins } from "virtual:dicoogle-plugins";
import { createDicoogleApp } from "@/bootstrap";

// Plugins discovered under src/plugins at build time.
registerAllPlugins();

createDicoogleApp("#root", {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  basePath: import.meta.env.VITE_BASE_PATH,
  publicBaseUrl: import.meta.env.BASE_URL,
  filesystemStartPath: import.meta.env.VITE_FILESYSTEM_START_PATH,
  appVersion: import.meta.env.VITE_APP_VERSION,
});
