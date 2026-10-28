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

export type NativeFrameMode = "p1" | "p2";
export type NativeFrameSource = "network" | "ram";
export type NativeFrameNativeCache = "hit" | "miss" | "not-applicable";

export interface NativeFrameP2Scope {
  principalId: string;
  sessionId: string;
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
}

export type FrameSelectionResult =
  | { status: "stale" }
  | {
      status: "presented";
      requestId: number;
      frameNumber: number;
      imageId: string;
      source: NativeFrameSource;
      nativeCache: NativeFrameNativeCache;
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
  lastSource: NativeFrameSource | null;
  requestedFrame: number | null;
  displayedFrame: number | null;
  pendingFrame: number | null;
  errorFrame: number | null;
  window: NativeFrameSessionWindowMetrics | null;
  cache: NativeFrameSessionCacheMetrics | null;
  prefetch: NativeFramePrefetchMetrics;
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
  private lastSource: NativeFrameSource | null = null;
  private requestedFrame: number | null = null;
  private displayedFrame: number | null = null;
  private pendingFrame: number | null = null;
  private errorFrame: number | null = null;
  private closed = false;

  constructor(
    private readonly locator: NativeFrameLocator,
    private readonly options: NativeFrameSessionOptions,
  ) {
    this.metadataLoader = options.loadMetadata ?? fetchInstanceMetadata;
    this.frameLoader = options.loadFrame ?? fetchNativeFrame;
    this.wrapperBuilder = options.buildWrapped ?? buildWrappedSingleFramePart10;
    this.now = options.now ?? (() => performance.now());
    this.p2Scope = options.cacheScope ?? null;
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
    let nativeCache: NativeFrameNativeCache = "not-applicable";
    let cache: NativeRamCache | null = null;
    let window: NativeRamWindow | null = null;
    let key: NativeFrameCacheKey | null = null;
    let joinedPrefetch: PrefetchJob | null = null;

    try {
      let bytes: Uint8Array;
      if (this.mode === "p2") {
        cache = this.cache;
        if (!cache) {
          throw invalidRequest("P2 native-frame cache is not available");
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

        if (this.prefetchInFlight && !sameKey(this.prefetchInFlight.key, key)) {
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
          if (
            this.prefetchInFlight &&
            sameKey(this.prefetchInFlight.key, key)
          ) {
            joinedPrefetch = this.prefetchInFlight;
            joinedPrefetch.joinedDemand = { requestId, ramEpoch, window };
            this.prefetchCounters.demandJoins += 1;
            bytes = await joinedPrefetch.promise;
          } else {
            bytes = await this.loadFrameBytes(
              frameNumber,
              context,
              controller.signal,
            );
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
      this.lastSource = source;
      this.displayedFrame = frameNumber;
      this.pendingFrame = null;
      this.errorFrame = null;
      if (joinedPrefetch !== null && !joinedPrefetch.joinedUseful) {
        joinedPrefetch.joinedUseful = true;
        this.prefetchCounters.usefulJoins += 1;
        this.prefetchCounters.usefulNativeBytes += bytes.byteLength;
      }
      this.schedulePrefetch(frameNumber, previousFrame, context, window);
      this.publishResidency();
      return {
        status: "presented",
        requestId,
        frameNumber,
        imageId,
        source,
        nativeCache,
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
    });
  }

  close(): void {
    if (this.closed) {
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
