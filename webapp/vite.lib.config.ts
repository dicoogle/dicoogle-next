/**
 * Builds the web app as a library (dist-lib) for the npm package.
 *
 * Every dependency stays external: the host app's bundler resolves and bundles them, so the
 * host and the library share one React, one router and one copy of Cornerstone.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import pkg from "./package.json" with { type: "json" };

const externalPackages = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];
const isExternal = (id: string) =>
  externalPackages.some((name) => id === name || id.startsWith(`${name}/`));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  publicDir: false,
  build: {
    target: "es2022",
    outDir: "dist-lib",
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: path.resolve(import.meta.dirname, "src/lib/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    rolldownOptions: {
      external: isExternal,
    },
  },
});
