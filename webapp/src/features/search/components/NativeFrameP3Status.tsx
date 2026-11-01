import type {
  NativeFrameP3Metrics,
  NativeFrameP3Source,
} from "@/services/nativeFrameSession";

export interface NativeFrameP3StatusProps {
  readonly metrics: NativeFrameP3Metrics;
  readonly busy: boolean;
  readonly onRetry: () => void;
  readonly onRetryCleanup: () => void;
}

export function NativeFrameP3Status({
  metrics,
  busy,
  onRetry,
  onRetryCleanup,
}: NativeFrameP3StatusProps) {
  const statusLabel =
    metrics.status === "enabled"
      ? "OPFS enabled"
      : metrics.status === "degraded"
        ? "OPFS degraded — RAM-only"
        : metrics.status === "cleanup-required"
          ? "OPFS cleanup pending"
          : metrics.status === "closed"
            ? "OPFS closed"
            : "OPFS unavailable";
  const source = metrics.source ?? "none";
  const publicationBusy = metrics.errors["publication-busy"] ?? 0;
  const errorEntries = Object.entries(metrics.errors).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return (
    <section
      aria-label="P3 plaintext OPFS status"
      className="mt-2 rounded border border-amber-700 bg-gray-900 p-3 text-xs text-gray-200"
    >
      <div className="font-medium text-amber-200">
        Plaintext OPFS — synthetic data only; not encrypted.
      </div>
      <div className="mt-1 text-gray-300">
        No confidentiality claim. Deletion is application cleanup, not secure
        erasure.
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <strong>{statusLabel}</strong>
        <span>source {source}</span>
        <span>RAM promotion {metrics.promotedToRam ? "yes" : "no"}</span>
        <span>OPFS cache {metrics.cache}</span>
        <span>publication busy {publicationBusy}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-gray-400">
        <span>committed entries {metrics.entries}</span>
        <span>native {metrics.committedNativeBytes} B</span>
        <span>file {metrics.committedFileBytes} B</span>
        <span>root {metrics.rootFileBytes} B</span>
        <span>pending writes {metrics.pendingWrites}</span>
        <span>pending deletes {metrics.pendingDeletes}</span>
        <span>failed deletes {metrics.deletedBytes} B</span>
      </div>
      {metrics.status === "degraded" && (
        <div className="mt-2 text-red-300" role="alert">
          Storage error: {metrics.storageError ?? "OPFS unavailable"}. The OPFS disk
          tier is unavailable/unknown; RAM and network remain available.
          <button
            type="button"
            className="ml-2 rounded border border-amber-500 px-2 py-0.5 text-amber-200 disabled:opacity-50"
            onClick={onRetry}
            disabled={busy}
          >
            Retry P3 storage
          </button>
        </div>
      )}
      {metrics.status === "cleanup-required" && (
        <div className="mt-2 text-red-300" role="alert">
          Storage cleanup pending: {metrics.storageError ?? "write-in-flight"}. The
          OPFS disk tier is unavailable/unknown until retry. Plaintext frames may
          still be present on disk until the retry succeeds.
          <button
            type="button"
            className="ml-2 rounded border border-amber-500 px-2 py-0.5 text-amber-200 disabled:opacity-50"
            onClick={onRetryCleanup}
            disabled={busy}
          >
            Retry cleanup
          </button>
        </div>
      )}
      {errorEntries.length > 0 && metrics.status !== "degraded" && (
        <div className="mt-1 text-red-300">
          storage errors:{" "}
          {errorEntries.map(([reason, count]) => `${reason} ${count}`).join(", ")}
        </div>
      )}
    </section>
  );
}

export function p3SourceLabel(source: NativeFrameP3Source | null): string {
  return source ?? "none";
}
