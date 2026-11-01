import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { initializeCornerstone } from "@/utils/cornerstoneInit";
import { useAuthStore } from "@/stores/AuthStore";
import type {
  NativeFrameContext,
  NativeFrameLocator,
} from "@/services/nativeFrameContract";
import { resolveNativeFrameSourceVersion } from "@/services/nativeFrameFixture";
import { resolveNativeFrameOwnership } from "@/services/nativeFrameOwnership";
import { CornerstoneFramePresenter } from "@/services/nativeFramePresenter";
import {
  buildNativeFrameResidencyView,
  reduceNativeFrameResidency,
  type NativeFrameResidencyState,
  type NativeFrameResidencyTile,
  type NativeFrameResidencyView,
} from "@/services/nativeFrameResidency";
import { NativeFrameP3Status } from "./NativeFrameP3Status";
import { NativeFrameP3ResidencyStrip } from "./NativeFrameP3ResidencyStrip";
import { createNativeFrameModeGate } from "./NativeFrameModeGate";
import {
  NativeFrameSession,
  type FrameSelectionResult,
  type NativeFrameMode,
  type NativeFrameSessionMetrics,
} from "@/services/nativeFrameSession";

interface NativeFrameViewerProps {
  locator: NativeFrameLocator;
  title: string;
  onClose: () => void;
}

type ViewerStatus =
  | "initializing"
  | "loading-metadata"
  | "loading-frame"
  | "ready"
  | "error";

interface FrameMetrics {
  frameNumber: number;
  source: "network" | "ram";
  opfsSource: "opfs" | null;
  opfsCache: "hit" | "miss" | "invalid" | "not-applicable";
  promotedToRam: boolean;
  nativeCache: "hit" | "miss" | "not-applicable";
  selectionToFrameResponseMs: number;
  selectionToFrameCommittedMs: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export function NativeFrameViewer({
  locator,
  title,
  onClose,
}: NativeFrameViewerProps) {
  const { studyInstanceUID, seriesInstanceUID, sopInstanceUID } = locator;
  const authUser = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const ownership = resolveNativeFrameOwnership(authUser, isAuthenticated);
  const ownerId = ownership?.ownerId ?? null;
  const principalId = ownership?.principalId ?? null;
  const [ramSessionId] = useState(() => createSessionId());
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<NativeFrameSession | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const selectionRef = useRef(0);
  const modeGateRef = useRef(createNativeFrameModeGate());
  const [mode, setMode] = useState<NativeFrameMode>("p1");
  const [modeBusy, setModeBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [p3Notice, setP3Notice] = useState<string | null>(null);
  const [status, setStatus] = useState<ViewerStatus>("initializing");
  const [context, setContext] = useState<NativeFrameContext | null>(null);
  const [frameNumber, setFrameNumber] = useState(1);
  const [metrics, setMetrics] = useState<FrameMetrics | null>(null);
  const [sessionMetrics, setSessionMetrics] =
    useState<NativeFrameSessionMetrics | null>(null);
  const [residencyState, setResidencyState] =
    useState<NativeFrameResidencyState | null>(null);
  const [stripStart, setStripStart] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ramNotice, setRamNotice] = useState(false);

  const p2Available = Boolean(
    ownerId && resolveNativeFrameSourceVersion(locator),
  );
  const p3Available = p2Available;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    if (!ownerId || !principalId) {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      sessionRef.current?.close();
      sessionRef.current = null;
      setResidencyState(null);
      setSessionMetrics(null);
      setStripStart(null);
      setStatus("error");
      setError("Session ended");
      return;
    }

    let cancelled = false;
    let session: NativeFrameSession | null = null;
    setMode("p1");
    setResidencyState(null);
    setSessionMetrics(null);
    setStripStart(null);

    const start = async () => {
      try {
        await initializeCornerstone();
        if (cancelled) {
          return;
        }

        const presenter = new CornerstoneFramePresenter(host);
        session = new NativeFrameSession(
          { studyInstanceUID, seriesInstanceUID, sopInstanceUID },
          {
            baseUrl: API_BASE_URL,
            token: localStorage.getItem("dicoogle_token"),
            presenter,
            mode: "p1",
            cacheScope: { principalId, sessionId: ramSessionId },
            p3: {},
          },
        );
        sessionRef.current = session;
        setStatus("loading-metadata");
        const loadedContext = await session.open();
        if (cancelled) {
          return;
        }

        setContext(loadedContext);
        setFrameNumber(1);
        unsubscribeRef.current?.();
        unsubscribeRef.current = session.subscribeResidency(({ snapshot, batch }) => {
          setSessionMetrics(snapshot);
          setResidencyState((previous) =>
            reduceNativeFrameResidency(previous, snapshot, batch),
          );
        });
        setStatus("loading-frame");
        const result = await session.selectFrame(1);
        if (cancelled || result.status === "stale") {
          return;
        }
        setMetrics(toMetrics(result));
        setStatus("ready");
      } catch (caught) {
        if (!cancelled) {
          setError(formatError(caught));
          setStatus("error");
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      sessionRef.current = null;
      selectionRef.current += 1;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      session?.close();
    };
  }, [
    ownerId,
    principalId,
    ramSessionId,
    seriesInstanceUID,
    sopInstanceUID,
    studyInstanceUID,
  ]);

  const selectFrame = useCallback(
    async (nextFrame: number) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      const selection = ++selectionRef.current;
      setFrameNumber(nextFrame);
      setError(null);
      setRamNotice(false);
      setStatus("loading-frame");

      try {
        const result = await session.selectFrame(nextFrame);
        if (selection !== selectionRef.current || result.status === "stale") {
          return;
        }
        setMetrics(toMetrics(result));
        setStatus("ready");
      } catch (caught) {
        if (selection !== selectionRef.current) {
          return;
        }
        setError(formatError(caught));
        setStatus("error");
      }
    },
    [],
  );

  const changeMode = useCallback(
    async (nextMode: NativeFrameMode) => {
      const session = sessionRef.current;
      if (!session || nextMode === mode || modeBusy || actionBusy) {
        return;
      }
      if (nextMode === "p2" && !p2Available) {
        return;
      }
      if (nextMode === "p3" && !p3Available) {
        return;
      }
      await modeGateRef.current.run(async () => {
        setModeBusy(true);
        try {
          if (nextMode === "p3") {
            const result = await session.setModeAsync("p3");
            if (result.status === "failed") {
              setError(
                result.storageError ?? result.reason ?? "P3 storage entry failed",
              );
              setStatus("error");
              return;
            }
            setMode("p3");
          } else {
            if (session.metrics().mode === "p3") {
              const result = await session.setModeAsync(nextMode);
              if (result.status === "failed") {
                setError(
                  result.storageError ??
                    result.reason ??
                    "P3 cleanup pending; retry before switching",
                );
                setStatus("error");
                return;
              }
            } else {
              session.setMode(nextMode);
            }
            setMode(nextMode);
          }
          setMetrics(null);
          setError(null);
          setRamNotice(false);
          setP3Notice(null);
          setSessionMetrics(session.metrics());
          await selectFrame(frameNumber);
        } catch (caught) {
          setError(formatError(caught));
          setStatus("error");
        } finally {
          setModeBusy(false);
        }
      });
    },
    [actionBusy, frameNumber, mode, modeBusy, p2Available, p3Available, selectFrame],
  );

  const retryP3 = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || mode !== "p3" || modeBusy || actionBusy) {
      return;
    }
    await modeGateRef.current.run(async () => {
      setModeBusy(true);
      try {
        const result = await session.setModeAsync("p3");
        if (result.status === "failed") {
          setError(
            result.storageError ?? result.reason ?? "P3 storage entry failed",
          );
          setStatus("error");
          return;
        }
        setError(null);
        setP3Notice(null);
        setSessionMetrics(session.metrics());
        setStatus("ready");
        await selectFrame(frameNumber);
      } finally {
        setModeBusy(false);
      }
    });
  }, [actionBusy, frameNumber, mode, modeBusy, selectFrame]);

  const retryCleanup = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || mode !== "p3" || modeBusy || actionBusy) {
      return;
    }
    await modeGateRef.current.run(async () => {
      setModeBusy(true);
      try {
        const result = await session.retryCloseP3();
        if (result.status === "failed") {
          setError(
            result.storageError ?? result.reason ?? "OPFS cleanup still pending",
          );
          setStatus("error");
          return;
        }
        setError(null);
        setP3Notice(null);
        setSessionMetrics(session.metrics());
        setStatus("ready");
      } finally {
        setModeBusy(false);
      }
    });
  }, [actionBusy, mode, modeBusy]);

  const clearOpfs = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || mode !== "p3" || actionBusy || modeBusy) {
      return;
    }
    setActionBusy(true);
    setP3Notice(null);
    setError(null);
    try {
      const result = await session.clearP3();
      if (result.status === "cleared") {
        setP3Notice(
          `OPFS cleared: ${result.clearedEntries} entries, ` +
            `${result.clearedNativeBytes} B. Application cleanup, not secure erasure.`,
        );
      } else if (result.status === "failed") {
        setError(
          `OPFS cleanup failed (${result.reason ?? "unknown"}); deletion not confirmed.`,
        );
      } else {
        setError(
          `OPFS cleanup unavailable (${result.reason ?? "storage-unavailable"}).`,
        );
      }
      setSessionMetrics(session.metrics());
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, mode, modeBusy]);

  const clearBoth = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || mode !== "p3" || actionBusy || modeBusy) {
      return;
    }
    setActionBusy(true);
    setP3Notice(null);
    setError(null);
    try {
      const result = await session.clearBoth();
      if (result.status === "cleared") {
        setP3Notice(
          "RAM and OPFS cleared for this session. The displayed frame remains " +
            "transient; application cleanup, not secure erasure.",
        );
      } else if (result.status === "partial") {
        setP3Notice(
          "Partial: RAM cleared; OPFS cleanup did not complete " +
            `(${result.reason ?? "storage-unavailable"}). Deletion not confirmed.`,
        );
      } else {
        setError(
          `Clear Both failed (${result.reason ?? "unknown"}); no deletion confirmed.`,
        );
      }
      setSessionMetrics(session.metrics());
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, mode, modeBusy]);

  const clearRam = useCallback(() => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }
    const result = session.clearRam();
    if (!result) {
      return;
    }
    setError(null);
    setRamNotice(true);
    window.setTimeout(() => setRamNotice(false), 2500);
  }, []);

  const setPrefetch = useCallback((enabled: boolean) => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }
    try {
      session.setPrefetchEnabled(enabled);
      setError(null);
    } catch (caught) {
      setError(formatError(caught));
    }
  }, []);

  const close = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (modeBusy || actionBusy || !context) {
        return;
      }
      if (event.key === "ArrowLeft" && frameNumber > 1) {
        void selectFrame(frameNumber - 1);
      } else if (event.key === "ArrowRight" && frameNumber < context.numberOfFrames) {
        void selectFrame(frameNumber + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, context, frameNumber, actionBusy, modeBusy, selectFrame]);

  const copyMetrics = async () => {
    if (!sessionMetrics) {
      return;
    }
    const payload = {
      fixtureAliases: {
        study: alias(locator.studyInstanceUID, "ST"),
        series: alias(locator.seriesInstanceUID, "SE"),
        instance: alias(locator.sopInstanceUID, "IN"),
      },
      sourceTransferSyntaxUID: context?.transferSyntaxUID ?? null,
      frameNumber: metrics?.frameNumber ?? sessionMetrics.displayedFrame,
      mode: sessionMetrics.mode,
      modeEpoch: sessionMetrics.modeEpoch,
      source: metrics?.source ?? sessionMetrics.lastSource,
      opfsSource: metrics?.opfsSource ?? null,
      opfsCache: metrics?.opfsCache ?? "not-applicable",
      promotedToRam: metrics?.promotedToRam ?? false,
      nativeCache: metrics?.nativeCache ?? null,
      requestedFrame: sessionMetrics.requestedFrame,
      displayedFrame: sessionMetrics.displayedFrame,
      pendingFrame: sessionMetrics.pendingFrame,
      errorFrame: sessionMetrics.errorFrame,
      acceptedSelections: sessionMetrics.acceptedSelections,
      frameBodyRequests: sessionMetrics.frameBodyRequests,
      demandFrameBodyRequests: sessionMetrics.demandFrameBodyRequests,
      prefetchFrameBodyRequests: sessionMetrics.prefetchFrameBodyRequests,
      metadataRequests: sessionMetrics.metadataRequests,
      pendingFrameRequests: sessionMetrics.pendingFrameRequests,
      errors: sessionMetrics.errors,
      window: sessionMetrics.window,
      prefetch: sessionMetrics.prefetch,
      opfs: sessionMetrics.opfs,
      cache: sessionMetrics.cache
        ? {
            hits: sessionMetrics.cache.hits,
            misses: sessionMetrics.cache.misses,
            removals: sessionMetrics.cache.evictions,
            invalidations: sessionMetrics.cache.invalidations,
            bypasses: sessionMetrics.cache.bypasses,
            entryCount: sessionMetrics.cache.entryCount,
            retainedNativeBytes: sessionMetrics.cache.retainedNativeBytes,
            maxTotalNativeBytes:
              sessionMetrics.cache.limits.maxTotalNativeBytes,
            frames: sessionMetrics.cache.frames,
          }
        : null,
      residency: residencyView
        ? {
            startFrame: residencyView.startFrame,
            endFrame: residencyView.endFrame,
            totalFrames: residencyView.totalFrames,
            resynchronized: residencyView.resynchronized,
            opfsStatus: residencyView.opfsStatus,
            decodedState: residencyView.decodedState,
            ramFrames: residencyView.cache?.frames ?? [],
            removals: residencyView.removals,
            invalidations: residencyView.invalidations,
          }
        : null,
      selectionToFrameResponseMs: metrics?.selectionToFrameResponseMs ?? null,
      selectionToFrameCommittedMs: metrics?.selectionToFrameCommittedMs ?? null,
      timingBasis: "selection-to-source-ready-and-committed",
      physicalPaintVerified: false,
      decodedCacheObserved: false,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (caught) {
      setError(formatError(caught));
    }
  };

  const busy = status === "initializing" || status === "loading-metadata";
  const frameTotal = context?.numberOfFrames ?? 0;
  const residencyView = useMemo(
    () =>
      residencyState
        ? buildNativeFrameResidencyView(
            residencyState,
            frameTotal,
            stripStart,
          )
        : null,
    [frameTotal, residencyState, stripStart],
  );
  const cache = sessionMetrics?.cache ?? null;
  const windowBounds = sessionMetrics?.window ?? null;
  const p2DisabledTitle = !principalId
    ? "P2 requires an authenticated user"
    : "P2 is available only for recognised synthetic fixture instances";
  const p3DisabledTitle = !principalId
    ? "P3 requires an authenticated user"
    : "P3 is available only for recognised synthetic fixture instances";

  useEffect(() => {
    setStripStart(null);
  }, [residencyView?.requestedFrame]);

  return (
    <div
      className="fixed inset-0 z-1000 bg-black/95 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Native frame viewer"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-800 text-white">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="text-xs text-gray-400">
            {frameTotal > 0
              ? `Frame ${frameNumber} / ${frameTotal}`
              : "Loading instance metadata"}
            {` · ${
              mode === "p3"
                ? "P3 plaintext OPFS"
                : mode === "p2"
                  ? "P2 RAM window"
                  : "P1 one-frame stream"
            }`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-md border border-gray-700 p-0.5"
            role="group"
            aria-label="Native frame mode"
          >
            <button
              type="button"
              onClick={() => void changeMode("p1")}
              disabled={busy || modeBusy || actionBusy}
              aria-pressed={mode === "p1"}
              className={`rounded px-2 py-1 text-xs ${
                mode === "p1"
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:text-white"
              }`}
            >
              P1
            </button>
            <button
              type="button"
              onClick={() => void changeMode("p2")}
              disabled={busy || modeBusy || actionBusy || !p2Available}
              aria-pressed={mode === "p2"}
              title={p2Available ? "P2 native RAM window" : p2DisabledTitle}
              className={`rounded px-2 py-1 text-xs ${
                mode === "p2"
                  ? "bg-emerald-600 text-white"
                  : "text-gray-300 hover:text-white disabled:text-gray-600"
              }`}
            >
              P2
            </button>
            <button
              type="button"
              onClick={() => void changeMode("p3")}
              disabled={busy || modeBusy || actionBusy || !p3Available}
              aria-pressed={mode === "p3"}
              title={p3Available ? "P3 plaintext OPFS" : p3DisabledTitle}
              className={`rounded px-2 py-1 text-xs ${
                mode === "p3"
                  ? "bg-amber-600 text-white"
                  : "text-gray-300 hover:text-white disabled:text-gray-600"
              }`}
            >
              P3
            </button>
          </div>
          {mode === "p2" && (
            <label className="flex items-center gap-1.5 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={sessionMetrics?.prefetch.enabled ?? false}
                disabled={busy}
                onChange={(event) => setPrefetch(event.target.checked)}
                className="accent-emerald-500"
              />
              Prefetch next
            </label>
          )}
          {mode === "p2" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clearRam}
              disabled={busy || status === "loading-frame"}
              className="text-gray-200 hover:text-white"
              title="Clear owned reusable native RAM; the displayed frame remains transient"
            >
              Clear RAM
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void copyMetrics()}
            disabled={!sessionMetrics}
            className="text-gray-200 hover:text-white"
            title="Copy synthetic metrics"
          >
            {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
            {copied ? "Copied" : "Metrics"}
          </Button>
          <button
            onClick={close}
            className="p-2 bg-gray-800 border border-gray-700 rounded-lg text-white hover:bg-red-900/50 hover:border-red-800"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <div ref={hostRef} className="absolute inset-0" />

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-3 rounded-lg bg-black/70 px-4 py-3 text-white">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              <span className="text-sm">
                {status === "initializing" ? "Initializing viewer" : "Loading metadata"}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute left-1/2 top-4 w-[min(92vw,720px)] -translate-x-1/2 rounded-lg border border-red-800 bg-red-950/90 px-4 py-3 text-sm text-red-100">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {status === "loading-frame" && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-gray-200">
            Loading frame {frameNumber}
          </div>
        )}
      </div>

      {mode === "p3" && sessionMetrics?.opfs && (
        <div className="border-t border-gray-800 px-4 py-2">
          <NativeFrameP3Status
            metrics={sessionMetrics.opfs}
            busy={modeBusy || actionBusy || busy}
            onRetry={() => void retryP3()}
            onRetryCleanup={() => void retryCleanup()}
          />
        </div>
      )}

      {mode === "p3" && residencyView && sessionMetrics?.opfs && (
        <div className="border-t border-gray-800 px-4 py-2">
          <NativeFrameP3ResidencyStrip
            view={residencyView}
            busy={
              modeBusy ||
              actionBusy ||
              busy ||
              status === "loading-frame"
            }
            onClearOpfs={() => void clearOpfs()}
            onClearBoth={() => void clearBoth()}
            notice={p3Notice}
            error={null}
          />
        </div>
      )}

      {residencyView && mode !== "p3" && (
        <div className="border-t border-gray-800 px-4 py-2 text-white">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="text-gray-300">
              Native RAM residency · frames {residencyView.startFrame}–{residencyView.endFrame} of{" "}
              {residencyView.totalFrames}
              {residencyView.resynchronized ? " · resynchronised" : ""}
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded border border-purple-800 px-1.5 py-0.5 text-purple-300 opacity-70">
                OPFS disabled / not implemented
              </span>
              {residencyView.limit < residencyView.totalFrames && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setStripStart(
                        Math.max(1, residencyView.startFrame - residencyView.limit),
                      )
                    }
                    disabled={residencyView.startFrame <= 1}
                    className="rounded px-2 py-0.5 text-gray-200 hover:bg-gray-800 disabled:text-gray-600"
                    title="Previous frame range (no fetch)"
                  >
                    Prev range
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setStripStart(
                        Math.max(
                          1,
                          Math.min(
                            residencyView.totalFrames - residencyView.limit + 1,
                            residencyView.endFrame + 1,
                          ),
                        ),
                      )
                    }
                    disabled={residencyView.endFrame >= residencyView.totalFrames}
                    className="rounded px-2 py-0.5 text-gray-200 hover:bg-gray-800 disabled:text-gray-600"
                    title="Next frame range (no fetch)"
                  >
                    Next range
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-1 flex flex-wrap gap-1">
            {residencyView.tiles.map((tile) => (
              <ResidencyTile key={tile.frameNumber} tile={tile} />
            ))}
          </div>

          <ResidencyLegend view={residencyView} />

          <div className="mt-1 space-y-0.5 text-[10px] text-gray-400">
            <div>
              RAM {cache?.entryCount ?? 0} frame(s) ·{" "}
              {formatKiB(cache?.retainedNativeBytes ?? 0)} /{" "}
              {formatKiB(cache?.limits.maxTotalNativeBytes ?? 0)} · mode{" "}
              {residencyView.mode.toUpperCase()} e{residencyView.modeEpoch} · source{" "}
              {residencyView.source ?? "none"} · frame-body{" "}
              {residencyView.frameBodyRequests} · metadata{" "}
              {residencyView.metadataRequests} · requested{" "}
              {residencyView.requestedFrame ?? "none"} · displayed{" "}
              {residencyView.displayedFrame ?? "none"}
            </div>
            <div>
              hits {cache?.hits ?? 0} / misses {cache?.misses ?? 0} · removals{" "}
              {residencyView.removals} (evictions+invalidations) · invalidations{" "}
              {residencyView.invalidations} · pending{" "}
              {residencyView.pendingFrameRequests} · errors{" "}
              {residencyView.errors} · window{" "}
              {windowBounds
                ? `${windowBounds.startFrame}–${windowBounds.endFrame}`
                : "n/a"}{" "}
              · decoded unavailable
            </div>
            <div>
              prefetch {residencyView.prefetch.enabled ? "on" : "off"} · calls{" "}
              {residencyView.prefetch.networkRequests} · demand joins{" "}
              {residencyView.prefetch.demandJoins} · useful{" "}
              {residencyView.prefetch.usefulRequests} (hits{" "}
              {residencyView.prefetch.usefulCompletedHits}/joins{" "}
              {residencyView.prefetch.usefulJoins}) · unused{" "}
              {residencyView.prefetch.unusedRequests} · cancelled{" "}
              {residencyView.prefetch.cancelledRequests} · pending{" "}
              {residencyView.prefetch.pendingFrames.length} · in-flight{" "}
              {formatKiB(residencyView.prefetch.inFlightExpectedBytes)} /{" "}
              {formatKiB(residencyView.prefetch.maxInFlightBytes)} · retiring{" "}
              {residencyView.prefetch.retiringFrames}/
              {formatKiB(residencyView.prefetch.retiringExpectedBytes)}
            </div>
          </div>
          {ramNotice && (
            <div className="mt-1 text-[10px] text-emerald-300">
              Reusable native RAM cleared; the displayed frame remains transient.
            </div>
          )}
        </div>
      )}

      <div className="border-t border-gray-800 px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void selectFrame(Math.max(1, frameNumber - 1))}
            disabled={modeBusy || actionBusy || frameNumber <= 1 || frameTotal === 0}
            className="text-gray-200 hover:text-white"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <input
            type="range"
            min={1}
            max={Math.max(1, frameTotal)}
            value={frameNumber}
            onChange={(event) => void selectFrame(Number(event.target.value))}
            disabled={modeBusy || actionBusy || frameTotal <= 1}
            className="flex-1 accent-blue-500"
            aria-label="Frame number"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void selectFrame(Math.min(frameTotal, frameNumber + 1))}
            disabled={modeBusy || actionBusy || frameTotal === 0 || frameNumber >= frameTotal}
            className="text-gray-200 hover:text-white"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        {metrics && (
          <div className="mt-2 text-xs text-gray-400">
            Last source ready {metrics.selectionToFrameResponseMs.toFixed(1)} ms · committed{" "}
            {metrics.selectionToFrameCommittedMs.toFixed(1)} ms · accepted{" "}
            {sessionMetrics?.acceptedSelections ?? 0}
          </div>
        )}
      </div>
    </div>
  );
}

function ResidencyTile({ tile }: { tile: NativeFrameResidencyTile }) {
  const base = tile.nativeRam
    ? "border-blue-300 bg-blue-700 text-white"
    : "border-gray-600 bg-gray-800 text-gray-300";
  const pending = tile.pending ? "ring-2 ring-yellow-300" : "";
  const error = tile.error ? "ring-2 ring-red-400" : "";
  const windowOutline = tile.inWindow
    ? "outline outline-1 outline-offset-1 outline-amber-300"
    : "";
  const label = `Frame ${tile.frameNumber}: ${tile.labels.join(", ")}; OPFS disabled`;

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className={`relative flex h-9 w-9 items-center justify-center rounded border text-[11px] font-semibold ${base} ${pending} ${error} ${windowOutline}`}
    >
      <span>{tile.frameNumber}</span>
      {tile.requested && (
        <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-0.5 text-[8px] leading-none">
          R
        </span>
      )}
      {tile.displayed && (
        <span className="absolute right-0.5 top-0.5 rounded bg-black/60 px-0.5 text-[8px] leading-none">
          D
        </span>
      )}
      {tile.inWindow && (
        <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-0.5 text-[8px] leading-none text-amber-200">
          W
        </span>
      )}
      {tile.prefetchPending && (
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded bg-black/60 px-0.5 text-[8px] leading-none text-sky-200">
          F
        </span>
      )}
      {tile.prefetchResident && (
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded bg-black/60 px-0.5 text-[8px] leading-none text-sky-200">
          P
        </span>
      )}
      {tile.pending && (
        <span className="absolute bottom-0.5 right-0.5 text-[10px] leading-none text-yellow-200">
          …
        </span>
      )}
      {tile.error && (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-red-900 px-0.5 text-[9px] leading-none text-red-100">
          !
        </span>
      )}
    </div>
  );
}

function ResidencyLegend({ view }: { view: NativeFrameResidencyView }) {
  return (
    <div
      className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-300"
      aria-label="Residency legend"
    >
      {view.legend.map((item) => (
        <span
          key={item.key}
          className={`inline-flex items-center gap-1 ${item.disabled ? "opacity-60" : ""}`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-sm border ${legendToneClass(item.tone)}`}
            aria-hidden="true"
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function legendToneClass(tone: NativeFrameResidencyView["legend"][number]["tone"]): string {
  switch (tone) {
    case "ram":
      return "border-blue-300 bg-blue-600";
    case "opfs":
      return "border-purple-300 bg-purple-700";
    case "both":
      return "border-white bg-gradient-to-r from-blue-600 to-purple-700";
    case "pending":
      return "border-yellow-200 bg-yellow-500";
    case "error":
      return "border-red-300 bg-red-600";
    case "prefetch":
      return "border-sky-300 bg-sky-700";
    case "requested":
    case "displayed":
    case "window":
      return "border-gray-300 bg-transparent";
    default:
      return "border-gray-500 bg-gray-700";
  }
}

function toMetrics(
  result: Extract<FrameSelectionResult, { status: "presented" }>,
): FrameMetrics {
  return {
    frameNumber: result.frameNumber,
    source: result.source,
    opfsSource: result.opfsSource,
    opfsCache: result.opfsCache,
    promotedToRam: result.promotedToRam,
    nativeCache: result.nativeCache,
    selectionToFrameResponseMs: result.selectionToFrameResponseMs,
    selectionToFrameCommittedMs: result.selectionToFrameCommittedMs,
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Native-frame request failed";
}

function formatKiB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `viewer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function alias(value: string, prefix: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}-${hash.toString(16).padStart(8, "0")}`;
}
