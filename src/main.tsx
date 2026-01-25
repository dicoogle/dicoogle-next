import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerAllPlugins } from "virtual:dicoogle-plugins";
import { initializeAllPlugins } from "@/plugin-system";

// Register all discovered plugins
registerAllPlugins();

// Initialize all enabled plugins
initializeAllPlugins().catch((error) => {
  console.error("Failed to initialize plugins:", error);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
