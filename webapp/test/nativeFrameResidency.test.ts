import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MULTIFRAME_GRAYSCALE_WORD_SC_SOP_CLASS_UID,
  NATIVE_FRAME_TRANSFER_SYNTAX_UID,
  type NativeFrameContext,
  type NativeFrameLocator,
  type NativeFramePayload,
  type NativeFrameRequest,
} from "../src/services/nativeFrameContract";
import type { WrappedSingleFrame } from "../src/services/nativeFrameContract";
import type { FramePresenter } from "../src/services/nativeFramePresenter";
import {
  NativeFrameSession,
  type NativeFrameResidencyEventBatch,
  type NativeFrameResidencyUpdate,
  type NativeFrameSessionMetrics,
  type NativeFrameSessionOptions,
} from "../src/services/nativeFrameSession";
import {
  buildNativeFrameResidencyView,
  computeNativeFrameResidencyRange,
  NATIVE_FRAME_OPFS_STATUS,
  NATIVE_FRAME_RESIDENCY_DECODED_STATE,
  reduceNativeFrameResidency,
  type NativeFrameResidencyState,
} from "../src/services/nativeFrameResidency";
import {
  SYNTHETIC_FIXTURE_INSTANCE_A_UID,
  SYNTHETIC_FIXTURE_SERIES_A_UID,
  SYNTHETIC_FIXTURE_STUDY_UID,
} from "../src/services/nativeFrameFixture";

const STUDY = SYNTHETIC_FIXTURE_STUDY_UID;
const SERIES = SYNTHETIC_FIXTURE_SERIES_A_UID;
const INSTANCE = SYNTHETIC_FIXTURE_INSTANCE_A_UID;
const FRAME_SIZE = 8192;
const CACHE_SCOPE = {
  principalId: "synthetic-principal",
  sessionId: "viewer-session-04d",
};

const locator: NativeFrameLocator = {
  studyInstanceUID: STUDY,
  seriesInstanceUID: SERIES,
  sopInstanceUID: INSTANCE,
};

const context: NativeFrameContext = {
  sopClassUID: MULTIFRAME_GRAYSCALE_WORD_SC_SOP_CLASS_UID,
  transferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
  rows: 64,
  columns: 64,
  samplesPerPixel: 1,
  photometricInterpretation: "MONOCHROME2",
  bitsAllocated: 16,
  bitsStored: 16,
  highBit: 15,
  pixelRepresentation: 0,
  numberOfFrames: 8,
  frameSizeBytes: FRAME_SIZE,
};

class TestPresenter implements FramePresenter {
  visibleRequestId: number | null = null;
  maxRegistrations = 0;
  closed = false;
  private latestRequestId = 0;

  begin(requestId: number): void {
    this.latestRequestId = requestId;
  }

  async present(
    requestId: number,
    wrapped: WrappedSingleFrame,
  ): Promise<string | null> {
    void wrapped;
    if (this.closed || requestId !== this.latestRequestId) {
      return null;
    }
    this.visibleRequestId = requestId;
    this.maxRegistrations = Math.max(
      this.maxRegistrations,
      this.registrationCount(),
    );
    return `image-${requestId}`;
  }

  close(): void {
    this.closed = true;
    this.visibleRequestId = null;
  }

  registrationCount(): number {
    return this.visibleRequestId === null ? 0 : 1;
  }
}

class DeferredPresenter implements FramePresenter {
  visibleRequestId: number | null = null;
  closed = false;
  private latestRequestId = 0;
  private pending: {
    requestId: number;
    resolve: (imageId: string | null) => void;
  } | null = null;

  begin(requestId: number): void {
    this.latestRequestId = requestId;
    if (this.pending && this.pending.requestId !== requestId) {
      const stale = this.pending;
      this.pending = null;
      stale.resolve(null);
    }
  }

  present(requestId: number, wrapped: WrappedSingleFrame): Promise<string | null> {
    void wrapped;
    if (this.closed || requestId !== this.latestRequestId) {
      return Promise.resolve(null);
    }
    return new Promise<string | null>((resolve) => {
      this.pending = { requestId, resolve };
    });
  }

  settlePending(): void {
    if (!this.pending) {
      return;
    }
    const pending = this.pending;
    this.pending = null;
    this.visibleRequestId = pending.requestId;
    pending.resolve(`image-${pending.requestId}`);
  }

  close(): void {
    this.closed = true;
    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      pending.resolve(null);
    }
    this.visibleRequestId = null;
  }

  registrationCount(): number {
    return (this.visibleRequestId === null ? 0 : 1) + (this.pending ? 1 : 0);
  }
}

function makeFrame(seed: number): Uint8Array {
  const bytes = new Uint8Array(FRAME_SIZE);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (index * 31 + seed * 17) & 0xff;
  }
  return bytes;
}

function makeSession(
  presenter: FramePresenter,
  requests: number[] = [],
  options: Partial<NativeFrameSessionOptions> = {},
): NativeFrameSession {
  return new NativeFrameSession(locator, {
    baseUrl: "https://example.test/next/api",
    token: "test-token",
    presenter,
    mode: "p2",
    cacheScope: CACHE_SCOPE,
    loadMetadata: async () => ({
      context,
      sourceTransferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
    }),
    loadFrame: async (request: NativeFrameRequest): Promise<NativeFramePayload> => {
      requests.push(request.frameNumber);
      return {
        representation: "native-frame-v1",
        frameNumber: request.frameNumber,
        transferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
        bytes: makeFrame(request.frameNumber),
      };
    },
    now: () => 0,
    ...options,
  });
}

function capture(
  session: NativeFrameSession,
  previous: NativeFrameResidencyState | null,
  cursor: { value: number },
): NativeFrameResidencyState {
  const snapshot = session.metrics();
  const batch = session.residencyEventsSince(cursor.value);
  cursor.value = batch.latestSequence;
  return reduceNativeFrameResidency(previous, snapshot, batch);
}

function tile(view: ReturnType<typeof buildNativeFrameResidencyView>, frame: number) {
  const found = view.tiles.find((item) => item.frameNumber === frame);
  assert.ok(found);
  return found;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("real cache insert and eviction drive grey to blue and blue to grey", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeSession(presenter, requests);
  const cursor = { value: 0 };
  let state = capture(session, null, cursor);

  await session.open();
  state = capture(session, state, cursor);
  assert.deepEqual(state.frames, []);

  await session.selectFrame(1);
  state = capture(session, state, cursor);
  let view = buildNativeFrameResidencyView(state, 8);
  assert.equal(tile(view, 1).residency, "ram");
  assert.equal(tile(view, 1).nativeRam, true);

  await session.selectFrame(8);
  state = capture(session, state, cursor);
  view = buildNativeFrameResidencyView(state, 8);
  assert.equal(tile(view, 1).residency, "absent");
  assert.equal(tile(view, 8).residency, "ram");
  assert.deepEqual(requests, [1, 8]);

  session.close();
});

test("requested and displayed markers remain truthful during deferred presentation", async () => {
  const presenter = new DeferredPresenter();
  const session = makeSession(presenter);
  const cursor = { value: 0 };
  let state = capture(session, null, cursor);

  await session.open();
  const first = session.selectFrame(1);
  await flush();
  presenter.settlePending();
  await first;
  state = capture(session, state, cursor);

  const second = session.selectFrame(2);
  await flush();
  const pendingSnapshot = session.metrics();
  const pendingBatch = session.residencyEventsSince(cursor.value);
  state = reduceNativeFrameResidency(state, pendingSnapshot, pendingBatch);
  let view = buildNativeFrameResidencyView(state, 8);
  assert.equal(pendingSnapshot.requestedFrame, 2);
  assert.equal(pendingSnapshot.displayedFrame, 1);
  assert.equal(pendingSnapshot.pendingFrame, 2);
  assert.equal(tile(view, 1).displayed, true);
  assert.equal(tile(view, 1).pending, false);
  assert.equal(tile(view, 2).requested, true);
  assert.equal(tile(view, 2).pending, true);
  assert.equal(tile(view, 2).displayed, false);

  presenter.settlePending();
  await second;
  state = capture(session, state, cursor);
  view = buildNativeFrameResidencyView(state, 8);
  assert.equal(view.displayedFrame, 2);
  assert.equal(tile(view, 2).displayed, true);

  session.close();
});

test("window highlighting does not fabricate residency", async () => {
  const presenter = new TestPresenter();
  const session = makeSession(presenter);
  const cursor = { value: 0 };
  let state = capture(session, null, cursor);
  await session.open();
  await session.selectFrame(1);
  state = capture(session, state, cursor);
  const view = buildNativeFrameResidencyView(state, 8);

  assert.equal(tile(view, 1).inWindow, true);
  assert.equal(tile(view, 1).nativeRam, true);
  assert.equal(tile(view, 2).inWindow, true);
  assert.equal(tile(view, 2).nativeRam, false);
  assert.equal(tile(view, 2).residency, "absent");
  assert.equal(tile(view, 4).inWindow, false);

  session.close();
});

test("clear and mode reset resynchronise from authoritative empty snapshots", async () => {
  const presenter = new TestPresenter();
  const session = makeSession(presenter);
  const cursor = { value: 0 };
  let state = capture(session, null, cursor);
  await session.open();
  await session.selectFrame(1);
  state = capture(session, state, cursor);
  assert.deepEqual(state.frames, [1]);

  session.clearRam();
  state = capture(session, state, cursor);
  assert.deepEqual(state.frames, []);
  assert.equal(session.metrics().cache?.entryCount, 0);

  session.setMode("p1");
  state = capture(session, state, cursor);
  assert.equal(state.cacheId, null);
  assert.deepEqual(state.frames, []);
  assert.equal(session.metrics().cache, null);

  session.setMode("p2");
  state = capture(session, state, cursor);
  assert.equal(state.cacheId, session.metrics().cache?.cacheId ?? null);
  assert.deepEqual(state.frames, []);

  session.close();
});

test("events from a replaced cache instance cannot alter the new cache", async () => {
  const presenter = new TestPresenter();
  const session = makeSession(presenter);
  const cursor = { value: 0 };
  let state = capture(session, null, cursor);
  await session.open();
  await session.selectFrame(1);
  state = capture(session, state, cursor);
  const oldCacheId = state.cacheId;
  assert.ok(oldCacheId);

  session.setMode("p1");
  session.setMode("p2");
  const snapshot = session.metrics();
  const staleBatch: NativeFrameResidencyEventBatch = {
    cacheId: oldCacheId,
    events: Object.freeze([
      Object.freeze({
        sequence: 1,
        revision: 1,
        type: "insert" as const,
        frameNumber: 1,
        nativeBytes: FRAME_SIZE,
      }),
    ]),
    afterSequence: 0,
    oldestRetainedSequence: 1,
    latestSequence: 1,
    droppedForCursor: 0,
    droppedEventCount: 0,
    resynchronize: false,
  };
  const next = reduceNativeFrameResidency(state, snapshot, staleBatch);
  assert.equal(next.cacheId, snapshot.cache?.cacheId ?? null);
  assert.notEqual(next.cacheId, oldCacheId);
  assert.deepEqual(next.frames, []);

  session.close();
});

test("event-history overflow resynchronises from the cache snapshot", async () => {
  const presenter = new TestPresenter();
  const session = makeSession(presenter, [], {
    cacheLimits: {
      maxTotalNativeBytes: 32 * 1024,
      maxEntryNativeBytes: 8 * 1024,
      maxEntries: 5,
      maxEventCount: 2,
    },
  });
  await session.open();
  await session.selectFrame(1);
  await session.selectFrame(2);
  await session.selectFrame(3);

  const batch = session.residencyEventsSince(0);
  assert.equal(batch.resynchronize, true);
  const state = reduceNativeFrameResidency(null, session.metrics(), batch);
  const view = buildNativeFrameResidencyView(state, 8);
  assert.deepEqual(state.frames, [2, 3]);
  assert.equal(tile(view, 2).nativeRam, true);
  assert.equal(tile(view, 3).nativeRam, true);
  assert.equal(view.resynchronized, true);

  session.close();
});

test("late eviction updates residency without changing newer operation markers", async () => {
  const presenter = new DeferredPresenter();
  const session = makeSession(presenter);
  const cursor = { value: 0 };
  let state = capture(session, null, cursor);
  await session.open();

  const first = session.selectFrame(1);
  await flush();
  presenter.settlePending();
  await first;

  const second = session.selectFrame(2);
  await flush();
  const snapshot: NativeFrameSessionMetrics = session.metrics();
  const initialBatch = session.residencyEventsSince(cursor.value);
  state = reduceNativeFrameResidency(state, snapshot, initialBatch);
  const cache = snapshot.cache;
  assert.ok(cache);

  const batch: NativeFrameResidencyEventBatch = {
    cacheId: cache.cacheId,
    events: Object.freeze([
      Object.freeze({
        sequence: state.eventCursor + 1,
        revision: cache.revision + 1,
        type: "evict" as const,
        frameNumber: 1,
        nativeBytes: FRAME_SIZE,
      }),
    ]),
    afterSequence: state.eventCursor,
    oldestRetainedSequence: 1,
    latestSequence: state.eventCursor + 1,
    droppedForCursor: 0,
    droppedEventCount: 0,
    resynchronize: false,
  };
  const after = reduceNativeFrameResidency(state, snapshot, batch);
  const view = buildNativeFrameResidencyView(after, 8);
  assert.deepEqual(after.frames, [2]);
  assert.equal(tile(view, 1).nativeRam, false);
  assert.equal(view.requestedFrame, 2);
  assert.equal(view.displayedFrame, 1);
  assert.equal(view.pendingFrame, 2);

  presenter.settlePending();
  await second;
  session.close();
});

test("subscription updates on session changes and unsubscribes cleanly", async () => {
  const presenter = new TestPresenter();
  const session = makeSession(presenter);
  const updates: NativeFrameResidencyUpdate[] = [];
  await session.open();
  const unsubscribe = session.subscribeResidency((update) => updates.push(update));
  const initialCount = updates.length;
  assert.ok(initialCount >= 1);

  await session.selectFrame(1);
  assert.ok(updates.length > initialCount);
  assert.equal(session.metrics().cache?.entryCount, 1);

  const beforeUnsubscribe = updates.length;
  unsubscribe();
  await session.selectFrame(2);
  assert.equal(updates.length, beforeUnsubscribe);

  session.close();
});

test("bounded range shows eight frames and limits larger instances without fetching", () => {
  const eight = computeNativeFrameResidencyRange(8, 4);
  assert.equal(eight.startFrame, 1);
  assert.equal(eight.endFrame, 8);
  assert.equal(eight.totalFrames, 8);

  const large = computeNativeFrameResidencyRange(100, 50);
  assert.equal(large.startFrame, 38);
  assert.equal(large.endFrame, 61);
  assert.equal(large.totalFrames, 100);
  assert.equal(large.endFrame - large.startFrame + 1, 24);

  const shifted = computeNativeFrameResidencyRange(100, 50, 24, 60);
  assert.equal(shifted.startFrame, 60);
  assert.equal(shifted.endFrame, 83);
});

test("OPFS/BOTH stay disabled and labels carry status without colour", async () => {
  const presenter = new TestPresenter();
  const session = makeSession(presenter);
  const cursor = { value: 0 };
  let state = capture(session, null, cursor);
  await session.open();
  await session.selectFrame(1);
  state = capture(session, state, cursor);
  const view = buildNativeFrameResidencyView(state, 8);

  for (const frame of view.tiles) {
    assert.equal(frame.opfs, false);
    assert.equal(frame.opfsStatus, NATIVE_FRAME_OPFS_STATUS);
    assert.notEqual(frame.residency, "opfs");
    assert.notEqual(frame.residency, "both");
    assert.ok(frame.labels.length > 0);
  }
  assert.equal(view.opfsStatus, "disabled");
  assert.equal(view.decodedState, NATIVE_FRAME_RESIDENCY_DECODED_STATE);
  assert.equal(view.legend.find((item) => item.key === "opfs")?.disabled, true);
  assert.equal(view.legend.find((item) => item.key === "both")?.disabled, true);
  assert.equal(tile(view, 1).labels.includes("Requested"), true);
  assert.equal(tile(view, 1).labels.includes("Displayed"), true);
  assert.equal(tile(view, 1).labels.includes("Window"), true);

  session.close();
});

test("trace 1,2,1,3,4 shows a hit then deterministic removals", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeSession(presenter, requests);
  const cursor = { value: 0 };
  let state = capture(session, null, cursor);
  await session.open();

  const trace = [1, 2, 1, 3, 4];
  const results = [];
  for (const frame of trace) {
    results.push(await session.selectFrame(frame));
    state = capture(session, state, cursor);
  }

  const view = buildNativeFrameResidencyView(state, 8);
  assert.deepEqual(requests, [1, 2, 3, 4]);
  const presented = results.filter(
    (result): result is Extract<typeof result, { status: "presented" }> =>
      result.status === "presented",
  );
  assert.equal(presented.length, 5);
  assert.equal(presented[2].source, "ram");
  assert.equal(presented[2].nativeCache, "hit");
  assert.equal(session.metrics().cache?.hits, 1);
  assert.equal(session.metrics().cache?.misses, 4);
  assert.equal(view.removals, 2);
  assert.equal(view.invalidations, 2);
  assert.deepEqual(state.frames, [3, 4]);
  assert.equal(tile(view, 1).nativeRam, false);
  assert.equal(tile(view, 2).nativeRam, false);
  assert.equal(tile(view, 3).nativeRam, true);
  assert.equal(tile(view, 4).nativeRam, true);

  session.close();
});

test("residency view contains only safe scalars and labels", async () => {
  const presenter = new TestPresenter();
  const session = makeSession(presenter);
  const cursor = { value: 0 };
  let state = capture(session, null, cursor);
  await session.open();
  await session.selectFrame(1);
  state = capture(session, state, cursor);
  const view = buildNativeFrameResidencyView(state, 8);
  const text = JSON.stringify(view);

  assert.equal(text.includes(STUDY), false);
  assert.equal(text.includes(SERIES), false);
  assert.equal(text.includes(INSTANCE), false);
  assert.equal(text.includes("test-token"), false);
  assert.equal(text.includes("principal"), false);
  assert.equal(text.includes("payload"), false);

  session.close();
});
