import {
  MAX_DICOM_UID_LENGTH,
  NATIVE_FRAME_REPRESENTATION,
} from "./nativeFrameContract";

const DICOM_UID_PATTERN = /^[0-9]+(?:\.[0-9]+)*$/;
const OPAQUE_ID_PATTERN = /^[\x21-\x7e]+$/;
const MAX_OPAQUE_ID_LENGTH = 128;

let cacheSequence = 0;

export interface NativeRamCacheScope {
  readonly principalId: string;
  readonly sessionId: string;
  readonly studyInstanceUID: string;
  readonly sourceVersion: string;
}

export interface NativeFrameCacheKey extends NativeRamCacheScope {
  readonly seriesInstanceUID: string;
  readonly sopInstanceUID: string;
  readonly frameNumber: number;
  readonly representation: typeof NATIVE_FRAME_REPRESENTATION;
  readonly transferSyntaxUID: string;
}

export interface NativeRamCacheLimits {
  readonly maxTotalNativeBytes: number;
  readonly maxEntryNativeBytes: number;
  readonly maxEntries: number;
  readonly maxEventCount: number;
}

export const DEFAULT_NATIVE_RAM_CACHE_LIMITS: Readonly<NativeRamCacheLimits> =
  Object.freeze({
    maxTotalNativeBytes: 32 * 1024,
    maxEntryNativeBytes: 8 * 1024,
    maxEntries: 5,
    maxEventCount: 64,
  });

export type NativeRamCacheErrorCode =
  | "invalid-config"
  | "invalid-scope"
  | "invalid-key"
  | "context-mismatch"
  | "invalid-payload"
  | "invalid-cursor"
  | "non-monotonic-generation"
  | "closed";

export class NativeRamCacheError extends Error {
  readonly code: NativeRamCacheErrorCode;

  constructor(code: NativeRamCacheErrorCode, message: string) {
    super(message);
    this.name = "NativeRamCacheError";
    this.code = code;
  }
}

export interface NativeRamCacheEntry {
  readonly entryId: string;
  readonly frameNumber: number;
  readonly nativeBytes: number;
  readonly lastAccessOrdinal: number;
}

export interface NativeRamCacheCounters {
  readonly hits: number;
  readonly misses: number;
  readonly inserts: number;
  readonly replacements: number;
  readonly evictions: number;
  readonly invalidations: number;
  readonly clears: number;
  readonly bypasses: number;
  readonly rejections: number;
  readonly closes: number;
}

export interface NativeRamCacheSnapshot {
  readonly cacheId: string;
  readonly revision: number;
  readonly eventSequence: number;
  readonly oldestEventSequence: number | null;
  readonly droppedEventCount: number;
  readonly activeGeneration: number;
  readonly closed: boolean;
  readonly entryCount: number;
  readonly retainedNativeBytes: number;
  readonly returnedCopyBytes: number;
  readonly bypassedNativeBytes: number;
  readonly limits: NativeRamCacheLimits;
  readonly counters: NativeRamCacheCounters;
  readonly entries: readonly NativeRamCacheEntry[];
}

export type NativeRamCacheEventType =
  | "hit"
  | "miss"
  | "insert"
  | "replace"
  | "evict"
  | "invalidate"
  | "clear"
  | "bypass"
  | "reject";

export type NativeRamCacheEventReason =
  | "not-found"
  | "entry-over-limit"
  | "total-budget"
  | "lru"
  | "owned"
  | "close"
  | "stale-generation"
  | "closed";

export interface NativeRamCacheEvent {
  readonly sequence: number;
  readonly revision: number;
  readonly type: NativeRamCacheEventType;
  readonly resident: boolean;
  readonly entryId: string | null;
  readonly frameNumber: number | null;
  readonly nativeBytes: number;
  readonly temporaryBytes: number;
  readonly returnedBytes: number;
  readonly previousNativeBytes?: number;
  readonly reason?: NativeRamCacheEventReason;
}

export interface NativeRamCacheEventBatch {
  readonly events: readonly NativeRamCacheEvent[];
  readonly afterSequence: number;
  readonly oldestRetainedSequence: number | null;
  readonly latestSequence: number;
  readonly droppedForCursor: number;
  readonly droppedEventCount: number;
  readonly resynchronize: boolean;
}

export type NativeRamCachePutResult =
  | {
      readonly status: "inserted" | "replaced";
      readonly entry: NativeRamCacheEntry;
      readonly evicted: readonly NativeRamCacheEntry[];
      readonly retainedNativeBytes: number;
    }
  | {
      readonly status: "bypassed";
      readonly reason: "entry-over-limit" | "total-budget";
      readonly temporaryBytes: number;
      readonly retainedNativeBytes: number;
    }
  | {
      readonly status: "rejected";
      readonly reason: "stale-generation" | "closed";
      readonly retainedNativeBytes: number;
    };

export type NativeRamCacheLookup =
  | {
      readonly status: "hit";
      readonly entry: NativeRamCacheEntry;
      readonly bytes: Uint8Array;
      readonly returnedBytes: number;
    }
  | {
      readonly status: "miss";
      readonly reason: "not-found" | "closed";
    };

export interface NativeRamCacheClearResult {
  readonly clearedEntries: number;
  readonly clearedNativeBytes: number;
}

interface RetainedEntry {
  readonly keyFingerprint: string;
  readonly entryId: string;
  readonly entryOrdinal: number;
  readonly frameNumber: number;
  bytes: Uint8Array;
  lastAccessOrdinal: number;
}

export function createNativeRamCacheScope(
  scope: NativeRamCacheScope,
): NativeRamCacheScope {
  if (!scope || typeof scope !== "object") {
    throw new NativeRamCacheError("invalid-scope", "Native RAM cache scope is required");
  }
  assertOpaqueId(scope.principalId, "principalId", "invalid-scope");
  assertOpaqueId(scope.sessionId, "sessionId", "invalid-scope");
  assertUid(scope.studyInstanceUID, "studyInstanceUID", "invalid-scope");
  assertOpaqueId(scope.sourceVersion, "sourceVersion", "invalid-scope");
  return Object.freeze({
    principalId: scope.principalId,
    sessionId: scope.sessionId,
    studyInstanceUID: scope.studyInstanceUID,
    sourceVersion: scope.sourceVersion,
  });
}

export function createNativeFrameCacheKey(
  key: NativeFrameCacheKey,
): NativeFrameCacheKey {
  if (!key || typeof key !== "object") {
    throw new NativeRamCacheError("invalid-key", "Native frame cache key is required");
  }
  assertOpaqueId(key.principalId, "principalId", "invalid-key");
  assertOpaqueId(key.sessionId, "sessionId", "invalid-key");
  assertUid(key.studyInstanceUID, "studyInstanceUID", "invalid-key");
  assertOpaqueId(key.sourceVersion, "sourceVersion", "invalid-key");
  assertUid(key.seriesInstanceUID, "seriesInstanceUID", "invalid-key");
  assertUid(key.sopInstanceUID, "sopInstanceUID", "invalid-key");
  assertFrameNumber(key.frameNumber);
  if (key.representation !== NATIVE_FRAME_REPRESENTATION) {
    throw new NativeRamCacheError(
      "invalid-key",
      "Native frame cache key has an unsupported representation",
    );
  }
  assertUid(key.transferSyntaxUID, "transferSyntaxUID", "invalid-key");
  return Object.freeze({
    principalId: key.principalId,
    sessionId: key.sessionId,
    studyInstanceUID: key.studyInstanceUID,
    sourceVersion: key.sourceVersion,
    seriesInstanceUID: key.seriesInstanceUID,
    sopInstanceUID: key.sopInstanceUID,
    frameNumber: key.frameNumber,
    representation: NATIVE_FRAME_REPRESENTATION,
    transferSyntaxUID: key.transferSyntaxUID,
  });
}

export class NativeRamCache {
  private readonly scope: NativeRamCacheScope;
  private readonly limits: NativeRamCacheLimits;
  private readonly cacheId: string;
  private readonly entries = new Map<string, RetainedEntry>();
  private readonly eventRing: NativeRamCacheEvent[] = [];
  private retainedNativeBytes = 0;
  private returnedCopyBytes = 0;
  private bypassedNativeBytes = 0;
  private counters = {
    hits: 0,
    misses: 0,
    inserts: 0,
    replacements: 0,
    evictions: 0,
    invalidations: 0,
    clears: 0,
    bypasses: 0,
    rejections: 0,
    closes: 0,
  };
  private revision = 0;
  private eventSequence = 0;
  private accessClock = 0;
  private entrySequence = 0;
  private activeGeneration: number;
  private closed = false;
  private droppedEventCount = 0;

  constructor(
    scope: NativeRamCacheScope,
    limits: NativeRamCacheLimits = DEFAULT_NATIVE_RAM_CACHE_LIMITS,
    initialGeneration = 0,
  ) {
    this.scope = createNativeRamCacheScope(scope);
    this.limits = normalizeLimits(limits);
    assertGeneration(initialGeneration, "initialGeneration");
    this.activeGeneration = initialGeneration;
    this.cacheId = `NRC-${++cacheSequence}`;
  }

  setActiveGeneration(generation: number): void {
    if (this.closed) {
      throw new NativeRamCacheError(
        "closed",
        "Native RAM cache is closed",
      );
    }
    assertGeneration(generation, "generation");
    if (generation <= this.activeGeneration) {
      throw new NativeRamCacheError(
        "non-monotonic-generation",
        "Native RAM cache generation must increase",
      );
    }
    this.activeGeneration = generation;
  }

  put(
    keyInput: NativeFrameCacheKey,
    inputBytes: Uint8Array,
    generation: number,
  ): NativeRamCachePutResult {
    const { key, fingerprint } = this.resolveKey(keyInput);

    if (this.closed) {
      this.counters.rejections += 1;
      this.emit({
        type: "reject",
        resident: false,
        entryId: null,
        frameNumber: key.frameNumber,
        nativeBytes: 0,
        temporaryBytes: 0,
        returnedBytes: 0,
        reason: "closed",
      });
      return {
        status: "rejected",
        reason: "closed",
        retainedNativeBytes: this.retainedNativeBytes,
      };
    }

    if (
      !Number.isSafeInteger(generation) ||
      generation < 1 ||
      generation !== this.activeGeneration
    ) {
      this.counters.rejections += 1;
      this.emit({
        type: "reject",
        resident: false,
        entryId: null,
        frameNumber: key.frameNumber,
        nativeBytes: 0,
        temporaryBytes: 0,
        returnedBytes: 0,
        reason: "stale-generation",
      });
      return {
        status: "rejected",
        reason: "stale-generation",
        retainedNativeBytes: this.retainedNativeBytes,
      };
    }

    if (!(inputBytes instanceof Uint8Array) || inputBytes.byteLength < 1) {
      throw new NativeRamCacheError(
        "invalid-payload",
        "Native RAM cache payload must be a non-empty Uint8Array",
      );
    }

    const newBytes = inputBytes.byteLength;
    if (newBytes > this.limits.maxEntryNativeBytes) {
      return this.bypass(key.frameNumber, newBytes, "entry-over-limit");
    }
    if (newBytes > this.limits.maxTotalNativeBytes) {
      return this.bypass(key.frameNumber, newBytes, "total-budget");
    }

    const existing = this.entries.get(fingerprint);
    const previousBytes = existing?.bytes.byteLength ?? 0;
    const retainedCopy = new Uint8Array(inputBytes);
    const evicted: NativeRamCacheEntry[] = [];

    while (
      (!existing && this.entries.size >= this.limits.maxEntries) ||
      this.retainedNativeBytes - previousBytes + newBytes >
        this.limits.maxTotalNativeBytes
    ) {
      const victim = this.pickVictim(fingerprint);
      if (!victim) {
        return this.bypass(key.frameNumber, newBytes, "total-budget");
      }
      evicted.push(this.evictEntry(victim));
    }

    const lastAccessOrdinal = ++this.accessClock;

    if (existing) {
      this.retainedNativeBytes -= previousBytes;
      existing.bytes = retainedCopy;
      existing.lastAccessOrdinal = lastAccessOrdinal;
      this.retainedNativeBytes += newBytes;
      this.counters.replacements += 1;
      this.revision += 1;
      const publicEntry = toPublicEntry(existing);
      this.emit({
        type: "replace",
        resident: true,
        entryId: existing.entryId,
        frameNumber: existing.frameNumber,
        nativeBytes: newBytes,
        temporaryBytes: 0,
        returnedBytes: 0,
        previousNativeBytes: previousBytes,
      });
      return {
        status: "replaced",
        entry: publicEntry,
        evicted,
        retainedNativeBytes: this.retainedNativeBytes,
      };
    }

    const entryOrdinal = ++this.entrySequence;
    const entry: RetainedEntry = {
      keyFingerprint: fingerprint,
      entryId: `${this.cacheId}:E${entryOrdinal}`,
      entryOrdinal,
      frameNumber: key.frameNumber,
      bytes: retainedCopy,
      lastAccessOrdinal,
    };
    this.entries.set(fingerprint, entry);
    this.retainedNativeBytes += newBytes;
    this.counters.inserts += 1;
    this.revision += 1;
    const publicEntry = toPublicEntry(entry);
    this.emit({
      type: "insert",
      resident: true,
      entryId: entry.entryId,
      frameNumber: entry.frameNumber,
      nativeBytes: newBytes,
      temporaryBytes: 0,
      returnedBytes: 0,
    });
    return {
      status: "inserted",
      entry: publicEntry,
      evicted,
      retainedNativeBytes: this.retainedNativeBytes,
    };
  }

  get(keyInput: NativeFrameCacheKey): NativeRamCacheLookup {
    const { key, fingerprint } = this.resolveKey(keyInput);
    if (this.closed) {
      return { status: "miss", reason: "closed" };
    }
    const entry = this.entries.get(fingerprint);
    if (!entry) {
      this.counters.misses += 1;
      this.emit({
        type: "miss",
        resident: false,
        entryId: null,
        frameNumber: key.frameNumber,
        nativeBytes: 0,
        temporaryBytes: 0,
        returnedBytes: 0,
        reason: "not-found",
      });
      return { status: "miss", reason: "not-found" };
    }

    const bytes = entry.bytes.slice();
    entry.lastAccessOrdinal = ++this.accessClock;
    this.counters.hits += 1;
    this.returnedCopyBytes += bytes.byteLength;
    this.revision += 1;
    this.emit({
      type: "hit",
      resident: true,
      entryId: entry.entryId,
      frameNumber: entry.frameNumber,
      nativeBytes: entry.bytes.byteLength,
      temporaryBytes: 0,
      returnedBytes: bytes.byteLength,
    });
    return {
      status: "hit",
      entry: toPublicEntry(entry),
      bytes,
      returnedBytes: bytes.byteLength,
    };
  }

  contains(keyInput: NativeFrameCacheKey): boolean {
    const { fingerprint } = this.resolveKey(keyInput);
    return !this.closed && this.entries.has(fingerprint);
  }

  invalidate(keyInput: NativeFrameCacheKey): boolean {
    const { fingerprint } = this.resolveKey(keyInput);
    if (this.closed) {
      return false;
    }
    const entry = this.entries.get(fingerprint);
    if (!entry) {
      return false;
    }
    this.entries.delete(fingerprint);
    this.retainedNativeBytes -= entry.bytes.byteLength;
    this.counters.invalidations += 1;
    this.revision += 1;
    this.emit({
      type: "invalidate",
      resident: false,
      entryId: entry.entryId,
      frameNumber: entry.frameNumber,
      nativeBytes: entry.bytes.byteLength,
      temporaryBytes: 0,
      returnedBytes: 0,
    });
    return true;
  }

  clearOwned(): NativeRamCacheClearResult {
    if (this.entries.size === 0) {
      return { clearedEntries: 0, clearedNativeBytes: 0 };
    }
    const clearedEntries = this.entries.size;
    const clearedNativeBytes = this.retainedNativeBytes;
    this.entries.clear();
    this.retainedNativeBytes = 0;
    this.counters.clears += 1;
    this.revision += 1;
    this.emit({
      type: "clear",
      resident: false,
      entryId: null,
      frameNumber: null,
      nativeBytes: clearedNativeBytes,
      temporaryBytes: 0,
      returnedBytes: 0,
      reason: "owned",
    });
    return { clearedEntries, clearedNativeBytes };
  }

  snapshot(): NativeRamCacheSnapshot {
    const entries = Array.from(this.entries.values())
      .sort((left, right) => left.entryOrdinal - right.entryOrdinal)
      .map(toPublicEntry);
    return Object.freeze({
      cacheId: this.cacheId,
      revision: this.revision,
      eventSequence: this.eventSequence,
      oldestEventSequence: this.eventRing[0]?.sequence ?? null,
      droppedEventCount: this.droppedEventCount,
      activeGeneration: this.activeGeneration,
      closed: this.closed,
      entryCount: entries.length,
      retainedNativeBytes: this.retainedNativeBytes,
      returnedCopyBytes: this.returnedCopyBytes,
      bypassedNativeBytes: this.bypassedNativeBytes,
      limits: this.limits,
      counters: Object.freeze({ ...this.counters }),
      entries: Object.freeze(entries),
    });
  }

  eventsSince(afterSequence: number): NativeRamCacheEventBatch {
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
      throw new NativeRamCacheError(
        "invalid-cursor",
        "Native RAM cache event cursor must be a non-negative integer",
      );
    }
    const oldestRetainedSequence = this.eventRing[0]?.sequence ?? null;
    const latestSequence = this.eventSequence;
    const afterLatest = afterSequence > latestSequence;
    const missedRetained =
      oldestRetainedSequence !== null &&
      afterSequence < oldestRetainedSequence - 1;
    const droppedForCursor =
      oldestRetainedSequence === null
        ? 0
        : Math.max(0, oldestRetainedSequence - 1 - afterSequence);
    const events = this.eventRing.filter(
      (event) => event.sequence > afterSequence,
    );
    return Object.freeze({
      events: Object.freeze(events),
      afterSequence,
      oldestRetainedSequence,
      latestSequence,
      droppedForCursor,
      droppedEventCount: this.droppedEventCount,
      resynchronize: afterLatest || missedRetained,
    });
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.counters.closes += 1;
    if (this.entries.size === 0) {
      return;
    }
    const clearedNativeBytes = this.retainedNativeBytes;
    this.entries.clear();
    this.retainedNativeBytes = 0;
    this.counters.clears += 1;
    this.revision += 1;
    this.emit({
      type: "clear",
      resident: false,
      entryId: null,
      frameNumber: null,
      nativeBytes: clearedNativeBytes,
      temporaryBytes: 0,
      returnedBytes: 0,
      reason: "close",
    });
  }

  private resolveKey(keyInput: NativeFrameCacheKey): {
    key: NativeFrameCacheKey;
    fingerprint: string;
  } {
    const key = createNativeFrameCacheKey(keyInput);
    if (
      key.principalId !== this.scope.principalId ||
      key.sessionId !== this.scope.sessionId ||
      key.studyInstanceUID !== this.scope.studyInstanceUID ||
      key.sourceVersion !== this.scope.sourceVersion
    ) {
      throw new NativeRamCacheError(
        "context-mismatch",
        "Native frame cache key does not match the cache scope",
      );
    }
    return { key, fingerprint: fingerprintOf(key) };
  }

  private bypass(
    frameNumber: number,
    temporaryBytes: number,
    reason: "entry-over-limit" | "total-budget",
  ): NativeRamCachePutResult {
    this.counters.bypasses += 1;
    this.bypassedNativeBytes += temporaryBytes;
    this.emit({
      type: "bypass",
      resident: false,
      entryId: null,
      frameNumber,
      nativeBytes: 0,
      temporaryBytes,
      returnedBytes: 0,
      reason,
    });
    return {
      status: "bypassed",
      reason,
      temporaryBytes,
      retainedNativeBytes: this.retainedNativeBytes,
    };
  }

  private evictEntry(entry: RetainedEntry): NativeRamCacheEntry {
    this.entries.delete(entry.keyFingerprint);
    this.retainedNativeBytes -= entry.bytes.byteLength;
    this.counters.evictions += 1;
    this.revision += 1;
    const publicEntry = toPublicEntry(entry);
    this.emit({
      type: "evict",
      resident: false,
      entryId: entry.entryId,
      frameNumber: entry.frameNumber,
      nativeBytes: entry.bytes.byteLength,
      temporaryBytes: 0,
      returnedBytes: 0,
      reason: "lru",
    });
    return publicEntry;
  }

  private pickVictim(excludedFingerprint: string): RetainedEntry | null {
    let victim: RetainedEntry | null = null;
    for (const entry of this.entries.values()) {
      if (entry.keyFingerprint === excludedFingerprint) {
        continue;
      }
      if (
        victim === null ||
        entry.lastAccessOrdinal < victim.lastAccessOrdinal
      ) {
        victim = entry;
      }
    }
    return victim;
  }

  private emit(
    event: Omit<NativeRamCacheEvent, "sequence" | "revision">,
  ): void {
    const sequenced = Object.freeze({
      ...event,
      sequence: ++this.eventSequence,
      revision: this.revision,
    });
    this.eventRing.push(sequenced);
    if (this.eventRing.length > this.limits.maxEventCount) {
      this.eventRing.shift();
      this.droppedEventCount += 1;
    }
  }
}

function normalizeLimits(limits: NativeRamCacheLimits): NativeRamCacheLimits {
  if (!limits || typeof limits !== "object") {
    throw new NativeRamCacheError(
      "invalid-config",
      "Native RAM cache limits are required",
    );
  }
  assertPositiveInteger(limits.maxTotalNativeBytes, "maxTotalNativeBytes");
  assertPositiveInteger(limits.maxEntryNativeBytes, "maxEntryNativeBytes");
  assertPositiveInteger(limits.maxEntries, "maxEntries");
  assertPositiveInteger(limits.maxEventCount, "maxEventCount");
  return Object.freeze({
    maxTotalNativeBytes: limits.maxTotalNativeBytes,
    maxEntryNativeBytes: limits.maxEntryNativeBytes,
    maxEntries: limits.maxEntries,
    maxEventCount: limits.maxEventCount,
  });
}

function assertOpaqueId(
  value: string,
  field: string,
  code: "invalid-scope" | "invalid-key",
): void {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_OPAQUE_ID_LENGTH ||
    !OPAQUE_ID_PATTERN.test(value)
  ) {
    throw new NativeRamCacheError(
      code,
      `Invalid native RAM cache identity: ${field}`,
    );
  }
}

function assertUid(
  value: string,
  field: string,
  code: "invalid-scope" | "invalid-key",
): void {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_DICOM_UID_LENGTH ||
    !DICOM_UID_PATTERN.test(value)
  ) {
    throw new NativeRamCacheError(
      code,
      `Invalid native RAM cache DICOM UID: ${field}`,
    );
  }
}

function assertFrameNumber(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new NativeRamCacheError(
      "invalid-key",
      "Native RAM cache frame number must be a positive integer",
    );
  }
}

function assertGeneration(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new NativeRamCacheError(
      "invalid-config",
      `Invalid native RAM cache generation: ${field}`,
    );
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new NativeRamCacheError(
      "invalid-config",
      `Invalid native RAM cache limit: ${field}`,
    );
  }
}

function fingerprintOf(key: NativeFrameCacheKey): string {
  return JSON.stringify([
    key.principalId,
    key.sessionId,
    key.studyInstanceUID,
    key.sourceVersion,
    key.seriesInstanceUID,
    key.sopInstanceUID,
    key.frameNumber,
    key.representation,
    key.transferSyntaxUID,
  ]);
}

function toPublicEntry(entry: RetainedEntry): NativeRamCacheEntry {
  return Object.freeze({
    entryId: entry.entryId,
    frameNumber: entry.frameNumber,
    nativeBytes: entry.bytes.byteLength,
    lastAccessOrdinal: entry.lastAccessOrdinal,
  });
}
