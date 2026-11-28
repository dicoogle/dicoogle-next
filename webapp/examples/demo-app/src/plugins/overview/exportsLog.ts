import type { CsvExportedEvent } from "@demo/dicoogle-csv-export";

/** CSV exports seen since the app loaded, newest first; filled from the plugin's init(). */
const log: CsvExportedEvent[] = [];
const listeners = new Set<() => void>();

export function recordExport(event: CsvExportedEvent): void {
  log.unshift(event);
  log.length = Math.min(log.length, 5);
  listeners.forEach((listener) => listener());
}

export function recentExports(): CsvExportedEvent[] {
  return [...log];
}

export function onExportsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
