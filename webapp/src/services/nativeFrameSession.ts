import {
  invalidRequest,
  isAbortError,
  NATIVE_FRAME_REPRESENTATION,
  NativeFrameError,
  validateFrameNumber,
  type NativeFrameContext,
  type NativeFrameLocator,
  type WrappedSingleFrame,
} from "./nativeFrameContract";
import { resolveNativeFrameSourceVersion } from "./nativeFrameFixture";
import {
  calculateNativeFramePrefetchTarget,
  DEFAULT_NATIVE_FRAME_PREFETCH_LIMITS,
  NATIVE_FRAME_PREFETCH_RULE,
} from "./nativeFramePrefetch";
import {
  fetchInstanceMetadata,
  type InstanceMetadata,
  type InstanceMetadataOptions,
} from "./nativeFrameMetadata";
import { buildWrappedSingleFramePart10 } from "./nativeFramePart10";
import type { FramePresenter } from "./nativeFramePresenter";
import {
  createNativeFrameCacheKey,
  DEFAULT_NATIVE_RAM_CACHE_LIMITS,
  NativeRamCache,
  type NativeFrameCacheKey,
  type NativeRamCacheClearResult,
  type NativeRamCacheEntry,
  type NativeRamCacheLimits,
  type NativeRamCacheSnapshot,
} from "./nativeRamCache";
import {
  createNativeRamWindow,
  DEFAULT_NATIVE_RAM_WINDOW_POLICY,
  planNativeRamWindowAdmission,
  planNativeRamWindowRetention,
  type NativeRamWindow,
  type NativeRamWindowEviction,
  type NativeRamWindowPolicyConfig,
  type NativeRamWindowResident,
} from "./nativeRamWindowPolicy";
import { fetchNativeFrame } from "./nativeFrameTransport";
import {
  DEFAULT_NATIVE_FRAME_DUAL_WINDOW_CONFIG,
  DEFAULT_NATIVE_FRAME_DUAL_WINDOW_LIMITS,
  planNativeFrameDualWindowPolicy,
  type NativeFrameDualWindowConfig,
  type NativeFrameDualWindowDescriptor,
  type NativeFrameDualWindowIncoming,
  type NativeFrameDualWindowLimits,
  type NativeFrameDualWindowPendingDelete,
  type NativeFrameDualWindowPendingWrite,
  type NativeFrameDualWindowPolicyInput,
} from "./nativeFrameDualWindowPolicy";
import {
  NativeFramePlaintextOpfs,
  type NativeFramePlaintextOpfsEventBatch,
  type NativeFramePlaintextOpfsSnapshot,
} from "./nativeFramePlaintextOpfs";
import { getNativeFrameFixtureDigest } from "./nativeFrameFixtureDigests";

type MetadataLoader = (
  locator: NativeFrameLocator,
  options: InstanceMetadataOptions,
) => Promise<InstanceMetadata>;

type FrameLoader = typeof fetchNativeFrame;
type WrapperBuilder = (
  locator: NativeFrameLocator,
  context: NativeFrameContext,
  pixels: Uint8Array,
) => WrappedSingleFrame;

function randomOpaqueId(prefix: string): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto?.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("")}`;
}

export type NativeFrameMode = "p1" | "p2" | "p3";
export type NativeFrameSource = "network" | "ram";
export type NativeFrameP3Source = NativeFrameSource | "opfs";
export type NativeFrameNativeCache = "hit" | "miss" | "not-applicable";
export type NativeFrameP3Status =
  | "disabled"
  | "enabled"
  | "degraded"
  | "cleanup-required"
  | "closed";
export type NativeFrameOpfsCache = "hit" | "miss" | "invalid" | "not-applicable";

export interface NativeFrameP2Scope {
  principalId: string;
  sessionId: string;
}

export interface NativeFrameP3Options {
  adapter?: NativeFramePlaintextOpfs;
  namespaceId?: string;
  ownerId?: string;
  generation?: number;
  limits?: NativeFrameDualWindowLimits;
  config?: NativeFrameDualWindowConfig;
}

export interface NativeFrameSessionOptions {
  baseUrl: string;
  token?: string | null;
  presenter: FramePresenter;
  fetchImpl?: typeof fetch;
  loadMetadata?: MetadataLoader;
  loadFrame?: FrameLoader;
  buildWrapped?: WrapperBuilder;
  now?: () => number;
  mode?: NativeFrameMode;
  cacheScope?: NativeFrameP2Scope;
  cacheLimits?: NativeRamCacheLimits;
  windowConfig?: NativeRamWindowPolicyConfig;
  prefetchEnabled?: boolean;
  prefetchMaxInFlightBytes?: number;
  p3?: NativeFrameP3Options;
  p3Digest?: (locator: NativeFrameLocator, frameNumber: number) => string | null;
}

export interface NativeFrameModeResult {
  readonly mode: NativeFrameMode;
  readonly status: "enabled" | "degraded" | "failed" | "closed";
  readonly reason?: string;
  readonly storageError?: string;
}

export type FrameSelectionResult =
  | { status: "stale" }
  | {
      status: "presented";
      requestId: number;
      frameNumber: number;
      imageId: string;
      source: NativeFrameSource;
      opfsSource: "opfs" | null;
      nativeCache: NativeFrameNativeCache;
      opfsCache: NativeFrameOpfsCache;
      promotedToRam: boolean;
      selectionToFrameResponseMs: number;
      selectionToFrameCommittedMs: number;
    };

export interface NativeFrameSessionWindowMetrics {
  startFrame: number;
  endFrame: number;
  behind: number;
  ahead: number;
  epoch: number;
}

export interface NativeFrameSessionCacheMetrics {
  cacheId: string;
  revision: number;
  eventSequence: number;
  oldestEventSequence: number | null;
  droppedEventCount: number;
  hits: number;
  misses: number;
  evictions: number;
  invalidations: number;
  bypasses: number;
  entryCount: number;
  retainedNativeBytes: number;
  frames: readonly number[];
  limits: NativeRamCacheLimits;
}

export interface NativeFramePrefetchMetrics {
  enabled: boolean;
  rule: typeof NATIVE_FRAME_PREFETCH_RULE;
  queuedFrames: number;
  inFlightFrames: number;
  inFlightExpectedBytes: number;
  retiringFrames: number;
  retiringExpectedBytes: number;
  maxQueuedFrames: number;
  maxInFlightFrames: number;
  maxInFlightBytes: number;
  pendingFrames: readonly number[];
  residentFrames: readonly number[];
  networkRequests: number;
  demandJoins: number;
  usefulCompletedHits: number;
  usefulJoins: number;
  usefulRequests: number;
  usefulNativeBytes: number;
  unusedRequests: number;
  unusedNativeBytes: number;
  cancelledRequests: number;
  cancelledExpectedBytes: number;
  cancelledNativeBytes: number;
  budgetSkipped: number;
  oversizeSkipped: number;
}

export interface NativeFrameSessionMetrics {
  mode: NativeFrameMode;
  modeEpoch: number;
  acceptedSelections: number;
  frameBodyRequests: number;
  demandFrameBodyRequests: number;
  prefetchFrameBodyRequests: number;
  metadataRequests: number;
  pendingFrameRequests: number;
  errors: number;
  lastSource: NativeFrameP3Source | null;
  requestedFrame: number | null;
  displayedFrame: number | null;
  pendingFrame: number | null;
  errorFrame: number | null;
  window: NativeFrameSessionWindowMetrics | null;
  cache: NativeFrameSessionCacheMetrics | null;
  prefetch: NativeFramePrefetchMetrics;
  opfs: NativeFrameP3Metrics | null;
}

export interface NativeFrameP3WindowBounds {
  readonly startFrame: number;
  readonly endFrame: number;
}

export interface NativeFrameP3Metrics {
  readonly status: NativeFrameP3Status;
  readonly source: NativeFrameP3Source | null;
  readonly cache: NativeFrameOpfsCache;
  readonly promotedToRam: boolean;
  readonly entries: number;
  readonly committedNativeBytes: number;
  readonly committedFileBytes: number;
  readonly pendingWrites: number;
  readonly pendingDeletes: number;
  readonly rootFileBytes: number;
  readonly deletedBytes: number;
  readonly errors: Readonly<Record<string, number>>;
  readonly storageError: string | null;
  readonly frames: readonly number[];
  readonly pendingWriteFrames: readonly number[];
  readonly pendingDeleteFrames: readonly number[];
  readonly errorFrames: readonly number[];
  readonly ineligibleFrames: readonly number[];
  readonly readingFrame: number | null;
  readonly networkPendingFrame: number | null;
  readonly ramWindow: NativeFrameP3WindowBounds | null;
  readonly opfsWindow: NativeFrameP3WindowBounds | null;
}

export interface NativeFrameP3ClearResult {
  readonly status: "cleared" | "failed" | "unavailable";
  readonly reason?: string;
  readonly clearedEntries: number;
  readonly clearedNativeBytes: number;
  readonly failedEntries: number;
  readonly failedFileBytes: number;
}

export interface NativeFrameP3ClearBothResult {
  readonly status: "cleared" | "partial" | "failed";
  readonly ramCleared: boolean;
  readonly opfs: NativeFrameP3ClearResult | null;
  readonly reason?: string;
}

export type NativeFrameResidencyEventType =
  | "insert"
  | "replace"
  | "evict"
  | "invalidate"
  | "clear";

export interface NativeFrameResidencyEvent {
  readonly sequence: number;
  readonly revision: number;
  readonly type: NativeFrameResidencyEventType;
  readonly frameNumber: number | null;
  readonly nativeBytes: number;
  readonly previousNativeBytes?: number;
  readonly reason?: string;
}

export interface NativeFrameResidencyEventBatch {
  readonly cacheId: string | null;
  readonly events: readonly NativeFrameResidencyEvent[];
  readonly afterSequence: number;
  readonly oldestRetainedSequence: number | null;
  readonly latestSequence: number;
  readonly droppedForCursor: number;
  readonly droppedEventCount: number;
  readonly resynchronize: boolean;
}

export interface NativeFrameResidencyUpdate {
  readonly snapshot: NativeFrameSessionMetrics;
  readonly batch: NativeFrameResidencyEventBatch;
}

export type NativeFrameResidencyListener = (
  update: NativeFrameResidencyUpdate,
) => void;

interface PrefetchTarget {
  readonly key: NativeFrameCacheKey;
  readonly frameNumber: number;
  readonly expectedBytes: number;
  readonly windowEpoch: number;
  readonly modeEpoch: number;
  readonly prefetchEpoch: number;
  readonly ramEpoch: number;
  readonly lifecycleEpoch: number;
}

interface PrefetchJob extends PrefetchTarget {
  readonly token: number;
  readonly controller: AbortController;
  promise: Promise<Uint8Array>;
  joinedDemand: {
    requestId: number;
    ramEpoch: number;
    window: NativeRamWindow;
  } | null;
  joinedUseful: boolean;
  cancelled: boolean;
  released: boolean;
}

interface SpeculativeEntry {
  readonly frameNumber: number;
  readonly nativeBytes: number;
}

interface P3Entry {
  readonly key: NativeFrameCacheKey;
  alias: string;
  nativeBytes: number;
  fileBytes: number;
  lastAccessOrdinal: number;
}

interface P3PendingPublication {
  readonly token: number;
  readonly key: NativeFrameCacheKey;
  readonly bytes: Uint8Array;
  phase: "planned" | "deleting" | "writing";
  superseded: boolean;
}

interface P3PendingWrite {
  readonly key: NativeFrameCacheKey;
  readonly nativeBytes: number;
  readonly fileBytes: number;
}

interface P3PendingDelete {
  readonly key: NativeFrameCacheKey;
  readonly alias: string;
  readonly nativeBytes: number;
  readonly fileBytes: number;
}

interface P3Counters {
  writes: number;
  deletes: number;
  promotions: number;
  errors: Record<string, number>;
}

export class NativeFrameSession {
  private readonly metadataLoader: MetadataLoader;
  private readonly frameLoader: FrameLoader;
  private readonly wrapperBuilder: WrapperBuilder;
  private readonly now: () => number;
  private readonly p2Scope: NativeFrameP2Scope | null;
  private readonly cacheLimits: NativeRamCacheLimits;
  private readonly windowConfig: NativeRamWindowPolicyConfig;
  private readonly residentKeys = new Map<string, NativeFrameCacheKey>();
  private readonly residencyListeners = new Set<() => void>();
  private readonly speculativeEntries = new Map<string, SpeculativeEntry>();
  private readonly prefetchMaxInFlightBytesOption: number | null;
  private context: NativeFrameContext | null = null;
  private metadataAbort: AbortController | null = null;
  private frameAbort: AbortController | null = null;
  private cache: NativeRamCache | null = null;
  private activeWindow: NativeRamWindow | null = null;
  private prefetchInFlight: PrefetchJob | null = null;
  private prefetchRetiring: PrefetchJob | null = null;
  private prefetchQueue: PrefetchTarget | null = null;
  private prefetchEnabled = false;
  private prefetchEpoch = 0;
  private prefetchToken = 0;
  private prefetchCounters = {
    demandJoins: 0,
    usefulCompletedHits: 0,
    usefulJoins: 0,
    usefulNativeBytes: 0,
    unusedRequests: 0,
    unusedNativeBytes: 0,
    cancelledRequests: 0,
    cancelledExpectedBytes: 0,
    cancelledNativeBytes: 0,
    budgetSkipped: 0,
    oversizeSkipped: 0,
  };
  private demandFrameBodyRequests = 0;
  private prefetchFrameBodyRequests = 0;
  private mode: NativeFrameMode;
  private modeEpoch = 0;
  private frameLifecycleEpoch = 0;
  private generation = 0;
  private windowEpoch = 0;
  private ramEpoch = 0;
  private acceptedSelections = 0;
  private frameBodyRequests = 0;
  private metadataRequests = 0;
  private pendingFrameRequests = 0;
  private errors = 0;
  private lastSource: NativeFrameP3Source | null = null;
  private requestedFrame: number | null = null;
  private displayedFrame: number | null = null;
  private pendingFrame: number | null = null;
  private errorFrame: number | null = null;
  private closed = false;
  private readonly p3Option: NativeFrameP3Options | null;
  private readonly p3Digest: (
    locator: NativeFrameLocator,
    frameNumber: number,
  ) => string | null;
  private p3Adapter: NativeFramePlaintextOpfs | null = null;
  private p3Status: NativeFrameP3Status = "disabled";
  private p3StorageError: string | null = null;
  private p3Generation = 0;
  private p3OpfsEpoch = 0;
  private p3MapRevision = 0;
  private p3AccessOrdinal = 0;
  private p3EventCursor = 0;
  private p3Map = new Map<string, P3Entry>();
  private p3AliasKeys = new Map<string, NativeFrameCacheKey>();
  private p3PendingPublication: P3PendingPublication | null = null;
  private p3PublicationPromise: Promise<void> | null = null;
  private p3PendingWrite: P3PendingWrite | null = null;
  private p3PendingDeletes = new Map<string, P3PendingDelete>();
  private p3ErrorFrames = new Set<number>();
  private p3IneligibleFrames = new Set<number>();
  private p3ReadingFrame: number | null = null;
  private p3NetworkPendingFrame: number | null = null;
  private p3ClearEpoch = 0;
  private p3Clearing = false;
  private p3Counters: P3Counters = {
    writes: 0,
    deletes: 0,
    promotions: 0,
    errors: {},
  };
  private p3LastSource: NativeFrameP3Source | null = null;
  private p3LastCache: NativeFrameOpfsCache = "not-applicable";
  private p3LastPromoted = false;
  private p3LastKey: NativeFrameCacheKey | null = null;
  private modeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly locator: NativeFrameLocator,
    private readonly options: NativeFrameSessionOptions,
  ) {
    this.metadataLoader = options.loadMetadata ?? fetchInstanceMetadata;
    this.frameLoader = options.loadFrame ?? fetchNativeFrame;
    this.wrapperBuilder = options.buildWrapped ?? buildWrappedSingleFramePart10;
    this.now = options.now ?? (() => performance.now());
    this.p2Scope = options.cacheScope ?? null;
    this.p3Option = options.p3 ?? null;
    this.p3Digest = options.p3Digest ?? getNativeFrameFixtureDigest;
    this.cacheLimits = options.cacheLimits ?? DEFAULT_NATIVE_RAM_CACHE_LIMITS;
    this.windowConfig =
      options.windowConfig ?? DEFAULT_NATIVE_RAM_WINDOW_POLICY;
    if (
      options.prefetchMaxInFlightBytes !== undefined &&
      (!Number.isSafeInteger(options.prefetchMaxInFlightBytes) ||
        options.prefetchMaxInFlightBytes < 1)
    ) {
      throw invalidRequest("Prefetch in-flight byte budget must be positive");
    }
    this.prefetchMaxInFlightBytesOption =
      options.prefetchMaxInFlightBytes ?? null;
    const mode = options.mode ?? "p1";
    if (mode !== "p1" && mode !== "p2") {
      throw invalidRequest("Unsupported native-frame session mode");
    }
    this.mode = mode;
    if (this.mode === "p2") {
      this.assertP2Available();
      this.cache = this.createP2Cache();
      this.prefetchEnabled = options.prefetchEnabled === true;
    }
  }

  async open(): Promise<NativeFrameContext> {
    this.assertOpen();
    if (this.context) {
      return this.context;
    }

    const controller = new AbortController();
    this.metadataAbort = controller;
    this.metadataRequests += 1;
    const metadata = await this.metadataLoader(this.locator, {
      baseUrl: this.options.baseUrl,
      token: this.options.token,
      fetchImpl: this.options.fetchImpl,
      signal: controller.signal,
    });

    if (this.closed || this.metadataAbort !== controller) {
      throw new NativeFrameError("invalid-request", "Native-frame session is closed");
    }

    this.metadataAbort = null;
    this.context = metadata.context;
    return metadata.context;
  }

  setMode(mode: NativeFrameMode): void {
    this.assertOpen();
    if (mode === "p3") {
      throw invalidRequest("P3 requires setModeAsync");
    }
    if (this.mode === "p3") {
      throw invalidRequest("P3 must be exited with setModeAsync");
    }
    this.applyStandardMode(mode);
  }

  async setModeAsync(mode: NativeFrameMode): Promise<NativeFrameModeResult> {
    const operation = this.enqueueMode(async () => {
      this.assertOpen();
      if (mode === "p3") {
        return this.enterP3();
      }
      if (this.mode === "p3") {
        const exit = await this.exitP3();
        if (exit.status !== "closed") {
          return exit;
        }
      }
      this.applyStandardMode(mode);
      return { mode, status: "enabled" as const };
    });
    return operation;
  }

  async closeP3(): Promise<NativeFrameModeResult> {
    return this.enqueueMode(async () => this.closeP3Internal());
  }

  async retryCloseP3(): Promise<NativeFrameModeResult> {
    return this.enqueueMode(async () => this.closeP3Internal());
  }

  private applyStandardMode(mode: "p1" | "p2"): void {
    if (mode === this.mode) {
      return;
    }
    let nextCache: NativeRamCache | null = null;
    if (mode === "p2") {
      this.assertP2Available();
      nextCache = this.createP2Cache();
    }

    const requestId = ++this.generation;
    this.frameAbort?.abort();
    this.frameAbort = null;
    this.options.presenter.begin(requestId);
    this.disposeP2State();
    this.mode = mode;
    this.modeEpoch += 1;
    this.frameLifecycleEpoch += 1;
    this.windowEpoch = 0;
    this.ramEpoch += 1;
    this.acceptedSelections = 0;
    this.frameBodyRequests = 0;
    this.demandFrameBodyRequests = 0;
    this.prefetchFrameBodyRequests = 0;
    this.pendingFrameRequests = 0;
    this.errors = 0;
    this.lastSource = null;
    this.requestedFrame = null;
    this.pendingFrame = null;
    this.errorFrame = null;
    this.cache = nextCache;
    this.resetPrefetchState(true);
    this.publishResidency();
  }

  private enqueueMode<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.modeQueue.then(operation, operation);
    this.modeQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private assertP3Available(): void {
    if (!this.p2Scope || !this.p3Option) {
      throw invalidRequest("P3 requires an authenticated cache scope and P3 options");
    }
    if (!resolveNativeFrameSourceVersion(this.locator)) {
      throw invalidRequest("P3 is available only for recognised synthetic fixture instances");
    }
  }

  private createP3Adapter(): NativeFramePlaintextOpfs {
    if (this.p3Option?.adapter) {
      return this.p3Option.adapter;
    }
    return new NativeFramePlaintextOpfs({
      namespaceId: this.p3Option?.namespaceId ?? randomOpaqueId("p3-ns"),
      ownerId: this.p3Option?.ownerId ?? randomOpaqueId("p3-owner"),
      generation: this.p3Option?.generation ?? 1,
    });
  }

  private async enterP3(): Promise<NativeFrameModeResult> {
    if (this.mode === "p3") {
      if (this.p3Status === "enabled") {
        return { mode: "p3", status: "enabled" };
      }
      if (this.p3Status === "cleanup-required") {
        return {
          mode: "p3",
          status: "failed",
          reason: "cleanup-required",
          storageError: this.p3StorageError ?? "OPFS cleanup pending",
        };
      }
      if (this.p3Status === "closed") {
        return {
          mode: "p3",
          status: "failed",
          reason: "closed",
          storageError: this.p3StorageError ?? "OPFS storage is closed",
        };
      }
    }
    try {
      this.assertP3Available();
    } catch (error) {
      return {
        mode: this.mode,
        status: "failed",
        reason: "p3-unavailable",
        storageError: error instanceof Error ? error.message : "P3 unavailable",
      };
    }

    const requestId = ++this.generation;
    this.frameAbort?.abort();
    this.frameAbort = null;
    this.options.presenter.begin(requestId);
    this.disposeP2State();
    this.disposeP3AdapterState();
    this.mode = "p3";
    this.modeEpoch += 1;
    this.frameLifecycleEpoch += 1;
    this.p3Generation += 1;
    this.windowEpoch = 0;
    this.ramEpoch += 1;
    this.acceptedSelections = 0;
    this.frameBodyRequests = 0;
    this.demandFrameBodyRequests = 0;
    this.prefetchFrameBodyRequests = 0;
    this.pendingFrameRequests = 0;
    this.errors = 0;
    this.lastSource = null;
    this.requestedFrame = null;
    this.pendingFrame = null;
    this.errorFrame = null;
    this.cache = this.createP2Cache();
    this.resetPrefetchState(true);
    this.p3Status = "degraded";
    this.p3StorageError = null;
    this.p3LastSource = null;
    this.p3LastCache = "not-applicable";
    this.p3LastPromoted = false;
    this.p3LastKey = null;
    this.p3Counters = { writes: 0, deletes: 0, promotions: 0, errors: {} };
    this.p3Map.clear();
    this.p3AliasKeys.clear();
    this.p3PendingPublication = null;
    this.p3PendingWrite = null;
    this.p3PendingDeletes.clear();
    this.p3ErrorFrames.clear();
    this.p3IneligibleFrames.clear();
    this.p3ReadingFrame = null;
    this.p3NetworkPendingFrame = null;
    this.p3Clearing = false;
    this.p3ClearEpoch += 1;
    this.p3EventCursor = 0;
    this.publishResidency();

    const adapter = this.createP3Adapter();
    this.p3Adapter = adapter;
    const opened = await adapter.open();
    if (this.closed || this.p3Adapter !== adapter || this.mode !== "p3") {
      try {
        await adapter.close();
      } catch {
        // The mode/generation check below leaves the state visible.
      }
      return { mode: this.mode, status: "failed", reason: "stale-mode-entry" };
    }
    if (opened.status === "opened" && opened.capabilities.move) {
      this.p3Status = "enabled";
      this.p3StorageError = null;
      await this.reconcileP3Events();
      this.publishResidency();
      return { mode: "p3", status: "enabled" };
    }

    this.p3Status = "degraded";
    this.p3StorageError =
      opened.reason ?? (opened.status === "opened" ? "move-unavailable" : "storage-unavailable");
    this.p3Adapter = null;
    try {
      await adapter.close();
    } catch {
      // Degraded P3 does not claim OPFS cleanup.
    }
    this.publishResidency();
    return {
      mode: "p3",
      status: "degraded",
      reason: this.p3StorageError,
      storageError: this.p3StorageError,
    };
  }

  private async exitP3(): Promise<NativeFrameModeResult> {
    if (this.mode !== "p3") {
      return { mode: this.mode, status: "closed" };
    }
    this.p3Generation += 1;
    const adapter = this.p3Adapter;
    if (adapter) {
      const closed = await adapter.close();
      if (closed.status === "failed") {
        this.p3Status = "cleanup-required";
        this.p3StorageError = closed.reason ?? "OPFS cleanup pending";
        return {
          mode: "p3",
          status: "failed",
          reason: closed.reason ?? "write-in-flight",
          storageError: this.p3StorageError,
        };
      }
    }
    this.disposeP3AdapterState();
    this.p3Status = "disabled";
    this.p3StorageError = null;
    return { mode: this.mode, status: "closed" };
  }

  private async closeP3Internal(): Promise<NativeFrameModeResult> {
    if (this.mode !== "p3" && !this.p3Adapter) {
      return { mode: this.mode, status: "closed" };
    }
    this.p3Generation += 1;
    const adapter = this.p3Adapter;
    if (adapter) {
      const closed = await adapter.close();
      if (closed.status === "failed") {
        this.p3Status = "cleanup-required";
        this.p3StorageError = closed.reason ?? "OPFS cleanup pending";
        return {
          mode: "p3",
          status: "failed",
          reason: closed.reason ?? "write-in-flight",
          storageError: this.p3StorageError,
        };
      }
    }
    this.disposeP3AdapterState();
    this.p3Status = "closed";
    return { mode: "p3", status: "closed" };
  }

  private disposeP3AdapterState(): void {
    this.p3Adapter = null;
    this.p3Map.clear();
    this.p3AliasKeys.clear();
    this.p3PendingPublication = null;
    this.p3PendingWrite = null;
    this.p3PendingDeletes.clear();
    this.p3ErrorFrames.clear();
    this.p3IneligibleFrames.clear();
    this.p3ReadingFrame = null;
    this.p3NetworkPendingFrame = null;
    this.p3Clearing = false;
    this.p3ClearEpoch += 1;
    this.p3EventCursor = 0;
    this.p3LastSource = null;
    this.p3LastCache = "not-applicable";
    this.p3LastPromoted = false;
    this.p3LastKey = null;
    this.p3MapRevision += 1;
  }

  setPrefetchEnabled(enabled: boolean): void {
    this.assertOpen();
    if (enabled) {
      if (this.mode !== "p2") {
        throw invalidRequest("Prefetch is available only in P2 mode");
      }
      if (this.prefetchEnabled) {
        return;
      }
      this.prefetchEnabled = true;
      this.prefetchEpoch += 1;
      this.publishResidency();
      return;
    }
    if (!this.prefetchEnabled) {
      return;
    }
    this.prefetchEnabled = false;
    this.prefetchEpoch += 1;
    this.dropQueuedPrefetch();
    this.speculativeEntries.clear();
    if (this.prefetchInFlight && !this.prefetchInFlight.joinedDemand) {
      this.cancelPrefetchJob(this.prefetchInFlight);
    }
    this.publishResidency();
  }

  async selectFrame(frameNumber: number): Promise<FrameSelectionResult> {
    this.assertOpen();
    const context = this.context;
    if (!context) {
      throw invalidRequest("Native-frame metadata has not been loaded");
    }

    const requestId = ++this.generation;
    const ramEpoch = this.ramEpoch;
    const p3ClearEpoch = this.p3ClearEpoch;
    const previousFrame = this.requestedFrame;
    this.frameAbort?.abort();
    const controller = new AbortController();
    this.frameAbort = controller;
    this.options.presenter.begin(requestId);
    this.dropQueuedPrefetch();
    this.requestedFrame = frameNumber;
    this.pendingFrame = frameNumber;
    this.errorFrame = null;
    this.publishResidency();
    const start = this.now();
    let source: NativeFrameSource = "network";
    let opfsSource: "opfs" | null = null;
    let nativeCache: NativeFrameNativeCache = "not-applicable";
    let opfsCache: NativeFrameOpfsCache = "not-applicable";
    let promotedToRam = false;
    let cache: NativeRamCache | null = null;
    let window: NativeRamWindow | null = null;
    let key: NativeFrameCacheKey | null = null;
    let joinedPrefetch: PrefetchJob | null = null;

    try {
      let bytes: Uint8Array = new Uint8Array();
      if (this.mode === "p2" || this.mode === "p3") {
        cache = this.cache;
        if (!cache) {
          throw invalidRequest("Native-frame cache is not available");
        }
        validateFrameNumber(frameNumber, context);
        key = this.cacheKey(frameNumber, context);
        window = createNativeRamWindow({
          selectedKey: key,
          numberOfFrames: context.numberOfFrames,
          epoch: ++this.windowEpoch,
          config: this.windowConfig,
        });
        this.activeWindow = window;
        cache.setActiveGeneration(requestId);
        if (!this.applyRetention(cache, window, requestId)) {
          return { status: "stale" };
        }
        this.publishResidency();

        if (
          this.mode === "p2" &&
          this.prefetchInFlight &&
          !sameKey(this.prefetchInFlight.key, key)
        ) {
          this.cancelPrefetchJob(this.prefetchInFlight);
        }

        const lookup = cache.get(key);
        if (lookup.status === "hit") {
          bytes = lookup.bytes;
          source = "ram";
          nativeCache = "hit";
          this.markSpeculativeUseful(lookup.entry);
        } else {
          nativeCache = "miss";
          if (this.mode === "p3") {
            const opfsResult = await this.readP3Opfs(
              key,
              frameNumber,
              context,
              requestId,
            );
            opfsCache = opfsResult.opfsCache;
            promotedToRam = opfsResult.promotedToRam;
            if (opfsResult.bytes) {
              bytes = opfsResult.bytes;
              // Legacy result.source remains a local/network renderer label;
              // opfsSource and metrics.opfs.source carry the true P3 source.
              source = "ram";
              opfsSource = "opfs";
            }
          }
          if (opfsSource === null) {
            if (
              this.mode === "p2" &&
              this.prefetchInFlight &&
              sameKey(this.prefetchInFlight.key, key)
            ) {
              joinedPrefetch = this.prefetchInFlight;
              joinedPrefetch.joinedDemand = { requestId, ramEpoch, window };
              this.prefetchCounters.demandJoins += 1;
              bytes = await joinedPrefetch.promise;
            } else {
              if (this.mode === "p3") {
                this.p3NetworkPendingFrame = frameNumber;
                this.publishResidency();
              }
              try {
                bytes = await this.loadFrameBytes(
                  frameNumber,
                  context,
                  controller.signal,
                );
              } finally {
                if (
                  this.mode === "p3" &&
                  this.p3NetworkPendingFrame === frameNumber
                ) {
                  this.p3NetworkPendingFrame = null;
                  this.publishResidency();
                }
              }
            }
          }
        }
      } else {
        bytes = await this.loadFrameBytes(
          frameNumber,
          context,
          controller.signal,
        );
      }

      const responseTime = this.now();
      if (
        this.isStale(requestId) ||
        (window !== null && this.activeWindow !== window)
      ) {
        return { status: "stale" };
      }

      if (
        this.mode === "p2" &&
        source === "network" &&
        joinedPrefetch === null &&
        cache !== null &&
        window !== null &&
        key !== null
      ) {
        const admission = this.admitNetwork(
          cache,
          window,
          key,
          bytes,
          requestId,
          ramEpoch,
        );
        if (admission === "stale") {
          return { status: "stale" };
        }
      }

      if (
        this.mode === "p3" &&
        source === "network" &&
        cache !== null &&
        window !== null &&
        key !== null
      ) {
        const admitted = await this.admitP3Ram(
          cache,
          key,
          bytes,
          requestId,
        );
        if (this.isStale(requestId)) {
          return { status: "stale" };
        }
        if (admitted) {
          // RAM admission is separate from the lookup result; nativeCache stays
          // "miss" because the demand was served by the network.
        }
      }

      if (this.isStale(requestId)) {
        return { status: "stale" };
      }

      const wrapped = this.wrapperBuilder(this.locator, context, bytes);
      if (this.isStale(requestId)) {
        return { status: "stale" };
      }

      const imageId = await this.options.presenter.present(requestId, wrapped);
      if (imageId === null || this.isStale(requestId)) {
        return { status: "stale" };
      }

      this.acceptedSelections += 1;
      this.lastSource = opfsSource ?? source;
      this.displayedFrame = frameNumber;
      this.pendingFrame = null;
      this.errorFrame = null;
      if (joinedPrefetch !== null && !joinedPrefetch.joinedUseful) {
        joinedPrefetch.joinedUseful = true;
        this.prefetchCounters.usefulJoins += 1;
        this.prefetchCounters.usefulNativeBytes += bytes.byteLength;
      }
      if (this.mode === "p3") {
        this.p3LastSource = opfsSource ?? source;
        this.p3LastCache = opfsCache;
        this.p3LastPromoted = promotedToRam;
        this.p3LastKey = key;
        await this.maintainP3Window();
        if (
          source === "network" &&
          opfsSource === null &&
          key !== null &&
          p3ClearEpoch === this.p3ClearEpoch
        ) {
          void this.scheduleP3Publication(key, bytes);
        }
      } else {
        this.schedulePrefetch(frameNumber, previousFrame, context, window);
      }
      this.publishResidency();
      return {
        status: "presented",
        requestId,
        frameNumber,
        imageId,
        source,
        opfsSource,
        nativeCache,
        opfsCache,
        promotedToRam,
        selectionToFrameResponseMs: responseTime - start,
        selectionToFrameCommittedMs: this.now() - start,
      };
    } catch (error) {
      if (this.isStale(requestId) || isAbortError(error)) {
        return { status: "stale" };
      }
      this.errors += 1;
      this.errorFrame = this.pendingFrame ?? frameNumber;
      this.pendingFrame = null;
      this.publishResidency();
      throw error;
    } finally {
      if (this.frameAbort === controller) {
        this.frameAbort = null;
      }
    }
  }

  private async readP3Opfs(
    key: NativeFrameCacheKey,
    frameNumber: number,
    context: NativeFrameContext,
    requestId: number,
  ): Promise<{
    bytes?: Uint8Array;
    opfsCache: NativeFrameOpfsCache;
    promotedToRam: boolean;
  }> {
    const adapter = this.p3Adapter;
    if (this.p3Status !== "enabled" || !adapter) {
      return { opfsCache: "not-applicable", promotedToRam: false };
    }
    const digest = this.p3Digest(this.locator, frameNumber);
    if (!digest) {
      this.recordP3Error("digest-missing", frameNumber);
      return { opfsCache: "invalid", promotedToRam: false };
    }
    this.p3ReadingFrame = frameNumber;
    this.publishResidency();
    try {
      const result = await adapter.get(key, {
        frameSizeBytes: context.frameSizeBytes,
        expectedDigest: digest,
      });
      await this.reconcileP3Events();
      if (result.status === "hit" && result.bytes) {
        this.p3ErrorFrames.delete(frameNumber);
        const promoted = await this.admitP3Ram(
          this.cache!,
          key,
          result.bytes,
          requestId,
        );
        return {
          bytes: result.bytes,
          opfsCache: "hit",
          promotedToRam: promoted,
        };
      }
      if (result.status === "miss") {
        return { opfsCache: "miss", promotedToRam: false };
      }
      this.recordP3Error(result.reason ?? result.status, frameNumber);
      return { opfsCache: "invalid", promotedToRam: false };
    } catch {
      this.recordP3Error("read-error", frameNumber);
      return { opfsCache: "invalid", promotedToRam: false };
    } finally {
      if (this.p3ReadingFrame === frameNumber) {
        this.p3ReadingFrame = null;
        this.publishResidency();
      }
    }
  }

  private async admitP3Ram(
    cache: NativeRamCache,
    key: NativeFrameCacheKey,
    bytes: Uint8Array,
    requestId: number,
  ): Promise<boolean> {
    if (this.mode !== "p3" || this.p3Status === "cleanup-required") {
      return false;
    }
    const incoming: NativeFrameDualWindowIncoming = {
      key,
      tier: "ram",
      nativeBytes: bytes.byteLength,
      fileBytes: bytes.byteLength,
      temporaryFileBytes: 0,
    };
    const plan = planNativeFrameDualWindowPolicy(
      this.buildP3PolicyInput(key, [incoming]),
    );
    if (plan.status !== "ok") {
      this.recordP3Error(plan.reason, key.frameNumber);
      return false;
    }
    for (const eviction of plan.ramEvictions) {
      cache.invalidate(eviction.key);
      for (const [entryId, residentKey] of this.residentKeys) {
        if (sameKey(residentKey, eviction.key)) {
          this.residentKeys.delete(entryId);
        }
      }
    }
    if (!plan.ramAdmissions.some((admission) => sameKey(admission.key, key))) {
      return false;
    }
    const put = cache.put(key, bytes, requestId);
    if (put.status === "inserted" || put.status === "replaced") {
      this.residentKeys.set(put.entry.entryId, key);
      if (this.isP3Current()) {
        this.p3Counters.promotions += 1;
      }
      return true;
    }
    return false;
  }

  private buildP3PolicyInput(
    selectedKey: NativeFrameCacheKey,
    incoming: readonly NativeFrameDualWindowIncoming[] = [],
  ): NativeFrameDualWindowPolicyInput {
    const context = this.context;
    if (!context) {
      throw invalidRequest("Native-frame metadata has not been loaded");
    }
    const descriptors: NativeFrameDualWindowDescriptor[] = [];
    const cacheSnapshot = this.cache?.snapshot();
    for (const entry of cacheSnapshot?.entries ?? []) {
      const key = this.residentKeys.get(entry.entryId);
      if (!key) {
        continue;
      }
      descriptors.push({
        key,
        tier: "ram",
        entryRef: entry.entryId,
        nativeBytes: entry.nativeBytes,
        fileBytes: entry.nativeBytes,
        lastAccessOrdinal: entry.lastAccessOrdinal,
      });
    }
    for (const entry of this.p3Map.values()) {
      if (this.p3PendingDeletes.has(keyId(entry.key))) {
        continue;
      }
      if (this.p3IneligibleFrames.has(entry.key.frameNumber)) {
        continue;
      }
      descriptors.push({
        key: entry.key,
        tier: "opfs",
        entryRef: entry.alias,
        nativeBytes: entry.nativeBytes,
        fileBytes: entry.fileBytes,
        lastAccessOrdinal: entry.lastAccessOrdinal,
      });
    }
    const pendingWrites: NativeFrameDualWindowPendingWrite[] = [];
    if (this.p3PendingWrite) {
      pendingWrites.push({
        key: this.p3PendingWrite.key,
        tier: "opfs",
        nativeBytes: this.p3PendingWrite.nativeBytes,
        fileBytes: this.p3PendingWrite.fileBytes,
        temporaryFileBytes: 0,
        state: "writing",
      });
    }
    const pendingDeletes: NativeFrameDualWindowPendingDelete[] = [];
    for (const deletion of this.p3PendingDeletes.values()) {
      pendingDeletes.push({
        key: deletion.key,
        tier: "opfs",
        entryRef: deletion.alias,
        nativeBytes: deletion.nativeBytes,
        fileBytes: deletion.fileBytes,
        state: "deleting",
      });
    }
    const adapterSnapshot = this.p3Adapter?.snapshot();
    const ownCommittedFileBytes = [...this.p3Map.values()].reduce(
      (total, entry) => total + entry.fileBytes,
      0,
    );
    const externalFileBytes = Math.max(
      0,
      (adapterSnapshot?.rootFileBytes ?? 0) -
        ownCommittedFileBytes -
        (adapterSnapshot?.tempFileBytes ?? 0) -
        (adapterSnapshot?.failedDeleteBytes ?? 0),
    );
    return {
      selectedKey,
      numberOfFrames: context.numberOfFrames,
      ramEpoch: Math.max(1, this.modeEpoch),
      opfsEpoch: ++this.p3OpfsEpoch,
      ramRevision: cacheSnapshot?.revision ?? 0,
      opfsRevision: this.p3MapRevision,
      opfsExternalFileBytes: externalFileBytes,
      descriptors,
      pendingWrites,
      pendingDeletes,
      incoming,
      config: this.p3Option?.config ?? DEFAULT_NATIVE_FRAME_DUAL_WINDOW_CONFIG,
      limits: this.p3Option?.limits ?? DEFAULT_NATIVE_FRAME_DUAL_WINDOW_LIMITS,
    };
  }

  private async maintainP3Window(): Promise<void> {
    const adapter = this.p3Adapter;
    const selectedKey = this.p3LastKey;
    if (!adapter || !selectedKey) {
      return;
    }
    if (this.p3Status !== "enabled" && this.p3Status !== "cleanup-required") {
      return;
    }
    const plan = planNativeFrameDualWindowPolicy(
      this.buildP3PolicyInput(selectedKey),
    );
    if (plan.status !== "ok") {
      this.recordP3Error(plan.reason, selectedKey.frameNumber);
      return;
    }
    for (const deletion of plan.opfsPlannedDeletions) {
      const fingerprint = keyId(deletion.key);
      const entry = this.p3Map.get(fingerprint);
      if (!entry) {
        continue;
      }
      this.p3PendingDeletes.set(fingerprint, {
        key: deletion.key,
        alias: entry.alias,
        nativeBytes: entry.nativeBytes,
        fileBytes: entry.fileBytes,
      });
      const result = await adapter.invalidate(deletion.key);
      await this.reconcileP3Events();
      if (result.status === "deleted") {
        this.p3Map.delete(fingerprint);
        this.p3AliasKeys.delete(entry.alias);
        this.p3ErrorFrames.delete(deletion.key.frameNumber);
        this.p3IneligibleFrames.delete(deletion.key.frameNumber);
        if (this.isP3Current()) {
          this.p3Counters.deletes += 1;
        }
      } else {
        this.p3IneligibleFrames.add(deletion.key.frameNumber);
        this.recordP3Error(result.reason ?? "delete-failed", deletion.key.frameNumber);
      }
      this.p3PendingDeletes.delete(fingerprint);
    }
    this.p3MapRevision += 1;
    this.publishResidency();
  }

  private scheduleP3Publication(
    key: NativeFrameCacheKey,
    bytes: Uint8Array,
  ): void {
    const adapter = this.p3Adapter;
    if (!adapter || this.p3Status !== "enabled" || this.p3Clearing) {
      return;
    }
    const existing = this.p3PendingPublication;
    if (existing?.phase === "writing") {
      this.recordP3Error("publication-busy", key.frameNumber);
      return;
    }
    if (existing) {
      existing.superseded = true;
    }
    this.p3PendingPublication = {
      token: ++this.prefetchToken,
      key,
      bytes: bytes.slice(),
      phase: "planned",
      superseded: false,
    };
    if (!this.p3PublicationPromise) {
      this.p3PublicationPromise = this.runP3Publications().finally(() => {
        this.p3PublicationPromise = null;
        if (this.p3PendingPublication) {
          this.p3PublicationPromise = this.runP3Publications().finally(() => {
            this.p3PublicationPromise = null;
          });
        }
      });
    }
  }

  private async runP3Publications(): Promise<void> {
    while (this.p3PendingPublication) {
      const item = this.p3PendingPublication;
      await this.publishP3(item);
      if (this.p3PendingPublication === item) {
        this.p3PendingPublication = null;
      }
    }
  }

  private async publishP3(item: P3PendingPublication): Promise<void> {
    const adapter = this.p3Adapter;
    if (!adapter || item.superseded || this.p3Status !== "enabled") {
      return;
    }
    const clearEpoch = this.p3ClearEpoch;
    const digest = this.p3Digest(this.locator, item.key.frameNumber);
    if (!digest) {
      this.recordP3Error("digest-missing", item.key.frameNumber);
      return;
    }
    const incoming: NativeFrameDualWindowIncoming = {
      key: item.key,
      tier: "opfs",
      nativeBytes: item.bytes.byteLength,
      fileBytes: item.bytes.byteLength + 80,
      temporaryFileBytes: 0,
    };
    let plan = planNativeFrameDualWindowPolicy(
      this.buildP3PolicyInput(item.key, [incoming]),
    );
    if (plan.status !== "ok") {
      this.recordP3Error(plan.reason, item.key.frameNumber);
      return;
    }
    if (plan.opfsPlannedDeletions.length > 0) {
      item.phase = "deleting";
      for (const deletion of plan.opfsPlannedDeletions) {
        const fingerprint = keyId(deletion.key);
        const entry = this.p3Map.get(fingerprint);
        if (!entry) {
          continue;
        }
        this.p3PendingDeletes.set(fingerprint, {
          key: deletion.key,
          alias: entry.alias,
          nativeBytes: entry.nativeBytes,
          fileBytes: entry.fileBytes,
        });
        const result = await adapter.invalidate(deletion.key);
        await this.reconcileP3Events();
        if (result.status !== "deleted") {
          this.p3PendingDeletes.delete(fingerprint);
          this.p3IneligibleFrames.add(deletion.key.frameNumber);
          this.recordP3Error(
            result.reason ?? "delete-failed",
            deletion.key.frameNumber,
          );
          return;
        }
        this.p3Map.delete(fingerprint);
        this.p3AliasKeys.delete(entry.alias);
        this.p3ErrorFrames.delete(deletion.key.frameNumber);
        this.p3IneligibleFrames.delete(deletion.key.frameNumber);
        if (this.isP3Current()) {
          this.p3Counters.deletes += 1;
        }
        this.p3PendingDeletes.delete(fingerprint);
      }
      if (item.superseded) {
        return;
      }
      plan = planNativeFrameDualWindowPolicy(
        this.buildP3PolicyInput(item.key, [incoming]),
      );
      if (plan.status !== "ok") {
        this.recordP3Error(plan.reason, item.key.frameNumber);
        return;
      }
    }
    if (
      !plan.opfsPublications.some((publication) =>
        sameKey(publication.key, item.key),
      )
    ) {
      const reason =
        plan.incomingRejected[0]?.reason ??
        (plan.rootCapBlocked ? "root-cap" : "capacity");
      this.recordP3Error(reason, item.key.frameNumber);
      return;
    }
    if (item.superseded) {
      return;
    }
    item.phase = "writing";
    this.p3PendingWrite = {
      key: item.key,
      nativeBytes: item.bytes.byteLength,
      fileBytes: item.bytes.byteLength + 80,
    };
    const result = await adapter
      .put(item.key, item.bytes, {
        frameSizeBytes: item.bytes.byteLength,
        expectedDigest: digest,
      })
      .catch(() => ({
        status: "failed" as const,
        reason: "write-failed" as const,
      }));
    this.p3PendingWrite = null;
    await this.reconcileP3Events();
    if (this.p3ClearEpoch !== clearEpoch) {
      return;
    }
    const current = this.isP3Current();
    if (
      result.status === "stored" ||
      result.status === "replaced"
    ) {
      const stillOwned = this.p3Adapter === adapter;
      if (!stillOwned) {
        return;
      }
      const alias = result.entryAlias ?? "";
      if (alias) {
        this.p3AliasKeys.set(alias, item.key);
        this.p3Map.set(keyId(item.key), {
          key: item.key,
          alias,
          nativeBytes: result.nativeBytes ?? item.bytes.byteLength,
          fileBytes: result.fileBytes ?? item.bytes.byteLength + 80,
          lastAccessOrdinal: ++this.p3AccessOrdinal,
        });
        this.p3ErrorFrames.delete(item.key.frameNumber);
        this.p3IneligibleFrames.delete(item.key.frameNumber);
        this.p3MapRevision += 1;
        if (current) {
          this.p3Counters.writes += 1;
        }
        if (this.p3Adapter) {
          await this.maintainP3Window();
        }
      } else if (current) {
        await this.maintainP3Window();
      }
    } else if (current) {
      this.recordP3Error(result.reason ?? result.status, item.key.frameNumber);
    }
  }

  private async reconcileP3Events(): Promise<void> {
    const adapter = this.p3Adapter;
    if (!adapter) {
      return;
    }
    const batch: NativeFramePlaintextOpfsEventBatch = adapter.eventsSince(
      this.p3EventCursor,
    );
    this.p3EventCursor = batch.latestSequence;
    let changed = false;
    if (batch.resynchronize) {
      const snapshot: NativeFramePlaintextOpfsSnapshot = adapter.snapshot();
      const aliases = new Set(
        snapshot.entries
          .filter((entry) => entry.state === "committed")
          .map((entry) => entry.alias),
      );
      for (const [fingerprint, entry] of this.p3Map) {
        if (!aliases.has(entry.alias)) {
          this.p3Map.delete(fingerprint);
          this.p3AliasKeys.delete(entry.alias);
          changed = true;
        }
      }
      for (const entry of snapshot.entries) {
        if (entry.state !== "committed") {
          continue;
        }
        const key = this.p3AliasKeys.get(entry.alias);
        if (!key) {
          continue;
        }
        this.p3Map.set(keyId(key), {
          key,
          alias: entry.alias,
          nativeBytes: entry.nativeBytes,
          fileBytes: entry.fileBytes,
          lastAccessOrdinal: ++this.p3AccessOrdinal,
        });
        changed = true;
      }
    } else {
      for (const event of batch.events) {
        if (!event.entryAlias) {
          continue;
        }
        const key = this.p3AliasKeys.get(event.entryAlias);
        if (!key) {
          continue;
        }
        if (event.type === "committed") {
          this.p3Map.set(keyId(key), {
            key,
            alias: event.entryAlias,
            nativeBytes: event.nativeBytes,
            fileBytes: event.fileBytes,
            lastAccessOrdinal: ++this.p3AccessOrdinal,
          });
          changed = true;
        } else if (event.type === "deleted" || event.type === "invalidated") {
          this.p3Map.delete(keyId(key));
          this.p3AliasKeys.delete(event.entryAlias);
          changed = true;
        }
      }
    }
    if (changed) {
      this.p3MapRevision += 1;
      this.publishResidency();
    }
  }

  private recordP3Error(reason: string | undefined, frameNumber?: number): void {
    const key = reason ?? "unknown";
    if (this.mode !== "p3" || this.p3Status === "cleanup-required") {
      return;
    }
    this.p3Counters.errors[key] = (this.p3Counters.errors[key] ?? 0) + 1;
    this.p3StorageError = key;
    if (frameNumber !== undefined) {
      this.p3ErrorFrames.add(frameNumber);
    }
    this.publishResidency();
  }

  private isP3Current(): boolean {
    return this.mode === "p3" && this.p3Status === "enabled";
  }

  private p3Metrics(): NativeFrameP3Metrics | null {
    if (this.mode !== "p3" && this.p3Status === "disabled") {
      return null;
    }
    const entries = [...this.p3Map.values()];
    const snapshot = this.p3Adapter?.snapshot();
    const frames = entries
      .map((entry) => entry.key.frameNumber)
      .sort((left, right) => left - right);
    const pendingWriteFrames = new Set<number>();
    if (this.p3PendingWrite) {
      pendingWriteFrames.add(this.p3PendingWrite.key.frameNumber);
    }
    if (this.p3PendingPublication && !this.p3PendingPublication.superseded) {
      pendingWriteFrames.add(this.p3PendingPublication.key.frameNumber);
    }
    const pendingDeleteFrames = [...this.p3PendingDeletes.values()]
      .map((entry) => entry.key.frameNumber)
      .sort((left, right) => left - right);
    const windows = this.p3WindowBounds();
    return {
      status: this.p3Status,
      source: this.p3LastSource,
      cache: this.p3LastCache,
      promotedToRam: this.p3LastPromoted,
      entries: entries.length,
      committedNativeBytes: entries.reduce(
        (total, entry) => total + entry.nativeBytes,
        0,
      ),
      committedFileBytes: entries.reduce(
        (total, entry) => total + entry.fileBytes,
        0,
      ),
      pendingWrites: pendingWriteFrames.size,
      pendingDeletes: this.p3PendingDeletes.size,
      rootFileBytes: snapshot?.rootFileBytes ?? 0,
      deletedBytes: snapshot?.failedDeleteBytes ?? 0,
      errors: Object.freeze({ ...this.p3Counters.errors }),
      storageError: this.p3StorageError,
      frames: Object.freeze(frames),
      pendingWriteFrames: Object.freeze(
        [...pendingWriteFrames].sort((left, right) => left - right),
      ),
      pendingDeleteFrames: Object.freeze(pendingDeleteFrames),
      errorFrames: Object.freeze(
        [...this.p3ErrorFrames].sort((left, right) => left - right),
      ),
      ineligibleFrames: Object.freeze(
        [...this.p3IneligibleFrames].sort((left, right) => left - right),
      ),
      readingFrame: this.p3ReadingFrame,
      networkPendingFrame: this.p3NetworkPendingFrame,
      ramWindow: windows.ram,
      opfsWindow: windows.opfs,
    };
  }

  private p3WindowBounds(): {
    ram: NativeFrameP3WindowBounds | null;
    opfs: NativeFrameP3WindowBounds | null;
  } {
    const context = this.context;
    const key = this.p3LastKey;
    if (!context || !key) {
      return { ram: null, opfs: null };
    }
    const config =
      this.p3Option?.config ?? DEFAULT_NATIVE_FRAME_DUAL_WINDOW_CONFIG;
    try {
      const ram = createNativeRamWindow({
        selectedKey: key,
        numberOfFrames: context.numberOfFrames,
        epoch: 1,
        config: config.ram,
      });
      const opfs = createNativeRamWindow({
        selectedKey: key,
        numberOfFrames: context.numberOfFrames,
        epoch: 1,
        config: config.opfs,
      });
      return {
        ram: Object.freeze({
          startFrame: ram.startFrame,
          endFrame: ram.endFrame,
        }),
        opfs: Object.freeze({
          startFrame: opfs.startFrame,
          endFrame: opfs.endFrame,
        }),
      };
    } catch {
      return { ram: null, opfs: null };
    }
  }

  clearRam(): NativeRamCacheClearResult | null {
    if (!this.cache) {
      return null;
    }
    this.dropQueuedPrefetch();
    if (this.prefetchInFlight) {
      this.cancelPrefetchJob(this.prefetchInFlight);
    }
    this.removeAllSpeculativeUnused();
    const result = this.cache.clearOwned();
    this.residentKeys.clear();
    this.ramEpoch += 1;
    this.publishResidency();
    return result;
  }

  async clearP3(): Promise<NativeFrameP3ClearResult> {
    const unavailable = (reason: string): NativeFrameP3ClearResult => ({
      status: "unavailable",
      reason,
      clearedEntries: 0,
      clearedNativeBytes: 0,
      failedEntries: 0,
      failedFileBytes: 0,
    });
    if (this.mode !== "p3") {
      return unavailable("not-p3");
    }
    const adapter = this.p3Adapter;
    if (!adapter || this.p3Status !== "enabled") {
      return unavailable(this.p3Status);
    }
    this.p3Clearing = true;
    this.p3ClearEpoch += 1;
    this.p3PendingPublication = null;
    try {
      if (this.p3PublicationPromise) {
        try {
          await this.p3PublicationPromise;
        } catch {
          // Publication errors are recorded by publishP3.
        }
      }
      if (this.p3Adapter !== adapter || this.p3Status !== "enabled") {
        return unavailable("storage-changed");
      }
      const result = await adapter.clearOwned();
      this.reconcileP3Snapshot();
      if (result.status === "cleared") {
        this.p3Map.clear();
        this.p3AliasKeys.clear();
        this.p3PendingPublication = null;
        this.p3PendingWrite = null;
        this.p3PendingDeletes.clear();
        this.p3ErrorFrames.clear();
        this.p3IneligibleFrames.clear();
        this.p3StorageError = null;
        this.p3MapRevision += 1;
        this.publishResidency();
        return {
          status: "cleared",
          clearedEntries: result.clearedEntries,
          clearedNativeBytes: result.clearedNativeBytes,
          failedEntries: 0,
          failedFileBytes: 0,
        };
      }
      const reason = result.reason ?? result.status;
      this.recordP3Error(reason);
      return {
        status: "failed",
        reason,
        clearedEntries: result.clearedEntries,
        clearedNativeBytes: result.clearedNativeBytes,
        failedEntries: result.failedEntries,
        failedFileBytes: result.failedFileBytes,
      };
    } catch {
      this.reconcileP3Snapshot();
      this.recordP3Error("clear-error");
      return {
        status: "failed",
        reason: "clear-error",
        clearedEntries: 0,
        clearedNativeBytes: 0,
        failedEntries: 0,
        failedFileBytes: 0,
      };
    } finally {
      this.p3Clearing = false;
      this.publishResidency();
    }
  }

  async clearBoth(): Promise<NativeFrameP3ClearBothResult> {
    if (this.mode !== "p3") {
      return {
        status: "failed",
        ramCleared: false,
        opfs: null,
        reason: "not-p3",
      };
    }
    const ramCleared = this.clearRam() !== null;
    const opfs = await this.clearP3();
    const status =
      opfs.status === "cleared" && ramCleared
        ? "cleared"
        : ramCleared || opfs.status === "cleared"
          ? "partial"
          : "failed";
    return {
      status,
      ramCleared,
      opfs,
      ...(opfs.status === "cleared"
        ? {}
        : { reason: opfs.reason ?? opfs.status }),
    };
  }

  private reconcileP3Snapshot(): void {
    const adapter = this.p3Adapter;
    if (!adapter) {
      return;
    }
    const snapshot = adapter.snapshot();
    const aliases = new Set(
      snapshot.entries
        .filter((entry) => entry.state === "committed")
        .map((entry) => entry.alias),
    );
    for (const [fingerprint, entry] of this.p3Map) {
      if (!aliases.has(entry.alias)) {
        this.p3Map.delete(fingerprint);
        this.p3AliasKeys.delete(entry.alias);
      }
    }
    this.p3MapRevision += 1;
    this.publishResidency();
  }

  residencyEventsSince(
    afterSequence: number,
  ): NativeFrameResidencyEventBatch {
    if (!this.cache) {
      return Object.freeze({
        cacheId: null,
        events: Object.freeze([]),
        afterSequence,
        oldestRetainedSequence: null,
        latestSequence: 0,
        droppedForCursor: 0,
        droppedEventCount: 0,
        resynchronize: true,
      });
    }
    const snapshot = this.cache.snapshot();
    const batch = this.cache.eventsSince(afterSequence);
    const stateTypes = new Set([
      "insert",
      "replace",
      "evict",
      "invalidate",
      "clear",
    ]);
    const events = Object.freeze(
      batch.events
        .filter((event) => stateTypes.has(event.type))
        .map((event) =>
          Object.freeze({
            sequence: event.sequence,
            revision: event.revision,
            type: event.type as NativeFrameResidencyEventType,
            frameNumber: event.frameNumber,
            nativeBytes: event.nativeBytes,
            ...(event.previousNativeBytes === undefined
              ? {}
              : { previousNativeBytes: event.previousNativeBytes }),
            ...(event.reason === undefined ? {} : { reason: event.reason }),
          }),
        ),
    );
    return Object.freeze({
      cacheId: snapshot.cacheId,
      events,
      afterSequence: batch.afterSequence,
      oldestRetainedSequence: batch.oldestRetainedSequence,
      latestSequence: batch.latestSequence,
      droppedForCursor: batch.droppedForCursor,
      droppedEventCount: batch.droppedEventCount,
      resynchronize: batch.resynchronize || snapshot.closed,
    });
  }

  subscribeResidency(listener: NativeFrameResidencyListener): () => void {
    this.assertOpen();
    let cursor = 0;
    const notify = () => {
      const batch = this.residencyEventsSince(cursor);
      cursor = batch.latestSequence;
      listener({ snapshot: this.metrics(), batch });
    };
    this.residencyListeners.add(notify);
    notify();
    return () => {
      this.residencyListeners.delete(notify);
    };
  }

  metrics(): NativeFrameSessionMetrics {
    const cacheSnapshot = this.cache?.snapshot() ?? null;
    return Object.freeze({
      mode: this.mode,
      modeEpoch: this.modeEpoch,
      acceptedSelections: this.acceptedSelections,
      frameBodyRequests: this.frameBodyRequests,
      demandFrameBodyRequests: this.demandFrameBodyRequests,
      prefetchFrameBodyRequests: this.prefetchFrameBodyRequests,
      metadataRequests: this.metadataRequests,
      pendingFrameRequests: this.pendingFrameRequests,
      errors: this.errors,
      lastSource: this.lastSource,
      requestedFrame: this.requestedFrame,
      displayedFrame: this.displayedFrame,
      pendingFrame: this.pendingFrame,
      errorFrame: this.errorFrame,
      window: this.activeWindow
        ? Object.freeze({
            startFrame: this.activeWindow.startFrame,
            endFrame: this.activeWindow.endFrame,
            behind: this.activeWindow.behind,
            ahead: this.activeWindow.ahead,
            epoch: this.activeWindow.epoch,
          })
        : null,
      cache: cacheSnapshot ? this.cacheMetrics(cacheSnapshot) : null,
      prefetch: this.prefetchMetrics(),
      opfs: this.p3Metrics(),
    });
  }

  close(): void {
    if (this.closed) {
      return;
    }
    if (this.mode === "p3" || this.p3Adapter) {
      this.generation += 1;
      this.frameAbort?.abort();
      this.frameAbort = null;
      void this.closeP3();
      return;
    }
    this.closed = true;
    this.generation += 1;
    this.frameLifecycleEpoch += 1;
    this.pendingFrameRequests = 0;
    this.metadataAbort?.abort();
    this.metadataAbort = null;
    this.frameAbort?.abort();
    this.frameAbort = null;
    this.resetPrefetchState(true);
    this.disposeP2State();
    this.context = null;
    this.requestedFrame = null;
    this.displayedFrame = null;
    this.pendingFrame = null;
    this.errorFrame = null;
    this.residencyListeners.clear();
    this.options.presenter.close();
  }

  private publishResidency(): void {
    for (const listener of Array.from(this.residencyListeners)) {
      try {
        listener();
      } catch (error) {
        console.debug(error);
      }
    }
  }

  private schedulePrefetch(
    currentFrame: number,
    previousFrame: number | null,
    context: NativeFrameContext,
    window: NativeRamWindow | null,
  ): void {
    if (
      !this.prefetchEnabled ||
      this.mode !== "p2" ||
      !this.cache ||
      !window ||
      this.prefetchRetiring
    ) {
      return;
    }
    const target = calculateNativeFramePrefetchTarget(
      currentFrame,
      previousFrame,
      context.numberOfFrames,
      window.startFrame,
      window.endFrame,
    );
    if (!target) {
      return;
    }
    const key = this.cacheKey(target.targetFrame, context);
    if (this.cache.contains(key)) {
      return;
    }
    const expectedBytes = context.frameSizeBytes;
    const maxInFlightBytes =
      this.prefetchMaxInFlightBytesOption ?? expectedBytes;
    if (expectedBytes > maxInFlightBytes) {
      this.prefetchCounters.budgetSkipped += 1;
      this.publishResidency();
      return;
    }
    if (expectedBytes > this.cacheLimits.maxEntryNativeBytes) {
      this.prefetchCounters.oversizeSkipped += 1;
      this.publishResidency();
      return;
    }
    if (
      (this.prefetchInFlight &&
        sameKey(this.prefetchInFlight.key, key)) ||
      (this.prefetchQueue && sameKey(this.prefetchQueue.key, key))
    ) {
      return;
    }
    this.dropQueuedPrefetch();
    const queued: PrefetchTarget = Object.freeze({
      key,
      frameNumber: target.targetFrame,
      expectedBytes,
      windowEpoch: window.epoch,
      modeEpoch: this.modeEpoch,
      prefetchEpoch: this.prefetchEpoch,
      ramEpoch: this.ramEpoch,
      lifecycleEpoch: this.frameLifecycleEpoch,
    });
    if (this.prefetchInFlight) {
      this.prefetchQueue = queued;
      this.publishResidency();
      return;
    }
    this.startPrefetch(queued);
  }

  private startPrefetch(target: PrefetchTarget): void {
    if (
      !this.prefetchEnabled ||
      this.mode !== "p2" ||
      !this.cache ||
      this.prefetchInFlight ||
      this.prefetchRetiring
    ) {
      return;
    }
    const job: PrefetchJob = {
      ...target,
      token: ++this.prefetchToken,
      controller: new AbortController(),
      promise: Promise.resolve(new Uint8Array()),
      joinedDemand: null,
      joinedUseful: false,
      cancelled: false,
      released: false,
    };
    this.prefetchInFlight = job;
    this.prefetchFrameBodyRequests += 1;
    this.frameBodyRequests += 1;
    this.pendingFrameRequests += 1;
    job.promise = this.runPrefetch(job);
    void job.promise.catch(() => undefined);
    this.publishResidency();
  }

  private async runPrefetch(job: PrefetchJob): Promise<Uint8Array> {
    try {
      const payload = await this.frameLoader(
        {
          locator: this.locator,
          context: this.context as NativeFrameContext,
          frameNumber: job.frameNumber,
          signal: job.controller.signal,
        },
        {
          baseUrl: this.options.baseUrl,
          token: this.options.token,
          fetchImpl: this.options.fetchImpl,
        },
      );
      const bytes = payload.bytes;
      if (job.cancelled || job.released) {
        this.prefetchCounters.cancelledNativeBytes += bytes.byteLength;
        return bytes;
      }
      if (job.joinedDemand) {
        const joined = job.joinedDemand;
        const cache = this.cache;
        if (
          !cache ||
          this.mode !== "p2" ||
          this.isStale(joined.requestId) ||
          this.activeWindow !== joined.window
        ) {
          this.prefetchCounters.cancelledRequests += 1;
          this.prefetchCounters.cancelledNativeBytes += bytes.byteLength;
          return bytes;
        }
        const admission = this.admitNetwork(
          cache,
          joined.window,
          job.key,
          bytes,
          joined.requestId,
          joined.ramEpoch,
        );
        if (admission === "stale") {
          this.prefetchCounters.cancelledRequests += 1;
          this.prefetchCounters.cancelledNativeBytes += bytes.byteLength;
        }
        return bytes;
      }

      const cache = this.cache;
      const window = this.activeWindow;
      if (
        !cache ||
        !window ||
        !this.prefetchEnabled ||
        this.mode !== "p2" ||
        job.prefetchEpoch !== this.prefetchEpoch ||
        job.modeEpoch !== this.modeEpoch ||
        job.ramEpoch !== this.ramEpoch ||
        job.lifecycleEpoch !== this.frameLifecycleEpoch ||
        window.epoch !== job.windowEpoch ||
        job.frameNumber < window.startFrame ||
        job.frameNumber > window.endFrame
      ) {
        this.prefetchCounters.cancelledRequests += 1;
        this.prefetchCounters.cancelledNativeBytes += bytes.byteLength;
        return bytes;
      }
      this.admitPrefetch(job, bytes, window, cache);
      return bytes;
    } catch (error) {
      if (job.cancelled || job.released) {
        return new Uint8Array();
      }
      throw error;
    } finally {
      this.releasePrefetchJob(job);
      if (!job.cancelled && !job.joinedDemand) {
        this.startQueuedPrefetch();
      }
    }
  }

  private admitPrefetch(
    job: PrefetchJob,
    bytes: Uint8Array,
    window: NativeRamWindow,
    cache: NativeRamCache,
  ): void {
    const snapshot = cache.snapshot();
    const plan = planNativeRamWindowAdmission({
      window,
      residents: this.residentDescriptors(snapshot),
      completion: {
        key: job.key,
        nativeBytes: bytes.byteLength,
        epoch: window.epoch,
      },
      limits: this.cacheLimits,
    });
    if (
      job.cancelled ||
      !this.prefetchEnabled ||
      this.mode !== "p2" ||
      job.prefetchEpoch !== this.prefetchEpoch ||
      job.ramEpoch !== this.ramEpoch ||
      this.activeWindow !== window ||
      cache.snapshot().revision !== snapshot.revision
    ) {
      this.prefetchCounters.cancelledRequests += 1;
      this.prefetchCounters.cancelledNativeBytes += bytes.byteLength;
      return;
    }
    if (
      plan.admission.status === "rejected" ||
      plan.admission.status === "not-cacheable" ||
      !plan.incomingRetained
    ) {
      this.prefetchCounters.cancelledRequests += 1;
      this.prefetchCounters.cancelledNativeBytes += bytes.byteLength;
      if (plan.admission.status === "not-cacheable") {
        this.prefetchCounters.oversizeSkipped += 1;
      }
      return;
    }
    this.applyEvictions(cache, plan.evictions);
    const result = cache.put(job.key, bytes, this.generation);
    if (result.status === "rejected") {
      this.prefetchCounters.cancelledRequests += 1;
      this.prefetchCounters.cancelledNativeBytes += bytes.byteLength;
      return;
    }
    if (result.status === "bypassed") {
      this.prefetchCounters.cancelledRequests += 1;
      this.prefetchCounters.cancelledNativeBytes += bytes.byteLength;
      return;
    }
    this.residentKeys.set(result.entry.entryId, job.key);
    this.speculativeEntries.set(result.entry.entryId, {
      frameNumber: result.entry.frameNumber,
      nativeBytes: result.entry.nativeBytes,
    });
    for (const entry of result.evicted) {
      this.residentKeys.delete(entry.entryId);
      this.removeSpeculative(entry.entryId, true);
    }
    this.publishResidency();
  }

  private startQueuedPrefetch(): void {
    if (
      !this.prefetchEnabled ||
      this.mode !== "p2" ||
      this.prefetchInFlight ||
      this.prefetchRetiring ||
      !this.prefetchQueue
    ) {
      return;
    }
    const queued = this.prefetchQueue;
    const window = this.activeWindow;
    if (
      !window ||
      window.epoch !== queued.windowEpoch ||
      queued.prefetchEpoch !== this.prefetchEpoch ||
      queued.ramEpoch !== this.ramEpoch ||
      queued.frameNumber < window.startFrame ||
      queued.frameNumber > window.endFrame
    ) {
      this.dropQueuedPrefetch();
      return;
    }
    this.prefetchQueue = null;
    this.startPrefetch(queued);
  }

  private dropQueuedPrefetch(): void {
    if (!this.prefetchQueue) {
      return;
    }
    this.prefetchCounters.cancelledRequests += 1;
    this.prefetchCounters.cancelledExpectedBytes +=
      this.prefetchQueue.expectedBytes;
    this.prefetchQueue = null;
  }

  private cancelPrefetchJob(job: PrefetchJob): void {
    if (job.released || job.cancelled) {
      return;
    }
    job.cancelled = true;
    job.controller.abort();
    this.prefetchCounters.cancelledRequests += 1;
    this.prefetchCounters.cancelledExpectedBytes += job.expectedBytes;
    if (this.prefetchInFlight === job) {
      this.prefetchInFlight = null;
    }
    this.prefetchRetiring = job;
    this.publishResidency();
  }

  private releasePrefetchJob(job: PrefetchJob): void {
    if (job.released) {
      return;
    }
    job.released = true;
    if (this.prefetchInFlight === job) {
      this.prefetchInFlight = null;
    }
    if (this.prefetchRetiring === job) {
      this.prefetchRetiring = null;
    }
    if (job.lifecycleEpoch === this.frameLifecycleEpoch) {
      this.pendingFrameRequests = Math.max(0, this.pendingFrameRequests - 1);
    }
    this.publishResidency();
  }

  private resetPrefetchState(forceCancel: boolean): void {
    this.dropQueuedPrefetch();
    if (this.prefetchInFlight) {
      if (forceCancel || !this.prefetchInFlight.joinedDemand) {
        this.cancelPrefetchJob(this.prefetchInFlight);
      }
    }
    this.prefetchEnabled = false;
    this.prefetchEpoch += 1;
    this.speculativeEntries.clear();
    this.resetPrefetchCounters();
  }

  private resetPrefetchCounters(): void {
    this.prefetchCounters = {
      demandJoins: 0,
      usefulCompletedHits: 0,
      usefulJoins: 0,
      usefulNativeBytes: 0,
      unusedRequests: 0,
      unusedNativeBytes: 0,
      cancelledRequests: 0,
      cancelledExpectedBytes: 0,
      cancelledNativeBytes: 0,
      budgetSkipped: 0,
      oversizeSkipped: 0,
    };
  }

  private markSpeculativeUseful(entry: NativeRamCacheEntry): void {
    const speculative = this.speculativeEntries.get(entry.entryId);
    if (!speculative) {
      return;
    }
    this.speculativeEntries.delete(entry.entryId);
    this.prefetchCounters.usefulCompletedHits += 1;
    this.prefetchCounters.usefulNativeBytes += speculative.nativeBytes;
  }

  private removeSpeculative(entryId: string, countUnused: boolean): void {
    const speculative = this.speculativeEntries.get(entryId);
    if (!speculative) {
      return;
    }
    this.speculativeEntries.delete(entryId);
    if (countUnused) {
      this.prefetchCounters.unusedRequests += 1;
      this.prefetchCounters.unusedNativeBytes += speculative.nativeBytes;
    }
  }

  private removeAllSpeculativeUnused(): void {
    for (const speculative of this.speculativeEntries.values()) {
      this.prefetchCounters.unusedRequests += 1;
      this.prefetchCounters.unusedNativeBytes += speculative.nativeBytes;
    }
    this.speculativeEntries.clear();
  }

  private prefetchMetrics(): NativeFramePrefetchMetrics {
    const pending = new Set<number>();
    if (this.prefetchQueue) {
      pending.add(this.prefetchQueue.frameNumber);
    }
    if (this.prefetchInFlight) {
      pending.add(this.prefetchInFlight.frameNumber);
    }
    const residentFrames = Array.from(this.speculativeEntries.values())
      .map((entry) => entry.frameNumber)
      .sort((left, right) => left - right);
    const maxInFlightBytes =
      this.prefetchMaxInFlightBytesOption ??
      this.context?.frameSizeBytes ??
      0;
    return Object.freeze({
      enabled: this.prefetchEnabled,
      rule: NATIVE_FRAME_PREFETCH_RULE,
      queuedFrames: this.prefetchQueue ? 1 : 0,
      inFlightFrames: this.prefetchInFlight ? 1 : 0,
      inFlightExpectedBytes: this.prefetchInFlight?.expectedBytes ?? 0,
      retiringFrames: this.prefetchRetiring ? 1 : 0,
      retiringExpectedBytes: this.prefetchRetiring?.expectedBytes ?? 0,
      maxQueuedFrames: DEFAULT_NATIVE_FRAME_PREFETCH_LIMITS.maxQueuedFrames,
      maxInFlightFrames: DEFAULT_NATIVE_FRAME_PREFETCH_LIMITS.maxInFlightFrames,
      maxInFlightBytes,
      pendingFrames: Object.freeze(
        Array.from(pending).sort((left, right) => left - right),
      ),
      residentFrames: Object.freeze(
        Array.from(new Set(residentFrames)).sort((left, right) => left - right),
      ),
      networkRequests: this.prefetchFrameBodyRequests,
      demandJoins: this.prefetchCounters.demandJoins,
      usefulCompletedHits: this.prefetchCounters.usefulCompletedHits,
      usefulJoins: this.prefetchCounters.usefulJoins,
      usefulRequests:
        this.prefetchCounters.usefulCompletedHits +
        this.prefetchCounters.usefulJoins,
      usefulNativeBytes: this.prefetchCounters.usefulNativeBytes,
      unusedRequests: this.prefetchCounters.unusedRequests,
      unusedNativeBytes: this.prefetchCounters.unusedNativeBytes,
      cancelledRequests: this.prefetchCounters.cancelledRequests,
      cancelledExpectedBytes: this.prefetchCounters.cancelledExpectedBytes,
      cancelledNativeBytes: this.prefetchCounters.cancelledNativeBytes,
      budgetSkipped: this.prefetchCounters.budgetSkipped,
      oversizeSkipped: this.prefetchCounters.oversizeSkipped,
    });
  }

  private async loadFrameBytes(
    frameNumber: number,
    context: NativeFrameContext,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    const lifecycleEpoch = this.frameLifecycleEpoch;
    this.demandFrameBodyRequests += 1;
    this.frameBodyRequests += 1;
    this.pendingFrameRequests += 1;
    try {
      const payload = await this.frameLoader(
        {
          locator: this.locator,
          context,
          frameNumber,
          signal,
        },
        {
          baseUrl: this.options.baseUrl,
          token: this.options.token,
          fetchImpl: this.options.fetchImpl,
        },
      );
      return payload.bytes;
    } finally {
      if (lifecycleEpoch === this.frameLifecycleEpoch) {
        this.pendingFrameRequests -= 1;
      }
    }
  }

  private applyRetention(
    cache: NativeRamCache,
    window: NativeRamWindow,
    requestId: number,
  ): boolean {
    const snapshot = cache.snapshot();
    const plan = planNativeRamWindowRetention({
      window,
      residents: this.residentDescriptors(snapshot),
      limits: this.cacheLimits,
    });
    if (
      this.isStale(requestId) ||
      this.activeWindow !== window ||
      cache.snapshot().revision !== snapshot.revision
    ) {
      return false;
    }
    this.applyEvictions(cache, plan.evictions);
    return true;
  }

  private admitNetwork(
    cache: NativeRamCache,
    window: NativeRamWindow,
    key: NativeFrameCacheKey,
    bytes: Uint8Array,
    requestId: number,
    ramEpoch: number,
  ): "stale" | "cached" | "bypassed" | "not-retained" {
    if (ramEpoch !== this.ramEpoch) {
      return "not-retained";
    }
    const snapshot = cache.snapshot();
    const plan = planNativeRamWindowAdmission({
      window,
      residents: this.residentDescriptors(snapshot),
      completion: {
        key,
        nativeBytes: bytes.byteLength,
        epoch: window.epoch,
      },
      limits: this.cacheLimits,
    });
    if (
      this.isStale(requestId) ||
      this.activeWindow !== window ||
      cache.snapshot().revision !== snapshot.revision
    ) {
      return "stale";
    }
    if (plan.admission.status === "rejected") {
      return "stale";
    }
    if (plan.admission.status === "not-cacheable") {
      return "bypassed";
    }
    if (!plan.incomingRetained) {
      return "not-retained";
    }

    this.applyEvictions(cache, plan.evictions);
    const result = cache.put(key, bytes, requestId);
    if (result.status === "rejected") {
      return "stale";
    }
    if (result.status === "bypassed") {
      return "bypassed";
    }
    this.residentKeys.set(result.entry.entryId, key);
    for (const entry of result.evicted) {
      this.residentKeys.delete(entry.entryId);
      this.removeSpeculative(entry.entryId, true);
    }
    this.publishResidency();
    return "cached";
  }

  private applyEvictions(
    cache: NativeRamCache,
    evictions: readonly NativeRamWindowEviction[],
  ): void {
    for (const eviction of evictions) {
      cache.invalidate(eviction.key);
      this.residentKeys.delete(eviction.entryId);
      this.removeSpeculative(eviction.entryId, true);
    }
  }

  private residentDescriptors(
    snapshot: NativeRamCacheSnapshot,
  ): NativeRamWindowResident[] {
    const descriptors: NativeRamWindowResident[] = [];
    for (const entry of snapshot.entries) {
      const key = this.residentKeys.get(entry.entryId);
      if (!key) {
        throw new NativeFrameError(
          "invalid-request",
          "Native RAM cache resident mapping is out of sync",
        );
      }
      descriptors.push({ key, entry });
    }
    return descriptors;
  }

  private cacheKey(
    frameNumber: number,
    context: NativeFrameContext,
  ): NativeFrameCacheKey {
    const sourceVersion = resolveNativeFrameSourceVersion(this.locator);
    if (!sourceVersion || !this.p2Scope) {
      throw invalidRequest("P2 source-version scope is unavailable");
    }
    return createNativeFrameCacheKey({
      principalId: this.p2Scope.principalId,
      sessionId: this.p2Scope.sessionId,
      studyInstanceUID: this.locator.studyInstanceUID,
      sourceVersion,
      seriesInstanceUID: this.locator.seriesInstanceUID,
      sopInstanceUID: this.locator.sopInstanceUID,
      frameNumber,
      representation: NATIVE_FRAME_REPRESENTATION,
      transferSyntaxUID: context.transferSyntaxUID,
    });
  }

  private cacheMetrics(
    snapshot: NativeRamCacheSnapshot,
  ): NativeFrameSessionCacheMetrics {
    return Object.freeze({
      cacheId: snapshot.cacheId,
      revision: snapshot.revision,
      eventSequence: snapshot.eventSequence,
      oldestEventSequence: snapshot.oldestEventSequence,
      droppedEventCount: snapshot.droppedEventCount,
      hits: snapshot.counters.hits,
      misses: snapshot.counters.misses,
      evictions:
        snapshot.counters.evictions + snapshot.counters.invalidations,
      invalidations: snapshot.counters.invalidations,
      bypasses: snapshot.counters.bypasses,
      entryCount: snapshot.entryCount,
      retainedNativeBytes: snapshot.retainedNativeBytes,
      frames: Object.freeze(
        snapshot.entries
          .map((entry) => entry.frameNumber)
          .sort((left, right) => left - right),
      ),
      limits: snapshot.limits,
    });
  }

  private assertP2Available(): void {
    if (!this.p2Scope) {
      throw invalidRequest("P2 requires an authenticated cache scope");
    }
    if (!resolveNativeFrameSourceVersion(this.locator)) {
      throw invalidRequest(
        "P2 is available only for recognised synthetic fixture instances",
      );
    }
  }

  private createP2Cache(): NativeRamCache {
    const sourceVersion = resolveNativeFrameSourceVersion(this.locator);
    if (!sourceVersion || !this.p2Scope) {
      throw invalidRequest("P2 source-version scope is unavailable");
    }
    return new NativeRamCache(
      {
        principalId: this.p2Scope.principalId,
        sessionId: this.p2Scope.sessionId,
        studyInstanceUID: this.locator.studyInstanceUID,
        sourceVersion,
      },
      this.cacheLimits,
      0,
    );
  }

  private disposeP2State(): void {
    if (this.cache) {
      this.cache.close();
      this.cache = null;
    }
    this.residentKeys.clear();
    this.activeWindow = null;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new NativeFrameError("invalid-request", "Native-frame session is closed");
    }
  }

  private isStale(requestId: number): boolean {
    return this.closed || requestId !== this.generation;
  }
}

function keyId(key: NativeFrameCacheKey): string {
  return [
    key.principalId,
    key.sessionId,
    key.studyInstanceUID,
    key.seriesInstanceUID,
    key.sopInstanceUID,
    String(key.frameNumber),
    key.representation,
    key.transferSyntaxUID,
    key.sourceVersion,
  ].join("\u0000");
}

function sameKey(
  left: NativeFrameCacheKey,
  right: NativeFrameCacheKey,
): boolean {
  return (
    left.principalId === right.principalId &&
    left.sessionId === right.sessionId &&
    left.studyInstanceUID === right.studyInstanceUID &&
    left.sourceVersion === right.sourceVersion &&
    left.seriesInstanceUID === right.seriesInstanceUID &&
    left.sopInstanceUID === right.sopInstanceUID &&
    left.frameNumber === right.frameNumber &&
    left.representation === right.representation &&
    left.transferSyntaxUID === right.transferSyntaxUID
  );
}
