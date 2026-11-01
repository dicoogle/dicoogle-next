import type { NativeFrameLocator } from "./nativeFrameContract";
import type { NativeFrameResidencyView } from "./nativeFrameResidency";
import type {
  NativeFrameP3Source,
  NativeFrameSessionMetrics,
} from "./nativeFrameSession";

export interface NativeFrameMetricsSnapshot {
  readonly frameNumber: number;
  readonly source: "network" | "ram";
  readonly opfsSource: "opfs" | null;
  readonly opfsCache: "hit" | "miss" | "invalid" | "not-applicable";
  readonly promotedToRam: boolean;
  readonly nativeCache: "hit" | "miss" | "not-applicable";
  readonly selectionToFrameResponseMs: number;
  readonly selectionToFrameCommittedMs: number;
}

export interface NativeFrameMetricsExportInput {
  readonly locator: NativeFrameLocator;
  readonly sourceTransferSyntaxUID: string | null;
  readonly frameMetrics: NativeFrameMetricsSnapshot | null;
  readonly sessionMetrics: NativeFrameSessionMetrics;
  readonly residencyView: NativeFrameResidencyView | null;
}

function alias(value: string, prefix: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}-${hash.toString(16).padStart(8, "0")}`;
}

export function buildNativeFrameMetricsExport(
  input: NativeFrameMetricsExportInput,
): Record<string, unknown> {
  const { locator, frameMetrics, sessionMetrics, residencyView } = input;
  const lastSource: NativeFrameP3Source | null = sessionMetrics.lastSource;
  return {
    fixtureAliases: {
      study: alias(locator.studyInstanceUID, "ST"),
      series: alias(locator.seriesInstanceUID, "SE"),
      instance: alias(locator.sopInstanceUID, "IN"),
    },
    sourceTransferSyntaxUID: input.sourceTransferSyntaxUID,
    frameNumber: frameMetrics?.frameNumber ?? sessionMetrics.displayedFrame,
    mode: sessionMetrics.mode,
    modeEpoch: sessionMetrics.modeEpoch,
    source: frameMetrics?.source ?? lastSource,
    lastSource,
    opfsSource: frameMetrics?.opfsSource ?? null,
    opfsCache: frameMetrics?.opfsCache ?? "not-applicable",
    promotedToRam: frameMetrics?.promotedToRam ?? false,
    nativeCache: frameMetrics?.nativeCache ?? null,
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
    selectionToFrameResponseMs:
      frameMetrics?.selectionToFrameResponseMs ?? null,
    selectionToFrameCommittedMs:
      frameMetrics?.selectionToFrameCommittedMs ?? null,
    timingBasis: "selection-to-source-ready-and-committed",
    physicalPaintVerified: false,
    decodedCacheObserved: false,
  };
}
