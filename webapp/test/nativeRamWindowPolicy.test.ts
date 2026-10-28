import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NativeRamCache,
  createNativeRamCacheScope,
  type NativeFrameCacheKey,
  type NativeRamCacheLimits,
} from "../src/services/nativeRamCache";
import {
  DEFAULT_NATIVE_RAM_WINDOW_POLICY,
  NativeRamWindowPolicyError,
  createNativeRamWindow,
  planNativeRamWindowAdmission,
  planNativeRamWindowRetention,
  type NativeRamWindow,
  type NativeRamWindowPolicyConfig,
  type NativeRamWindowResident,
} from "../src/services/nativeRamWindowPolicy";
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

function makeWindow(
  selectedFrame = 3,
  numberOfFrames = 8,
  epoch = 1,
  config: NativeRamWindowPolicyConfig = DEFAULT_NATIVE_RAM_WINDOW_POLICY,
): NativeRamWindow {
  return createNativeRamWindow({
    selectedKey: makeKey(selectedFrame),
    numberOfFrames,
    epoch,
    config,
  });
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

function putFrame(
  cache: NativeRamCache,
  frameNumber: number,
  size = 4096,
  fill = frameNumber,
): void {
  const result = cache.put(makeKey(frameNumber), payload(size, fill), 1);
  assert.equal(result.status, "inserted");
}

function residents(cache: NativeRamCache): NativeRamWindowResident[] {
  return cache.snapshot().entries.map((entry) => ({
    key: makeKey(entry.frameNumber),
    entry,
  }));
}

function makeResident(
  frameNumber: number,
  nativeBytes: number,
  lastAccessOrdinal: number,
  entryId = `NRC-1:E${frameNumber}`,
): NativeRamWindowResident {
  return {
    key: makeKey(frameNumber),
    entry: {
      entryId,
      frameNumber,
      nativeBytes,
      lastAccessOrdinal,
    },
  };
}

function framesOf(cache: NativeRamCache): number[] {
  return cache
    .snapshot()
    .entries.map((entry) => entry.frameNumber)
    .sort((left, right) => left - right);
}

function invalidatedFrames(cache: NativeRamCache): number[] {
  return cache
    .eventsSince(0)
    .events.filter((event) => event.type === "invalidate")
    .map((event) => event.frameNumber)
    .filter((frame): frame is number => frame !== null);
}

test("uses the approved default and clamps window bounds at both ends", () => {
  assert.deepEqual(DEFAULT_NATIVE_RAM_WINDOW_POLICY, { behind: 1, ahead: 1 });

  const first = makeWindow(1);
  assert.deepEqual(first.frames, [1, 2]);
  assert.equal(first.startFrame, 1);
  assert.equal(first.selectedKey.sourceVersion, SOURCE_VERSION);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.frames));

  const middle = makeWindow(3);
  assert.deepEqual(middle.frames, [2, 3, 4]);
  assert.equal(middle.endFrame, 4);

  const last = makeWindow(8);
  assert.deepEqual(last.frames, [7, 8]);
  assert.equal(last.endFrame, 8);
});

test("moves deterministically forward, backward, and across jumps", () => {
  const sequence = [1, 2, 3, 7, 8, 2];
  const expected = [
    [1, 2],
    [1, 2, 3],
    [2, 3, 4],
    [6, 7, 8],
    [7, 8],
    [1, 2, 3],
  ];

  sequence.forEach((selectedFrame, index) => {
    assert.deepEqual(makeWindow(selectedFrame).frames, expected[index]);
  });
});

test("reports desired membership and actual residency without fetching neighbours", () => {
  const cache = makeCache();
  putFrame(cache, 2);
  putFrame(cache, 3);
  putFrame(cache, 4);
  const before = cache.snapshot();

  const plan = planNativeRamWindowRetention({
    window: makeWindow(5),
    residents: residents(cache),
    limits: LIMITS,
  });

  assert.deepEqual(plan.desiredFrames, [4, 5, 6]);
  assert.deepEqual(plan.residentFrames, [2, 3, 4]);
  assert.deepEqual(plan.outsideWindowFrames, [2, 3]);
  assert.deepEqual(plan.missingFrames, [5, 6]);
  assert.deepEqual(plan.retainedFrames, [4]);
  assert.deepEqual(
    plan.evictions.map((eviction) => eviction.frameNumber),
    [2, 3],
  );
  assert.ok(plan.evictions.every((eviction) => eviction.reason === "outside-window"));
  assert.equal(plan.currentRetained, false);
  assert.equal(plan.projectedNativeBytes, 4096);
  assert.deepEqual(cache.snapshot(), before);
});

test("evicts outside-window entries and leaves actual occupancy at the window", () => {
  const cache = makeCache();
  for (let frame = 1; frame <= 5; frame += 1) {
    putFrame(cache, frame);
  }

  const window = makeWindow(3);
  const plan = planNativeRamWindowRetention({
    window,
    residents: residents(cache),
    limits: LIMITS,
  });
  assert.deepEqual(
    plan.evictions.map((eviction) => eviction.frameNumber),
    [1, 5],
  );
  assert.deepEqual(plan.retainedFrames, [2, 3, 4]);
  assert.equal(plan.projectedNativeBytes, 12 * 1024);

  for (const eviction of plan.evictions) {
    assert.equal(cache.invalidate(eviction.key), true);
  }

  assert.deepEqual(framesOf(cache), [2, 3, 4]);
  assert.equal(cache.snapshot().retainedNativeBytes, 12 * 1024);
  assert.equal(cache.snapshot().counters.invalidations, 2);
  assert.deepEqual(invalidatedFrames(cache), [1, 5]);
});

test("evicts by distance and age while keeping the current frame", () => {
  const window = makeWindow(3, 5, 1, { behind: 2, ahead: 2 });
  const entries = [
    makeResident(1, 4096, 5),
    makeResident(2, 4096, 3),
    makeResident(3, 4096, 0),
    makeResident(4, 4096, 4),
    makeResident(5, 4096, 1),
  ];

  const plan = planNativeRamWindowRetention({
    window,
    residents: entries,
    limits: { ...LIMITS, maxEntries: 3 },
  });

  assert.deepEqual(
    plan.evictions.map((eviction) => eviction.frameNumber),
    [5, 1],
  );
  assert.ok(plan.evictions.every((eviction) => eviction.reason === "pressure"));
  assert.deepEqual(plan.retainedFrames, [2, 3, 4]);
  assert.equal(plan.currentRetained, true);
  assert.equal(plan.projectedEntryCount, 3);
  assert.equal(plan.projectedNativeBytes, 12 * 1024);
});

test("enforces the byte budget when the window is larger than the budget", () => {
  const window = makeWindow(3, 5, 1, { behind: 2, ahead: 2 });
  const entries = [1, 2, 3, 4, 5].map((frame) =>
    makeResident(frame, 8192, frame),
  );

  const plan = planNativeRamWindowRetention({
    window,
    residents: entries,
    limits: {
      ...LIMITS,
      maxTotalNativeBytes: 16 * 1024,
      maxEntryNativeBytes: 8192,
    },
  });

  assert.deepEqual(plan.window.frames, [1, 2, 3, 4, 5]);
  assert.deepEqual(
    plan.evictions.map((eviction) => eviction.frameNumber),
    [1, 5, 2],
  );
  assert.deepEqual(plan.retainedFrames, [3, 4]);
  assert.equal(plan.currentRetained, true);
  assert.equal(plan.projectedEntryCount, 2);
  assert.equal(plan.projectedNativeBytes, 16 * 1024);
  assert.ok(plan.projectedNativeBytes <= plan.limits.maxTotalNativeBytes);
});

test("rejects wrong context, stale epoch, and outside-window completions before eviction", () => {
  const window = makeWindow(3, 8, 2);
  const entries = [1, 2, 3, 4, 5].map((frame) =>
    makeResident(frame, 8192, frame),
  );
  const base = {
    window,
    residents: entries,
    limits: {
      ...LIMITS,
      maxTotalNativeBytes: 16 * 1024,
      maxEntryNativeBytes: 8192,
    },
  };

  const wrongSession = planNativeRamWindowAdmission({
    ...base,
    completion: {
      key: makeKey(3, { sessionId: "other-session" }),
      nativeBytes: 4096,
      epoch: 2,
    },
  });
  assert.equal(wrongSession.admission.status, "rejected");
  assert.equal(wrongSession.admission.reason, "wrong-context");
  assert.deepEqual(wrongSession.evictions, []);
  assert.equal(wrongSession.projectedEntryCount, 5);

  const wrongStudy = planNativeRamWindowAdmission({
    ...base,
    completion: {
      key: makeKey(3, { studyInstanceUID: "1.2.826.0.1.3680043.2.1125.100.9" }),
      nativeBytes: 4096,
      epoch: 2,
    },
  });
  assert.equal(wrongStudy.admission.reason, "wrong-context");
  assert.deepEqual(wrongStudy.evictions, []);

  const stale = planNativeRamWindowAdmission({
    ...base,
    completion: { key: makeKey(3), nativeBytes: 4096, epoch: 1 },
  });
  assert.equal(stale.admission.reason, "stale-epoch");
  assert.deepEqual(stale.evictions, []);

  const outside = planNativeRamWindowAdmission({
    ...base,
    completion: { key: makeKey(5), nativeBytes: 4096, epoch: 2 },
  });
  assert.equal(outside.admission.reason, "outside-window");
  assert.deepEqual(outside.evictions, []);
});

test("rejects a late completion whose old epoch is no longer active", () => {
  const oldWindow = makeWindow(3, 8, 1);
  const newWindow = makeWindow(4, 8, 2);
  assert.deepEqual(oldWindow.frames, [2, 3, 4]);
  assert.deepEqual(newWindow.frames, [3, 4, 5]);

  const late = planNativeRamWindowAdmission({
    window: newWindow,
    residents: [],
    completion: {
      key: makeKey(3),
      nativeBytes: 4096,
      epoch: oldWindow.epoch,
    },
    limits: LIMITS,
  });
  assert.equal(late.admission.status, "rejected");
  assert.equal(late.admission.reason, "stale-epoch");
  assert.deepEqual(late.evictions, []);
  assert.deepEqual(late.retainedFrames, []);
});

test("treats an oversize current frame as transient and not cacheable", () => {
  const cache = makeCache();
  putFrame(cache, 2);

  const plan = planNativeRamWindowAdmission({
    window: makeWindow(3),
    residents: residents(cache),
    completion: { key: makeKey(3), nativeBytes: 8193, epoch: 1 },
    limits: LIMITS,
  });
  assert.equal(plan.admission.status, "not-cacheable");
  assert.equal(plan.admission.reason, "oversize-entry");
  assert.deepEqual(plan.evictions, []);
  assert.deepEqual(plan.retainedFrames, [2]);
  assert.equal(plan.currentRetained, false);
  assert.equal(plan.incomingRetained, false);
  assert.equal(plan.projectedNativeBytes, 4096);

  const result = cache.put(makeKey(3), payload(8193, 3), 1);
  assert.equal(result.status, "bypassed");
  assert.deepEqual(framesOf(cache), [2]);
  assert.equal(cache.snapshot().counters.bypasses, 1);
});

test("accounts for an incoming same-key replacement without double counting", () => {
  const cache = makeCache(
    {
      ...LIMITS,
      maxTotalNativeBytes: 8192,
      maxEntryNativeBytes: 8192,
    },
  );
  putFrame(cache, 2);
  putFrame(cache, 3);

  const plan = planNativeRamWindowAdmission({
    window: makeWindow(3),
    residents: residents(cache),
    completion: { key: makeKey(3), nativeBytes: 6144, epoch: 1 },
    limits: {
      ...LIMITS,
      maxTotalNativeBytes: 8192,
      maxEntryNativeBytes: 8192,
    },
  });

  assert.equal(plan.admission.status, "admitted");
  assert.equal(plan.admission.replacement, true);
  assert.equal(plan.incomingRetained, true);
  assert.deepEqual(
    plan.evictions.map((eviction) => eviction.frameNumber),
    [2],
  );
  assert.deepEqual(plan.retainedFrames, [3]);
  assert.equal(plan.projectedEntryCount, 1);
  assert.equal(plan.projectedNativeBytes, 6144);

  for (const eviction of plan.evictions) {
    assert.equal(cache.invalidate(eviction.key), true);
  }
  const replacement = cache.put(makeKey(3), payload(6144, 3), 1);
  assert.equal(replacement.status, "replaced");
  assert.deepEqual(framesOf(cache), [3]);
  assert.equal(cache.snapshot().retainedNativeBytes, 6144);
  assert.equal(cache.snapshot().counters.invalidations, 1);
  assert.equal(cache.snapshot().counters.replacements, 1);
  assert.deepEqual(invalidatedFrames(cache), [2]);
});

test("applies incoming pressure evictions and checks actual cache occupancy", () => {
  const cache = makeCache({
    ...LIMITS,
    maxTotalNativeBytes: 16 * 1024,
    maxEntryNativeBytes: 8192,
  });
  for (const frame of [1, 2, 4, 5]) {
    putFrame(cache, frame);
  }

  const window = makeWindow(3, 8, 1, { behind: 2, ahead: 2 });
  const plan = planNativeRamWindowAdmission({
    window,
    residents: residents(cache),
    completion: { key: makeKey(3), nativeBytes: 4096, epoch: 1 },
    limits: {
      ...LIMITS,
      maxTotalNativeBytes: 16 * 1024,
      maxEntryNativeBytes: 8192,
    },
  });

  assert.equal(plan.admission.status, "admitted");
  assert.equal(plan.incomingRetained, true);
  assert.deepEqual(
    plan.evictions.map((eviction) => eviction.frameNumber),
    [1],
  );
  assert.deepEqual(plan.retainedFrames, [2, 3, 4, 5]);
  assert.equal(plan.projectedEntryCount, 4);
  assert.equal(plan.projectedNativeBytes, 16 * 1024);

  for (const eviction of plan.evictions) {
    assert.equal(cache.invalidate(eviction.key), true);
  }
  const inserted = cache.put(makeKey(3), payload(4096, 3), 1);
  assert.equal(inserted.status, "inserted");

  assert.deepEqual(framesOf(cache), [2, 3, 4, 5]);
  assert.equal(cache.snapshot().retainedNativeBytes, 16 * 1024);
  assert.deepEqual(invalidatedFrames(cache), [1]);
});

test("rejects a resident descriptor from another context without exposing identities", () => {
  const wrongResident: NativeRamWindowResident = {
    key: makeKey(2, { sessionId: "other-session" }),
    entry: makeResident(2, 4096, 1).entry,
  };

  assert.throws(
    () =>
      planNativeRamWindowRetention({
        window: makeWindow(3),
        residents: [wrongResident],
        limits: LIMITS,
      }),
    (error: unknown) => {
      return (
        error instanceof NativeRamWindowPolicyError &&
        error.code === "context-mismatch" &&
        !error.message.includes(STUDY) &&
        !error.message.includes("other-session")
      );
    },
  );
});
