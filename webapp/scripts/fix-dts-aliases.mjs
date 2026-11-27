// Rewrites the "@/..." path alias in emitted .d.ts files to relative paths, since the
// TypeScript compiler leaves path aliases untouched and consumers cannot resolve them.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "dist-lib/types");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : full.endsWith(".d.ts") ? [full] : [];
  });
}

let rewritten = 0;
for (const file of walk(root)) {
  const source = fs.readFileSync(file, "utf8");
  const result = source.replace(/(["'])@\/([^"']+)\1/g, (_, quote, target) => {
    let relative = path.relative(path.dirname(file), path.join(root, target));
    relative = relative.split(path.sep).join("/");
    if (!relative.startsWith(".")) relative = `./${relative}`;
    return `${quote}${relative}${quote}`;
  });
  if (result !== source) {
    fs.writeFileSync(file, result);
    rewritten++;
  }
}
console.log(`fix-dts-aliases: rewrote ${rewritten} file(s) under ${root}`);
