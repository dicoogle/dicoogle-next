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
  type NativeFrameSessionOptions,
} from "../src/services/nativeFrameSession";
import { calculateNativeFramePrefetchTarget } from "../src/services/nativeFramePrefetch";
import {
  buildNativeFrameResidencyView,
  reduceNativeFrameResidency,
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
  principalId: "synthetic-principal-prefetch",
  sessionId: "viewer-session-prefetch",
};

const locator: NativeFrameLocator = {
  studyInstanceUID: STUDY,
  seriesInstanceUID: SERIES,
  sopInstanceUID: INSTANCE,
};

function makeContext(numberOfFrames = 8): NativeFrameContext {
  return {
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
    numberOfFrames,
    frameSizeBytes: FRAME_SIZE,
  };
}

class TestPresenter implements FramePresenter {
  visibleRequestId: number | null = null;
  calls = 0;
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
    this.calls += 1;
    this.visibleRequestId = requestId;
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

function makeFrame(seed: number): Uint8Array {
  const bytes = new Uint8Array(FRAME_SIZE);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (index * 31 + seed * 17) & 0xff;
  }
  return bytes;
}

function payload(frameNumber: number): NativeFramePayload {
  return {
    representation: "native-frame-v1",
    frameNumber,
    transferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
    bytes: makeFrame(frameNumber),
  };
}

function makeSession(
  presenter: FramePresenter,
  options: Partial<NativeFrameSessionOptions> = {},
  targetContext: NativeFrameContext = makeContext(),
): NativeFrameSession {
  return new NativeFrameSession(locator, {
    baseUrl: "https://example.test/next/api",
    token: "test-token",
    presenter,
    mode: "p2",
    cacheScope: CACHE_SCOPE,
    loadMetadata: async () => ({
      context: targetContext,
      sourceTransferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
    }),
    loadFrame: async (request: NativeFrameRequest) => payload(request.frameNumber),
    now: () => 0,
    ...options,
  });
}

function countingLoader(requests: number[]) {
  return async (request: NativeFrameRequest): Promise<NativeFramePayload> => {
    requests.push(request.frameNumber);
    return payload(request.frameNumber);
  };
}

interface DeferredRequest {
  resolve: (value: NativeFramePayload) => void;
  reject: (error: unknown) => void;
}

function selectiveDeferredLoader(requests: number[], deferredFrames: Set<number>) {
  const pending = new Map<number, DeferredRequest>();
  return {
    loadFrame: (request: NativeFrameRequest): Promise<NativeFramePayload> => {
      requests.push(request.frameNumber);
      if (!deferredFrames.has(request.frameNumber)) {
        return Promise.resolve(payload(request.frameNumber));
      }
      return new Promise<NativeFramePayload>((resolve, reject) => {
        pending.set(request.frameNumber, { resolve, reject });
      });
    },
    resolve(frameNumber: number): void {
      const request = pending.get(frameNumber);
      assert.ok(request);
      pending.delete(frameNumber);
      request.resolve(payload(frameNumber));
    },
    unsettledCount(): number {
      return pending.size;
    },
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitFor(
  predicate: () => boolean,
  message: string,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await flush();
  }
  assert.ok(predicate(), message);
}

test("the frozen prefetch rule handles direction, boundaries, and window membership", () => {
  assert.deepEqual(calculateNativeFramePrefetchTarget(2, 1, 8, 1, 3), {
    direction: 1,
    targetFrame: 3,
  });
  assert.deepEqual(calculateNativeFramePrefetchTarget(7, 8, 8, 6, 8), {
    direction: -1,
    targetFrame: 6,
  });
  assert.equal(calculateNativeFramePrefetchTarget(1, 2, 8, 1, 2), null);
  assert.equal(calculateNativeFramePrefetchTarget(8, 7, 8, 7, 8), null);
  assert.equal(calculateNativeFramePrefetchTarget(3, 3, 8, 2, 4), null);
  assert.equal(calculateNativeFramePrefetchTarget(2, 1, 8, 1, 2), null);
});

test("off trace 1,2,3,4 makes only demand calls", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeSession(
    presenter,
    { loadFrame: countingLoader(requests) },
    makeContext(4),
  );
  await session.open();
  for (const frame of [1, 2, 3, 4]) {
    assert.equal((await session.selectFrame(frame)).status, "presented");
  }
  const metrics = session.metrics();
  assert.deepEqual(requests, [1, 2, 3, 4]);
  assert.equal(metrics.prefetch.enabled, false);
  assert.equal(metrics.prefetch.networkRequests, 0);
  assert.equal(metrics.prefetch.pendingFrames.length, 0);
  assert.equal(metrics.demandFrameBodyRequests, 4);
  assert.equal(metrics.prefetchFrameBodyRequests, 0);
  session.close();
});

test("on trace 1,2,3,4 completes prefetch hits without trailing work", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeSession(
    presenter,
    { prefetchEnabled: true, loadFrame: countingLoader(requests) },
    makeContext(4),
  );
  await session.open();
  await session.selectFrame(1);
  await session.selectFrame(2);
  await waitFor(
    () => session.metrics().prefetch.inFlightFrames === 0,
    "prefetch 3 should complete",
  );
  const third = await session.selectFrame(3);
  await waitFor(
    () => session.metrics().prefetch.inFlightFrames === 0,
    "prefetch 4 should complete",
  );
  const fourth = await session.selectFrame(4);
  assert.equal(third.status, "presented");
  assert.equal(fourth.status, "presented");
  if (third.status !== "presented" || fourth.status !== "presented") {
    throw new Error("expected presented");
  }
  assert.equal(third.source, "ram");
  assert.equal(fourth.source, "ram");
  const metrics = session.metrics();
  assert.deepEqual(requests, [1, 2, 3, 4]);
  assert.equal(metrics.demandFrameBodyRequests, 2);
  assert.equal(metrics.prefetchFrameBodyRequests, 2);
  assert.equal(metrics.frameBodyRequests, 4);
  assert.equal(metrics.prefetch.usefulCompletedHits, 2);
  assert.equal(metrics.prefetch.usefulJoins, 0);
  assert.equal(metrics.prefetch.usefulRequests, 2);
  assert.equal(presenter.calls, 4);
  assert.deepEqual(metrics.cache?.frames, [3, 4]);
  assert.equal(metrics.cache?.retainedNativeBytes, 2 * FRAME_SIZE);
  session.close();
});

test("reverse direction targets the previous frame", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeSession(
    presenter,
    { prefetchEnabled: true, loadFrame: countingLoader(requests) },
    makeContext(4),
  );
  await session.open();
  await session.selectFrame(4);
  await session.selectFrame(3);
  await waitFor(
    () => session.metrics().prefetch.inFlightFrames === 0,
    "prefetch 2 should complete",
  );
  const result = await session.selectFrame(2);
  assert.equal(result.status, "presented");
  assert.deepEqual(requests.slice(0, 3), [4, 3, 2]);
  assert.equal(session.metrics().prefetch.usefulCompletedHits, 1);
  session.setPrefetchEnabled(false);
  await flush();
  session.close();
});

test("rapid jump cancels obsolete prefetch and rejects its late admission", async () => {
  const requests: number[] = [];
  const frames = selectiveDeferredLoader(requests, new Set([3, 8]));
  const presenter = new TestPresenter();
  const session = makeSession(presenter, {
    prefetchEnabled: true,
    loadFrame: frames.loadFrame,
  });
  await session.open();
  await session.selectFrame(1);
  await session.selectFrame(2);
  await waitFor(
    () => session.metrics().prefetch.inFlightFrames === 1,
    "prefetch 3 should start",
  );
  assert.equal(session.metrics().prefetch.pendingFrames.includes(3), true);
  await session.selectFrame(7);
  session.setPrefetchEnabled(false);
  frames.resolve(3);
  await flush();
  assert.equal(session.metrics().cache?.frames.includes(3), false);
  assert.equal(session.metrics().prefetch.cancelledRequests >= 1, true);
  assert.equal(session.metrics().prefetch.inFlightFrames, 0);
  assert.equal(session.metrics().prefetch.inFlightExpectedBytes, 0);
  assert.equal(session.metrics().prefetch.pendingFrames.length, 0);
  session.close();
});

test("cancelled speculation keeps one retiring reservation until the loader settles", async () => {
  const requests: number[] = [];
  const frames = selectiveDeferredLoader(requests, new Set([3]));
  const presenter = new TestPresenter();
  const session = makeSession(presenter, {
    prefetchEnabled: true,
    loadFrame: frames.loadFrame,
  });
  await session.open();
  await session.selectFrame(1);
  await session.selectFrame(2);
  await waitFor(
    () => session.metrics().prefetch.inFlightFrames === 1,
    "prefetch 3 should start",
  );
  assert.equal(frames.unsettledCount(), 1);

  const demand4 = await session.selectFrame(4);
  const demand6 = await session.selectFrame(6);
  assert.equal(demand4.status, "presented");
  assert.equal(demand6.status, "presented");
  let metrics = session.metrics();
  assert.equal(frames.unsettledCount(), 1);
  assert.equal(metrics.prefetch.networkRequests, 1);
  assert.equal(metrics.prefetch.inFlightFrames, 0);
  assert.equal(metrics.prefetch.inFlightExpectedBytes, 0);
  assert.equal(metrics.prefetch.retiringFrames, 1);
  assert.equal(metrics.prefetch.retiringExpectedBytes, FRAME_SIZE);
  assert.equal(metrics.cache?.frames.includes(3), false);
  assert.equal(presenter.calls, 4);

  frames.resolve(3);
  await waitFor(
    () => session.metrics().prefetch.retiringFrames === 0,
    "retiring prefetch should settle",
  );
  metrics = session.metrics();
  assert.equal(frames.unsettledCount(), 0);
  assert.equal(metrics.prefetch.retiringExpectedBytes, 0);
  assert.equal(metrics.cache?.frames.includes(3), false);
  assert.equal(metrics.prefetch.cancelledRequests, 1);
  session.setPrefetchEnabled(false);
  session.close();
});

test("in-flight demand join is distinct from a completed-prefetch hit", async () => {
  const requests: number[] = [];
  const frames = selectiveDeferredLoader(requests, new Set([3]));
  const presenter = new TestPresenter();
  const session = makeSession(
    presenter,
    { prefetchEnabled: true, loadFrame: frames.loadFrame },
    makeContext(4),
  );
  await session.open();
  await session.selectFrame(1);
  await session.selectFrame(2);
  await waitFor(
    () => session.metrics().prefetch.inFlightFrames === 1,
    "prefetch 3 should start",
  );
  const joinedSelection = session.selectFrame(3);
  session.setPrefetchEnabled(false);
  frames.resolve(3);
  const joined = await joinedSelection;
  assert.equal(joined.status, "presented");
  if (joined.status !== "presented") {
    throw new Error("expected presented");
  }
  assert.equal(joined.source, "network");
  const metrics = session.metrics();
  assert.equal(metrics.prefetch.demandJoins, 1);
  assert.equal(metrics.prefetch.usefulJoins, 1);
  assert.equal(metrics.prefetch.usefulCompletedHits, 0);
  assert.equal(metrics.prefetch.usefulRequests, 1);
  assert.equal(metrics.prefetch.residentFrames.length, 0);
  assert.deepEqual(metrics.cache?.frames, [2, 3]);
  assert.equal(metrics.demandFrameBodyRequests, 2);
  assert.equal(metrics.prefetchFrameBodyRequests, 1);
  assert.equal(metrics.frameBodyRequests, 3);
  assert.equal(metrics.prefetch.inFlightFrames, 0);
  assert.equal(metrics.prefetch.inFlightExpectedBytes, 0);
  session.close();
});

test("prefetch never displays a neighbour or increments presenter calls", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeSession(
    presenter,
    { prefetchEnabled: true, loadFrame: countingLoader(requests) },
    makeContext(4),
  );
  await session.open();
  await session.selectFrame(1);
  await session.selectFrame(2);
  await waitFor(
    () => session.metrics().prefetch.inFlightFrames === 0,
    "prefetch 3 should complete",
  );
  assert.equal(presenter.calls, 2);
  assert.equal(session.metrics().displayedFrame, 2);
  assert.equal(session.metrics().cache?.frames.includes(3), true);
  session.setPrefetchEnabled(false);
  await flush();
  session.close();
});

test("close cancels in-flight prefetch and does not admit after close", async () => {
  const requests: number[] = [];
  const frames = selectiveDeferredLoader(requests, new Set([3]));
  const presenter = new TestPresenter();
  const session = makeSession(presenter, {
    prefetchEnabled: true,
    loadFrame: frames.loadFrame,
  });
  await session.open();
  await session.selectFrame(1);
  await session.selectFrame(2);
  await waitFor(
    () => session.metrics().prefetch.inFlightFrames === 1,
    "prefetch 3 should start",
  );
  session.close();
  frames.resolve(3);
  await flush();
  assert.equal(session.metrics().cache, null);
  assert.equal(presenter.closed, true);
  assert.equal(session.metrics().prefetch.pendingFrames.length, 0);
  assert.equal(session.metrics().prefetch.inFlightExpectedBytes, 0);
});

test("in-flight byte budget and oversize target are skipped", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeSession(
    presenter,
    {
      prefetchEnabled: true,
      prefetchMaxInFlightBytes: 4096,
      loadFrame: countingLoader(requests),
    },
    makeContext(4),
  );
  await session.open();
  await session.selectFrame(1);
  await session.selectFrame(2);
  await flush();
  const metrics = session.metrics();
  assert.equal(metrics.prefetch.budgetSkipped, 1);
  assert.equal(metrics.prefetch.networkRequests, 0);
  assert.deepEqual(requests, [1, 2]);
  session.close();
});

test("useful, unused, and completed-prefetch counters are separate", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeSession(presenter, {
    prefetchEnabled: true,
    loadFrame: countingLoader(requests),
  });
  await session.open();
  await session.selectFrame(1);
  await session.selectFrame(2);
  await waitFor(
    () => session.metrics().prefetch.inFlightFrames === 0,
    "prefetch 3 should complete",
  );
  await session.selectFrame(8);
  await flush();
  const metrics = session.metrics();
  assert.equal(metrics.prefetch.unusedRequests, 1);
  assert.equal(metrics.prefetch.unusedNativeBytes, FRAME_SIZE);
  assert.equal(metrics.prefetch.usefulCompletedHits, 0);
  session.setPrefetchEnabled(false);
  await flush();
  session.close();
});

test("strip distinguishes prefetch pending, prefetch resident, and demand hit", async () => {
  const requests: number[] = [];
  const frames = selectiveDeferredLoader(requests, new Set([3]));
  const presenter = new TestPresenter();
  const session = makeSession(
    presenter,
    { prefetchEnabled: true, loadFrame: frames.loadFrame },
    makeContext(4),
  );
  await session.open();
  await session.selectFrame(1);
  await session.selectFrame(2);
  await waitFor(
    () => session.metrics().prefetch.inFlightFrames === 1,
    "prefetch 3 should start",
  );
  let state = reduceNativeFrameResidency(
    null,
    session.metrics(),
    session.residencyEventsSince(0),
  );
  let view = buildNativeFrameResidencyView(state, 4);
  const pending = view.tiles.find((tile) => tile.frameNumber === 3);
  assert.ok(pending);
  assert.equal(pending.prefetchPending, true);
  assert.equal(pending.nativeRam, false);
  assert.equal(pending.inWindow, true);

  frames.resolve(3);
  await flush();
  state = reduceNativeFrameResidency(
    null,
    session.metrics(),
    session.residencyEventsSince(0),
  );
  view = buildNativeFrameResidencyView(state, 4);
  const resident = view.tiles.find((tile) => tile.frameNumber === 3);
  assert.ok(resident);
  assert.equal(resident.prefetchResident, true);
  assert.equal(resident.nativeRam, true);

  session.setPrefetchEnabled(false);
  await session.selectFrame(3);
  state = reduceNativeFrameResidency(
    null,
    session.metrics(),
    session.residencyEventsSince(0),
  );
  view = buildNativeFrameResidencyView(state, 4);
  const hit = view.tiles.find((tile) => tile.frameNumber === 3);
  assert.ok(hit);
  assert.equal(hit.prefetchResident, false);
  assert.equal(hit.nativeRam, true);
  session.close();
});

test("oversize prefetch target is skipped without starving demand", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeSession(
    presenter,
    {
      prefetchEnabled: true,
      loadFrame: countingLoader(requests),
      cacheLimits: {
        maxTotalNativeBytes: 32 * 1024,
        maxEntryNativeBytes: 4096,
        maxEntries: 5,
        maxEventCount: 64,
      },
    },
    makeContext(4),
  );
  await session.open();
  await session.selectFrame(1);
  await session.selectFrame(2);
  await flush();
  const metrics = session.metrics();
  assert.equal(metrics.prefetch.oversizeSkipped, 1);
  assert.equal(metrics.prefetch.networkRequests, 0);
  assert.deepEqual(requests, [1, 2]);
  session.close();
});

test("P1 ignores prefetch and never creates speculative work", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeSession(
    presenter,
    {
      mode: "p1",
      prefetchEnabled: true,
      loadFrame: countingLoader(requests),
    },
    makeContext(4),
  );
  await session.open();
  await session.selectFrame(1);
  await session.selectFrame(2);
  await flush();
  const metrics = session.metrics();
  assert.deepEqual(requests, [1, 2]);
  assert.equal(metrics.prefetch.enabled, false);
  assert.equal(metrics.prefetch.networkRequests, 0);
  assert.equal(metrics.prefetch.pendingFrames.length, 0);
  assert.equal(metrics.cache, null);
  session.close();
});
