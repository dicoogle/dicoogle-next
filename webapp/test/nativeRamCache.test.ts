import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NativeRamCache,
  NativeRamCacheError,
  createNativeFrameCacheKey,
  createNativeRamCacheScope,
  type NativeFrameCacheKey,
  type NativeRamCacheLimits,
  type NativeRamCacheLookup,
  type NativeRamCachePutResult,
} from "../src/services/nativeRamCache";
import { NATIVE_FRAME_TRANSFER_SYNTAX_UID } from "../src/services/nativeFrameContract";

const STUDY = "1.2.826.0.1.3680043.2.1125.100.1";
const SERIES = "1.2.826.0.1.3680043.2.1125.100.1.1";
const SOP = "1.2.826.0.1.3680043.2.1125.100.1.1.1";
const PRINCIPAL = "synthetic-principal";
const SESSION = "viewer-session-a";
const SOURCE_VERSION = "synthetic-study-v1";

const SCOPE = createNativeRamCacheScope({
  principalId: PRINCIPAL,
  sessionId: SESSION,
  studyInstanceUID: STUDY,
  sourceVersion: SOURCE_VERSION,
});

const LIMITS: NativeRamCacheLimits = {
  maxTotalNativeBytes: 32 * 1024,
  maxEntryNativeBytes: 8 * 1024,
  maxEntries: 5,
  maxEventCount: 64,
};

function makeKey(
  frameNumber = 1,
  overrides: Partial<NativeFrameCacheKey> = {},
): NativeFrameCacheKey {
  return {
    ...SCOPE,
    seriesInstanceUID: SERIES,
    sopInstanceUID: SOP,
    frameNumber,
    representation: "native-frame-v1",
    transferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
    ...overrides,
  };
}

function makeCache(
  limits: NativeRamCacheLimits = LIMITS,
  generation = 1,
): NativeRamCache {
  return new NativeRamCache(SCOPE, limits, generation);
}

function payload(size: number, fill: number): Uint8Array {
  return new Uint8Array(size).fill(fill);
}

function expectInserted(result: NativeRamCachePutResult) {
  if (result.status !== "inserted") {
    throw new Error(`expected inserted, got ${result.status}`);
  }
  return result;
}

function expectReplaced(result: NativeRamCachePutResult) {
  if (result.status !== "replaced") {
    throw new Error(`expected replaced, got ${result.status}`);
  }
  return result;
}

function expectBypassed(result: NativeRamCachePutResult) {
  if (result.status !== "bypassed") {
    throw new Error(`expected bypassed, got ${result.status}`);
  }
  return result;
}

function expectRejected(result: NativeRamCachePutResult) {
  if (result.status !== "rejected") {
    throw new Error(`expected rejected, got ${result.status}`);
  }
  return result;
}

function expectHit(lookup: NativeRamCacheLookup) {
  if (lookup.status !== "hit") {
    throw new Error(`expected hit, got ${lookup.status}`);
  }
  return lookup;
}

function cacheError(code: NativeRamCacheError["code"]) {
  return (error: unknown) =>
    error instanceof NativeRamCacheError && error.code === code;
}

function assertAccounting(cache: NativeRamCache): void {
  const snapshot = cache.snapshot();
  const sum = snapshot.entries.reduce(
    (total, entry) => total + entry.nativeBytes,
    0,
  );
  assert.equal(snapshot.entryCount, snapshot.entries.length);
  assert.equal(snapshot.retainedNativeBytes, sum);
  assert.ok(snapshot.retainedNativeBytes <= snapshot.limits.maxTotalNativeBytes);
  assert.ok(snapshot.entryCount <= snapshot.limits.maxEntries);
}

test("enforces the exact total and per-entry boundaries", () => {
  const cache = new NativeRamCache(
    SCOPE,
    {
      maxTotalNativeBytes: 16 * 1024,
      maxEntryNativeBytes: 8 * 1024,
      maxEntries: 4,
      maxEventCount: 64,
    },
    1,
  );
  const key1 = makeKey(1);
  const key2 = makeKey(2);
  const key3 = makeKey(3);

  expectInserted(cache.put(key1, payload(8192, 1), 1));
  expectInserted(cache.put(key2, payload(8192, 2), 1));
  assert.equal(cache.snapshot().retainedNativeBytes, 16 * 1024);

  const third = expectInserted(cache.put(key3, payload(1, 3), 1));
  assert.deepEqual(
    third.evicted.map((entry) => entry.frameNumber),
    [1],
  );
  assert.equal(cache.snapshot().retainedNativeBytes, 8193);
  assertAccounting(cache);

  const oversized = expectBypassed(
    cache.put(makeKey(4), payload(8193, 4), 1),
  );
  assert.equal(oversized.reason, "entry-over-limit");
  assert.equal(oversized.temporaryBytes, 8193);
  assert.equal(cache.snapshot().retainedNativeBytes, 8193);
  assert.equal(cache.snapshot().bypassedNativeBytes, 8193);
  assertAccounting(cache);
});

test("returns ownership copies and keeps copy bytes separate from retained bytes", () => {
  const cache = makeCache();
  const key = makeKey(1);
  const input = payload(1024, 0x11);

  expectInserted(cache.put(key, input, 1));
  input.fill(0x99);

  const first = expectHit(cache.get(key));
  assert.equal(first.returnedBytes, 1024);
  assert.ok(first.bytes.every((value) => value === 0x11));
  first.bytes.fill(0x77);

  const second = expectHit(cache.get(key));
  assert.ok(second.bytes.every((value) => value === 0x11));
  assert.equal(cache.snapshot().retainedNativeBytes, 1024);
  assert.equal(cache.snapshot().returnedCopyBytes, 2048);
  assert.equal(cache.snapshot().bypassedNativeBytes, 0);
  assertAccounting(cache);
});

test("accounts replacements and preserves the old entry on failed replacement", () => {
  const cache = makeCache();
  const key = makeKey(1);
  const first = expectInserted(cache.put(key, payload(4096, 0x21), 1));
  const originalId = first.entry.entryId;

  const replacement = expectReplaced(cache.put(key, payload(2048, 0x22), 1));
  assert.equal(replacement.entry.entryId, originalId);
  assert.deepEqual(replacement.evicted, []);
  assert.equal(cache.snapshot().retainedNativeBytes, 2048);
  assert.equal(cache.snapshot().counters.replacements, 1);
  assert.equal(cache.snapshot().entryCount, 1);
  assert.ok(expectHit(cache.get(key)).bytes.every((value) => value === 0x22));
  assertAccounting(cache);

  const failedEntry = expectBypassed(
    cache.put(key, payload(8193, 0x23), 1),
  );
  assert.equal(failedEntry.reason, "entry-over-limit");
  assert.equal(failedEntry.temporaryBytes, 8193);
  assert.equal(cache.snapshot().retainedNativeBytes, 2048);
  assert.equal(cache.snapshot().counters.evictions, 0);
  assert.ok(expectHit(cache.get(key)).bytes.every((value) => value === 0x22));
  assert.equal(cache.snapshot().bypassedNativeBytes, 8193);

  const totalBoundCache = new NativeRamCache(
    SCOPE,
    {
      maxTotalNativeBytes: 8 * 1024,
      maxEntryNativeBytes: 16 * 1024,
      maxEntries: 4,
      maxEventCount: 64,
    },
    1,
  );
  expectInserted(totalBoundCache.put(key, payload(4096, 0x31), 1));
  const failedTotal = expectBypassed(
    totalBoundCache.put(key, payload(8193, 0x32), 1),
  );
  assert.equal(failedTotal.reason, "total-budget");
  assert.ok(
    expectHit(totalBoundCache.get(key)).bytes.every((value) => value === 0x31),
  );
  assert.equal(totalBoundCache.snapshot().retainedNativeBytes, 4096);
  assertAccounting(totalBoundCache);
});

test("evicts deterministically by LRU and contains does not touch recency", () => {
  const cache = new NativeRamCache(
    SCOPE,
    {
      maxTotalNativeBytes: 32 * 1024,
      maxEntryNativeBytes: 8 * 1024,
      maxEntries: 3,
      maxEventCount: 64,
    },
    1,
  );
  expectInserted(cache.put(makeKey(1), payload(100, 1), 1));
  expectInserted(cache.put(makeKey(2), payload(100, 2), 1));
  expectInserted(cache.put(makeKey(3), payload(100, 3), 1));
  expectHit(cache.get(makeKey(1)));

  const fourth = expectInserted(cache.put(makeKey(4), payload(100, 4), 1));
  assert.deepEqual(
    fourth.evicted.map((entry) => entry.frameNumber),
    [2],
  );

  assert.equal(cache.contains(makeKey(3)), true);
  const fifth = expectInserted(cache.put(makeKey(5), payload(100, 5), 1));
  assert.deepEqual(
    fifth.evicted.map((entry) => entry.frameNumber),
    [3],
  );
  assertAccounting(cache);
});

test("enforces immutable scope/key ownership and context validation", () => {
  const mutableScope = {
    principalId: PRINCIPAL,
    sessionId: SESSION,
    studyInstanceUID: STUDY,
    sourceVersion: SOURCE_VERSION,
  };
  const cache = new NativeRamCache(mutableScope, LIMITS, 1);
  mutableScope.studyInstanceUID = "1.2.3";
  mutableScope.sessionId = "mutated";

  const mutableKey = { ...makeKey(1) };
  expectInserted(cache.put(mutableKey, payload(64, 0x41), 1));
  mutableKey.frameNumber = 2;

  assert.equal(cache.get(makeKey(1)).status, "hit");
  assert.equal(cache.get(mutableKey).status, "miss");
  assert.equal(
    Object.isFrozen(createNativeRamCacheScope({ ...SCOPE })),
    true,
  );
  assert.equal(
    Object.isFrozen(createNativeFrameCacheKey(makeKey(1))),
    true,
  );

  const beforeWrongContext = cache.snapshot();
  assert.throws(
    () => cache.put(makeKey(1, { sessionId: "other-session" }), payload(8, 1), 1),
    cacheError("context-mismatch"),
  );
  assert.throws(
    () => cache.contains(makeKey(1, { studyInstanceUID: "1.2.3" })),
    cacheError("context-mismatch"),
  );
  assert.equal(cache.snapshot().eventSequence, beforeWrongContext.eventSequence);
  assert.equal(cache.snapshot().revision, beforeWrongContext.revision);
  assert.equal(cache.snapshot().entryCount, 1);
});

test("rejects malformed keys, scope, limits, and cursors", () => {
  assert.throws(
    () => createNativeRamCacheScope({ ...SCOPE, sessionId: "" }),
    cacheError("invalid-scope"),
  );
  assert.throws(
    () => createNativeFrameCacheKey({ ...makeKey(1), frameNumber: 0 }),
    cacheError("invalid-key"),
  );
  assert.throws(
    () =>
      createNativeFrameCacheKey({
        ...makeKey(1),
        representation: "wrapped-single-frame-v1",
      } as unknown as NativeFrameCacheKey),
    cacheError("invalid-key"),
  );
  assert.throws(
    () => createNativeFrameCacheKey({ ...makeKey(1), sopInstanceUID: "bad" }),
    cacheError("invalid-key"),
  );
  assert.throws(
    () => createNativeFrameCacheKey({ ...makeKey(1), transferSyntaxUID: "" }),
    cacheError("invalid-key"),
  );
  assert.throws(
    () =>
      new NativeRamCache(SCOPE, {
        ...LIMITS,
        maxTotalNativeBytes: 0,
      }),
    cacheError("invalid-config"),
  );
  assert.throws(
    () => makeCache().eventsSince(-1),
    cacheError("invalid-cursor"),
  );
  assert.throws(
    () => makeCache().put(makeKey(1), new Uint8Array(0), 1),
    cacheError("invalid-payload"),
  );
});

test("validates monotonic generations and rejects late puts", () => {
  const cache = makeCache(LIMITS, 1);
  expectInserted(cache.put(makeKey(1), payload(64, 0x51), 1));

  assert.throws(
    () => cache.setActiveGeneration(1),
    cacheError("non-monotonic-generation"),
  );
  assert.throws(
    () => cache.setActiveGeneration(0),
    cacheError("non-monotonic-generation"),
  );

  cache.setActiveGeneration(2);
  assert.equal(cache.get(makeKey(1)).status, "hit");

  const stale = expectRejected(cache.put(makeKey(2), payload(64, 0x52), 1));
  assert.equal(stale.reason, "stale-generation");
  assert.equal(cache.snapshot().entryCount, 1);
  assert.equal(cache.snapshot().counters.rejections, 1);

  expectInserted(cache.put(makeKey(2), payload(64, 0x52), 2));
  const staleZero = expectRejected(
    cache.put(makeKey(3), payload(64, 0x53), 0),
  );
  assert.equal(staleZero.reason, "stale-generation");
  assert.equal(cache.snapshot().entryCount, 2);

  const batch = cache.eventsSince(0);
  assert.equal(
    batch.events.filter(
      (event) =>
        (event.type === "insert" || event.type === "replace" || event.type === "hit") &&
        event.resident === true,
    ).length,
    3,
  );
  assert.ok(
    batch.events
      .filter((event) => event.type === "reject")
      .every((event) => event.resident === false),
  );
});

test("closes, clears owned state, and rejects late repopulation", () => {
  const cache = makeCache();
  expectInserted(cache.put(makeKey(1), payload(128, 0x61), 1));

  cache.close();
  assert.equal(cache.snapshot().closed, true);
  assert.equal(cache.snapshot().entryCount, 0);
  assert.equal(cache.snapshot().retainedNativeBytes, 0);
  assert.equal(cache.snapshot().counters.closes, 1);
  assert.equal(cache.get(makeKey(1)).status, "miss");

  const closedPut = expectRejected(
    cache.put(makeKey(2), payload(128, 0x62), 1),
  );
  assert.equal(closedPut.reason, "closed");
  assert.equal(cache.snapshot().entryCount, 0);
  assert.throws(
    () => cache.setActiveGeneration(2),
    cacheError("closed"),
  );

  cache.close();
  assert.equal(cache.snapshot().counters.closes, 1);
  const events = cache.eventsSince(0).events;
  assert.equal(events.at(-1)?.type, "reject");
  assert.equal(events.at(-1)?.resident, false);
  assert.ok(
    events.some((event) => event.type === "clear" && event.reason === "close"),
  );
});

test("clears and invalidates idempotently without phantom events", () => {
  const cache = makeCache();
  expectInserted(cache.put(makeKey(1), payload(96, 0x71), 1));
  expectInserted(cache.put(makeKey(2), payload(96, 0x72), 1));

  assert.equal(cache.invalidate(makeKey(1)), true);
  const afterInvalidate = cache.snapshot();
  assert.equal(cache.invalidate(makeKey(1)), false);
  assert.equal(cache.snapshot().revision, afterInvalidate.revision);
  assert.equal(cache.snapshot().eventSequence, afterInvalidate.eventSequence);

  const cleared = cache.clearOwned();
  assert.deepEqual(cleared, { clearedEntries: 1, clearedNativeBytes: 96 });
  const afterClear = cache.snapshot();
  assert.deepEqual(cache.clearOwned(), {
    clearedEntries: 0,
    clearedNativeBytes: 0,
  });
  assert.equal(cache.snapshot().revision, afterClear.revision);
  assert.equal(cache.snapshot().eventSequence, afterClear.eventSequence);
  assert.equal(
    cache
      .eventsSince(0)
      .events.filter((event) => event.type === "clear").length,
    1,
  );
});

test("bounds the event ring and signals cursor resynchronisation", () => {
  const cache = new NativeRamCache(
    SCOPE,
    {
      maxTotalNativeBytes: 32 * 1024,
      maxEntryNativeBytes: 8 * 1024,
      maxEntries: 2,
      maxEventCount: 2,
    },
    1,
  );
  expectInserted(cache.put(makeKey(1), payload(64, 1), 1));
  expectInserted(cache.put(makeKey(2), payload(64, 2), 1));
  expectInserted(cache.put(makeKey(3), payload(64, 3), 1));

  const snapshot = cache.snapshot();
  assert.equal(snapshot.eventSequence, 4);
  assert.equal(snapshot.oldestEventSequence, 3);
  assert.equal(snapshot.droppedEventCount, 2);
  assert.equal(snapshot.revision, 4);

  const fromStart = cache.eventsSince(0);
  assert.equal(fromStart.resynchronize, true);
  assert.equal(fromStart.droppedForCursor, 2);
  assert.deepEqual(
    fromStart.events.map((event) => event.sequence),
    [3, 4],
  );

  const complete = cache.eventsSince(2);
  assert.equal(complete.resynchronize, false);
  assert.equal(complete.droppedForCursor, 0);
  assert.deepEqual(
    complete.events.map((event) => event.sequence),
    [3, 4],
  );

  assert.deepEqual(cache.eventsSince(4).events, []);
  assert.equal(cache.eventsSince(4).resynchronize, false);
  assert.equal(cache.eventsSince(5).resynchronize, true);
});

test("keeps event revisions aligned with mutations and access states", () => {
  const cache = makeCache();
  const key = makeKey(1);

  assert.equal(cache.snapshot().revision, 0);
  assert.equal(cache.get(key).status, "miss");
  assert.equal(cache.snapshot().revision, 0);
  assert.equal(cache.snapshot().eventSequence, 1);

  expectInserted(cache.put(key, payload(1024, 0x81), 1));
  assert.equal(cache.snapshot().revision, 1);

  const hit = expectHit(cache.get(key));
  assert.equal(hit.returnedBytes, 1024);
  assert.equal(cache.snapshot().revision, 2);
  assert.equal(cache.snapshot().returnedCopyBytes, 1024);

  expectReplaced(cache.put(key, payload(2048, 0x82), 1));
  assert.equal(cache.snapshot().revision, 3);

  expectBypassed(cache.put(key, payload(8193, 0x83), 1));
  const afterBypass = cache.snapshot();
  assert.equal(afterBypass.revision, 3);
  assert.equal(afterBypass.retainedNativeBytes, 2048);
  assert.equal(afterBypass.bypassedNativeBytes, 8193);

  expectRejected(cache.put(makeKey(2), payload(64, 0x84), 0));
  const afterReject = cache.snapshot();
  assert.equal(afterReject.revision, 3);
  assert.equal(afterReject.eventSequence, 6);
  assert.equal(afterReject.counters.bypasses, 1);
  assert.equal(afterReject.counters.rejections, 1);

  const events = cache.eventsSince(0).events;
  assert.equal(events[0]?.type, "miss");
  assert.equal(events[0]?.revision, 0);
  assert.equal(events[1]?.type, "insert");
  assert.equal(events[1]?.revision, 1);
  assert.equal(events[2]?.type, "hit");
  assert.equal(events[2]?.revision, 2);
  assert.equal(events[3]?.type, "replace");
  assert.equal(events[3]?.revision, 3);
  assert.equal(events[4]?.type, "bypass");
  assert.equal(events[4]?.resident, false);
  assert.equal(events[5]?.type, "reject");
  assert.equal(events[5]?.resident, false);
  assertAccounting(cache);
});

test("does not expose raw scope, key, or transfer identities in diagnostics", () => {
  const cache = makeCache();
  const result = expectInserted(cache.put(makeKey(1), payload(512, 0x91), 1));
  const publicEvidence = JSON.stringify({
    snapshot: cache.snapshot(),
    events: cache.eventsSince(0),
    result,
  });

  for (const value of [
    PRINCIPAL,
    SESSION,
    STUDY,
    SERIES,
    SOP,
    SOURCE_VERSION,
    NATIVE_FRAME_TRANSFER_SYNTAX_UID,
    "native-frame-v1",
  ]) {
    assert.equal(publicEvidence.includes(value), false);
  }
  assert.match(publicEvidence, /NRC-\d+:E1/);
});
