import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { createPluginLoader } from "./vite-plugins/plugin-loader";
import { dicoogleNext } from "./vite-plugins/preset";

export default defineConfig({
  // The standalone app serves its own public/, so only the build settings come from the preset.
  plugins: [react(), dicoogleNext({ assets: false }), createPluginLoader()],
  base: process.env.BASE_PATH || "/experimental/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
  server: {
    host: true,
    proxy: {
      "/next/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
