import { useCallback, useEffect, useRef, useState } from "react";
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
import type {
  NativeFrameContext,
  NativeFrameLocator,
} from "@/services/nativeFrameContract";
import { CornerstoneFramePresenter } from "@/services/nativeFramePresenter";
import {
  NativeFrameSession,
  type FrameSelectionResult,
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
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<NativeFrameSession | null>(null);
  const selectionRef = useRef(0);
  const [status, setStatus] = useState<ViewerStatus>("initializing");
  const [context, setContext] = useState<NativeFrameContext | null>(null);
  const [frameNumber, setFrameNumber] = useState(1);
  const [metrics, setMetrics] = useState<FrameMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let session: NativeFrameSession | null = null;

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
      session?.close();
    };
  }, [seriesInstanceUID, sopInstanceUID, studyInstanceUID]);

  const selectFrame = useCallback(
    async (nextFrame: number) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      const selection = ++selectionRef.current;
      setFrameNumber(nextFrame);
      setError(null);
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

  const close = useCallback(() => {
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
      if (!context) {
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
  }, [close, context, frameNumber, selectFrame]);

  const copyMetrics = async () => {
    if (!metrics) {
      return;
    }
    const payload = {
      fixtureAliases: {
        study: alias(locator.studyInstanceUID, "ST"),
        series: alias(locator.seriesInstanceUID, "SE"),
        instance: alias(locator.sopInstanceUID, "IN"),
      },
      sourceTransferSyntaxUID: context?.transferSyntaxUID ?? null,
      frameNumber: metrics.frameNumber,
      selectionToFrameResponseMs: metrics.selectionToFrameResponseMs,
      selectionToFrameCommittedMs: metrics.selectionToFrameCommittedMs,
      timingBasis: "selection-to-committed-frame",
      physicalPaintVerified: false,
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

  return (
    <div
      className="fixed inset-0 z-1000 bg-black/95 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Native frame viewer"
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-gray-800 text-white">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="text-xs text-gray-400">
            {frameTotal > 0
              ? `Frame ${frameNumber} / ${frameTotal}`
              : "Loading instance metadata"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void copyMetrics()}
            disabled={!metrics}
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

      <div className="border-t border-gray-800 px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void selectFrame(Math.max(1, frameNumber - 1))}
            disabled={frameNumber <= 1 || frameTotal === 0}
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
            disabled={frameTotal <= 1}
            className="flex-1 accent-blue-500"
            aria-label="Frame number"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void selectFrame(Math.min(frameTotal, frameNumber + 1))}
            disabled={frameTotal === 0 || frameNumber >= frameTotal}
            className="text-gray-200 hover:text-white"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        {metrics && (
          <div className="mt-2 text-xs text-gray-400">
            Frame response {metrics.selectionToFrameResponseMs.toFixed(1)} ms · committed{" "}
            {metrics.selectionToFrameCommittedMs.toFixed(1)} ms
          </div>
        )}
      </div>
    </div>
  );
}

function toMetrics(result: Extract<FrameSelectionResult, { status: "presented" }>): FrameMetrics {
  return {
    frameNumber: result.frameNumber,
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

function alias(value: string, prefix: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}-${hash.toString(16).padStart(8, "0")}`;
}
