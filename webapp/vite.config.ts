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
        // Same as the nginx config of the Docker image: /next/api/* -> backend /api/*
        rewrite: (path) => path.replace(/^\/next\/api/, "/api"),
      },
    },
  },
  // Cornerstone's polySeg worker bundle needs top-level await, which the default "iife" worker format can't emit
  // and @icr/polyseg-wasm does `import wasm from "./ICRPolySeg.wasm"` expecting a URL, not an ES wasm module
  worker: {
    format: "es",
    plugins: () => [
      {
        name: "polyseg-wasm-as-url",
        enforce: "pre",
        resolveId(id, importer) {
          if (id.endsWith(".wasm") && importer?.includes("polyseg-wasm")) {
            return this.resolve(`${id}?url`, importer, { skipSelf: true });
          }
        },
      },
    ],
  },
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["@icr/polyseg-wasm"],
  },
});
