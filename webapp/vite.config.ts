import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import wasm from "vite-plugin-wasm";
import { createPluginLoader } from "./vite-plugins/plugin-loader";

export default defineConfig({
  plugins: [react(), wasm(), createPluginLoader()],
  base: process.env.BASE_PATH || "/experimental/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: 'es2022',
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
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["@icr/polyseg-wasm"],
  },
});
