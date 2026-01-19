import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { createPluginLoader } from "./vite-plugins/plugin-loader";

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait(), createPluginLoader()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  assetsInclude: ["**/*.wasm"],

  optimizeDeps: {
    exclude: ["@icr/polyseg-wasm"],
  },
});
