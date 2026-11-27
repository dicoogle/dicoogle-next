/**
 * Vite preset for host apps built on @dicoogle/dicoogle-next-webapp.
 *
 *   import { dicoogleNext } from "@dicoogle/dicoogle-next-webapp/vite";
 *   export default defineConfig({ plugins: [react(), dicoogleNext()] });
 *
 * It applies the build settings Cornerstone needs (WebAssembly, ES-module workers) and serves
 * the library's static assets (logo, DICOM decode workers). A file with the same path in the
 * host's own public/ directory takes precedence, which is how a host replaces the logo.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, PluginOption } from "vite";
import wasm from "vite-plugin-wasm";

export interface DicoogleNextPresetOptions {
  /** Serve and emit the library's static assets. Defaults to true. */
  assets?: boolean;
}

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

function listFiles(dir: string, prefix = ""): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? listFiles(path.join(dir, entry.name), relative)
      : [relative];
  });
}

/** Locates the package's public/ directory from dist-lib/vite/ (built) or vite-plugins/ (source). */
function packagePublicDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "../../public"), path.resolve(here, "../public")];
  return candidates.find((dir) => fs.existsSync(dir)) ?? candidates[0];
}

function cornerstoneBuildSettings(): Plugin {
  return {
    name: "dicoogle-next:cornerstone",
    config() {
      return {
        build: { target: "es2022" },
        // Cornerstone's polySeg worker bundle needs top-level await, which the default "iife"
        // worker format can't emit, and @icr/polyseg-wasm does
        // `import wasm from "./ICRPolySeg.wasm"` expecting a URL, not an ES wasm module.
        worker: {
          format: "es" as const,
          plugins: () => [
            {
              name: "polyseg-wasm-as-url",
              enforce: "pre" as const,
              resolveId(this: any, id: string, importer?: string) {
                if (id.endsWith(".wasm") && importer?.includes("polyseg-wasm")) {
                  return this.resolve(`${id}?url`, importer, { skipSelf: true });
                }
              },
            },
          ],
        },
        assetsInclude: ["**/*.wasm"],
        optimizeDeps: { exclude: ["@icr/polyseg-wasm"] },
      };
    },
  };
}

function libraryAssets(): Plugin {
  const sourceDir = packagePublicDir();
  const files = listFiles(sourceDir);
  let hostPublicDir: string | false = false;
  let base = "/";

  const hostHas = (file: string) =>
    hostPublicDir !== false && fs.existsSync(path.join(hostPublicDir, file));

  return {
    name: "dicoogle-next:assets",
    configResolved(config) {
      hostPublicDir = config.publicDir || false;
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (!url.startsWith(base)) return next();
        const file = decodeURIComponent(url.slice(base.length));
        if (!files.includes(file) || hostHas(file)) return next();
        res.setHeader(
          "Content-Type",
          CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
        );
        fs.createReadStream(path.join(sourceDir, file)).pipe(res);
      });
    },
    generateBundle() {
      for (const file of files) {
        if (hostHas(file)) continue;
        this.emitFile({
          type: "asset",
          fileName: file,
          source: fs.readFileSync(path.join(sourceDir, file)),
        });
      }
    },
  };
}

export function dicoogleNext(options: DicoogleNextPresetOptions = {}): PluginOption[] {
  const plugins: PluginOption[] = [wasm(), cornerstoneBuildSettings()];
  if (options.assets !== false) {
    plugins.push(libraryAssets());
  }
  return plugins;
}

export default dicoogleNext;
