import type {
  NativeFrameResidencyEventBatch,
  NativeFramePrefetchMetrics,
  NativeFrameSessionCacheMetrics,
  NativeFrameSessionMetrics,
  NativeFrameSessionWindowMetrics,
} from "./nativeFrameSession";

export const NATIVE_FRAME_RESIDENCY_TILE_LIMIT = 24;
export const NATIVE_FRAME_RESIDENCY_DECODED_STATE = "unavailable";
export const NATIVE_FRAME_OPFS_STATUS = "disabled";

export interface NativeFrameResidencyState {
  readonly cacheId: string | null;
  readonly cacheRevision: number;
  readonly eventCursor: number;
  readonly frames: readonly number[];
  readonly resynchronized: boolean;
  readonly snapshot: NativeFrameSessionMetrics;
}

export interface NativeFrameResidencyRange {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly totalFrames: number;
  readonly limit: number;
}

export interface NativeFrameResidencyTile {
  readonly frameNumber: number;
  readonly nativeRam: boolean;
  readonly opfs: false;
  readonly opfsStatus: typeof NATIVE_FRAME_OPFS_STATUS;
  readonly residency: "absent" | "ram";
  readonly requested: boolean;
  readonly displayed: boolean;
  readonly pending: boolean;
  readonly prefetchPending: boolean;
  readonly prefetchResident: boolean;
  readonly error: boolean;
  readonly inWindow: boolean;
  readonly labels: readonly string[];
}

export type NativeFrameResidencyLegendTone =
  | "absent"
  | "ram"
  | "opfs"
  | "both"
  | "pending"
  | "error"
  | "requested"
  | "displayed"
  | "window"
  | "prefetch";

export interface NativeFrameResidencyLegendItem {
  readonly key: string;
  readonly label: string;
  readonly tone: NativeFrameResidencyLegendTone;
  readonly disabled: boolean;
}

export interface NativeFrameResidencyView {
  readonly cacheId: string | null;
  readonly cacheRevision: number;
  readonly eventCursor: number;
  readonly resynchronized: boolean;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly totalFrames: number;
  readonly limit: number;
  readonly tiles: readonly NativeFrameResidencyTile[];
  readonly legend: readonly NativeFrameResidencyLegendItem[];
  readonly opfsStatus: typeof NATIVE_FRAME_OPFS_STATUS;
  readonly decodedState: typeof NATIVE_FRAME_RESIDENCY_DECODED_STATE;
  readonly mode: NativeFrameSessionMetrics["mode"];
  readonly modeEpoch: number;
  readonly requestedFrame: number | null;
  readonly displayedFrame: number | null;
  readonly pendingFrame: number | null;
  readonly errorFrame: number | null;
  readonly prefetch: NativeFramePrefetchMetrics;
  readonly source: NativeFrameSessionMetrics["lastSource"];
  readonly frameBodyRequests: number;
  readonly metadataRequests: number;
  readonly pendingFrameRequests: number;
  readonly acceptedSelections: number;
  readonly errors: number;
  readonly removals: number;
  readonly invalidations: number;
  readonly cache: NativeFrameSessionCacheMetrics | null;
  readonly window: NativeFrameSessionWindowMetrics | null;
}

export const NATIVE_FRAME_RESIDENCY_LEGEND: readonly NativeFrameResidencyLegendItem[] =
  Object.freeze([
    Object.freeze({
      key: "absent",
      label: "Absent (grey)",
      tone: "absent",
      disabled: false,
    }),
    Object.freeze({
      key: "ram",
      label: "RAM (blue)",
      tone: "ram",
      disabled: false,
    }),
    Object.freeze({
      key: "opfs",
      label: "OPFS (purple) disabled / not implemented",
      tone: "opfs",
      disabled: true,
    }),
    Object.freeze({
      key: "both",
      label: "BOTH (split) disabled / not implemented",
      tone: "both",
      disabled: true,
    }),
    Object.freeze({
      key: "pending",
      label: "Pending (yellow)",
      tone: "pending",
      disabled: false,
    }),
    Object.freeze({
      key: "error",
      label: "Error (red)",
      tone: "error",
      disabled: false,
    }),
    Object.freeze({
      key: "requested",
      label: "Requested (R)",
      tone: "requested",
      disabled: false,
    }),
    Object.freeze({
      key: "displayed",
      label: "Displayed (D)",
      tone: "displayed",
      disabled: false,
    }),
    Object.freeze({
      key: "window",
      label: "Desired window (W)",
      tone: "window",
      disabled: false,
    }),
    Object.freeze({
      key: "prefetch-pending",
      label: "Prefetching (F)",
      tone: "prefetch",
      disabled: false,
    }),
    Object.freeze({
      key: "prefetch-resident",
      label: "Prefetched (P)",
      tone: "prefetch",
      disabled: false,
    }),
  ]);

export function reduceNativeFrameResidency(
  previous: NativeFrameResidencyState | null,
  snapshot: NativeFrameSessionMetrics,
  batch: NativeFrameResidencyEventBatch | null,
): NativeFrameResidencyState {
  const cacheId = snapshot.cache?.cacheId ?? null;
  const cacheFrames = snapshot.cache?.frames ?? [];
  const cacheRevision = snapshot.cache?.revision ?? 0;
  const resynchronize =
    previous === null ||
    snapshot.cache === null ||
    batch === null ||
    batch.cacheId !== cacheId ||
    batch.cacheId !== previous.cacheId ||
    batch.afterSequence !== previous.eventCursor ||
    batch.resynchronize;

  if (resynchronize) {
    return Object.freeze({
      cacheId,
      cacheRevision,
      eventCursor: snapshot.cache?.eventSequence ?? 0,
      frames: Object.freeze([...cacheFrames].sort((left, right) => left - right)),
      resynchronized: true,
      snapshot,
    });
  }

  const frames = new Set(previous.frames);
  for (const event of batch.events) {
    if (event.type === "clear") {
      frames.clear();
      continue;
    }
    if (event.frameNumber === null) {
      continue;
    }
    if (event.type === "insert" || event.type === "replace") {
      frames.add(event.frameNumber);
    } else {
      frames.delete(event.frameNumber);
    }
  }

  return Object.freeze({
    cacheId,
    cacheRevision,
    eventCursor: batch.latestSequence,
    frames: Object.freeze(
      Array.from(frames).sort((left, right) => left - right),
    ),
    resynchronized: false,
    snapshot,
  });
}

export function computeNativeFrameResidencyRange(
  totalFrames: number,
  focusFrame: number,
  limit = NATIVE_FRAME_RESIDENCY_TILE_LIMIT,
  requestedStart: number | null = null,
): NativeFrameResidencyRange {
  if (!Number.isSafeInteger(totalFrames) || totalFrames < 1) {
    return Object.freeze({
      startFrame: 1,
      endFrame: 0,
      totalFrames: Math.max(0, totalFrames),
      limit,
    });
  }
  const safeLimit = Number.isSafeInteger(limit) && limit > 0
    ? limit
    : NATIVE_FRAME_RESIDENCY_TILE_LIMIT;
  const size = Math.min(safeLimit, totalFrames);
  const maxStart = Math.max(1, totalFrames - size + 1);
  const focused = Math.min(totalFrames, Math.max(1, focusFrame));
  const centered = focused - Math.floor(size / 2);
  const startFrame = Math.min(
    maxStart,
    Math.max(1, requestedStart ?? centered),
  );
  const endFrame = Math.min(totalFrames, startFrame + size - 1);
  return Object.freeze({
    startFrame,
    endFrame,
    totalFrames,
    limit: safeLimit,
  });
}

export function buildNativeFrameResidencyView(
  state: NativeFrameResidencyState,
  totalFrames: number,
  requestedStart: number | null = null,
): NativeFrameResidencyView {
  const range = computeNativeFrameResidencyRange(
    totalFrames,
    state.snapshot.requestedFrame ?? state.snapshot.displayedFrame ?? 1,
    NATIVE_FRAME_RESIDENCY_TILE_LIMIT,
    requestedStart,
  );
  const resident = new Set(state.frames);
  const prefetchPending = new Set(state.snapshot.prefetch.pendingFrames);
  const prefetchResident = new Set(state.snapshot.prefetch.residentFrames);
  const window = state.snapshot.window;
  const tiles: NativeFrameResidencyTile[] = [];
  for (let frameNumber = range.startFrame; frameNumber <= range.endFrame; frameNumber += 1) {
    const nativeRam = resident.has(frameNumber);
    const requested = state.snapshot.requestedFrame === frameNumber;
    const displayed = state.snapshot.displayedFrame === frameNumber;
    const pending = state.snapshot.pendingFrame === frameNumber;
    const prefetching = prefetchPending.has(frameNumber);
    const prefetched = prefetchResident.has(frameNumber);
    const error = state.snapshot.errorFrame === frameNumber;
    const inWindow =
      window !== null &&
      frameNumber >= window.startFrame &&
      frameNumber <= window.endFrame;
    const labels = [
      nativeRam ? "RAM" : "Absent",
      ...(requested ? ["Requested"] : []),
      ...(displayed ? ["Displayed"] : []),
      ...(pending ? ["Pending"] : []),
      ...(prefetching ? ["Prefetching"] : []),
      ...(prefetched ? ["Prefetched"] : []),
      ...(error ? ["Error"] : []),
      ...(inWindow ? ["Window"] : []),
    ];
    tiles.push(
      Object.freeze({
        frameNumber,
        nativeRam,
        opfs: false,
        opfsStatus: NATIVE_FRAME_OPFS_STATUS,
        residency: nativeRam ? "ram" : "absent",
        requested,
        displayed,
        pending,
        prefetchPending: prefetching,
        prefetchResident: prefetched,
        error,
        inWindow,
        labels: Object.freeze(labels),
      }),
    );
  }

  const cache = state.snapshot.cache;
  return Object.freeze({
    cacheId: state.cacheId,
    cacheRevision: state.cacheRevision,
    eventCursor: state.eventCursor,
    resynchronized: state.resynchronized,
    startFrame: range.startFrame,
    endFrame: range.endFrame,
    totalFrames: range.totalFrames,
    limit: range.limit,
    tiles: Object.freeze(tiles),
    legend: NATIVE_FRAME_RESIDENCY_LEGEND,
    opfsStatus: NATIVE_FRAME_OPFS_STATUS,
    decodedState: NATIVE_FRAME_RESIDENCY_DECODED_STATE,
    mode: state.snapshot.mode,
    modeEpoch: state.snapshot.modeEpoch,
    requestedFrame: state.snapshot.requestedFrame,
    displayedFrame: state.snapshot.displayedFrame,
    pendingFrame: state.snapshot.pendingFrame,
    errorFrame: state.snapshot.errorFrame,
    prefetch: state.snapshot.prefetch,
    source: state.snapshot.lastSource,
    frameBodyRequests: state.snapshot.frameBodyRequests,
    metadataRequests: state.snapshot.metadataRequests,
    pendingFrameRequests: state.snapshot.pendingFrameRequests,
    acceptedSelections: state.snapshot.acceptedSelections,
    errors: state.snapshot.errors,
    removals: cache?.evictions ?? 0,
    invalidations: cache?.invalidations ?? 0,
    cache,
    window,
  });
}
