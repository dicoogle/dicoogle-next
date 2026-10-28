import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MULTIFRAME_GRAYSCALE_WORD_SC_SOP_CLASS_UID,
  NATIVE_FRAME_TRANSFER_SYNTAX_UID,
  NativeFrameError,
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
import {
  resolveNativeFrameOwnership,
} from "../src/services/nativeFrameOwnership";
import {
  SYNTHETIC_FIXTURE_INSTANCE_A_UID,
  SYNTHETIC_FIXTURE_INSTANCE_B_1_UID,
  SYNTHETIC_FIXTURE_SERIES_A_UID,
  SYNTHETIC_FIXTURE_SERIES_B_UID,
  SYNTHETIC_FIXTURE_STUDY_UID,
} from "../src/services/nativeFrameFixture";

const STUDY = SYNTHETIC_FIXTURE_STUDY_UID;
const SERIES = SYNTHETIC_FIXTURE_SERIES_A_UID;
const INSTANCE = SYNTHETIC_FIXTURE_INSTANCE_A_UID;
const SERIES_B = SYNTHETIC_FIXTURE_SERIES_B_UID;
const INSTANCE_B = SYNTHETIC_FIXTURE_INSTANCE_B_1_UID;
const FRAME_SIZE = 8192;
const CACHE_SCOPE_A = {
  principalId: "synthetic-principal-a",
  sessionId: "viewer-session-a",
};
const CACHE_SCOPE_B = {
  principalId: "synthetic-principal-b",
  sessionId: "viewer-session-b",
};

const locator: NativeFrameLocator = {
  studyInstanceUID: STUDY,
  seriesInstanceUID: SERIES,
  sopInstanceUID: INSTANCE,
};
const locatorB: NativeFrameLocator = {
  studyInstanceUID: STUDY,
  seriesInstanceUID: SERIES_B,
  sopInstanceUID: INSTANCE_B,
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
const contextB: NativeFrameContext = {
  ...context,
  numberOfFrames: 1,
};

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

class DeferredPresenter implements FramePresenter {
  visibleRequestId: number | null = null;
  closed = false;
  calls = 0;
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
    this.calls += 1;
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
  options: Partial<NativeFrameSessionOptions> = {},
  targetLocator: NativeFrameLocator = locator,
  targetContext: NativeFrameContext = context,
): NativeFrameSession {
  return new NativeFrameSession(targetLocator, {
    baseUrl: "https://example.test/next/api",
    token: "test-token",
    presenter,
    mode: "p2",
    cacheScope: CACHE_SCOPE_A,
    loadMetadata: async () => ({
      context: targetContext,
      sourceTransferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
    }),
    loadFrame: async (request: NativeFrameRequest): Promise<NativeFramePayload> => ({
      representation: "native-frame-v1",
      frameNumber: request.frameNumber,
      transferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
      bytes: makeFrame(request.frameNumber),
    }),
    now: () => 0,
    ...options,
  });
}

function deferredMetadata() {
  let resolve!: (value: {
    context: NativeFrameContext;
    sourceTransferSyntaxUID: string;
  }) => void;
  let reject!: (error: unknown) => void;
  return {
    loadMetadata: () =>
      new Promise<{
        context: NativeFrameContext;
        sourceTransferSyntaxUID: string;
      }>((done, fail) => {
        resolve = done;
        reject = fail;
      }),
    resolve: () =>
      resolve({
        context,
        sourceTransferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
      }),
    reject,
  };
}

interface DeferredFrame {
  resolve: (payload: NativeFramePayload) => void;
  reject: (error: unknown) => void;
}

function deferredFrames(requests: number[]) {
  const pending = new Map<number, DeferredFrame>();
  return {
    loadFrame: (request: NativeFrameRequest): Promise<NativeFramePayload> => {
      requests.push(request.frameNumber);
      return new Promise<NativeFramePayload>((resolve, reject) => {
        pending.set(request.frameNumber, { resolve, reject });
      });
    },
    resolve(frameNumber: number): void {
      const pendingFrame = pending.get(frameNumber);
      assert.ok(pendingFrame);
      pending.delete(frameNumber);
      pendingFrame.resolve({
        representation: "native-frame-v1",
        frameNumber,
        transferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
        bytes: makeFrame(frameNumber),
      });
    },
  };
}

function countingLoader(requests: number[]) {
  return async (request: NativeFrameRequest): Promise<NativeFramePayload> => {
    requests.push(request.frameNumber);
    return {
      representation: "native-frame-v1",
      frameNumber: request.frameNumber,
      transferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
      bytes: makeFrame(request.frameNumber),
    };
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("ownership decision rejects unauthenticated state and distinguishes same-principal re-login", () => {
  const first = { user: "alice", admin: false };
  const second = { user: "alice", admin: false };
  const different = { user: "bob", admin: false };
  const firstOwner = resolveNativeFrameOwnership(first, true);
  const firstAgain = resolveNativeFrameOwnership(first, true);
  const secondOwner = resolveNativeFrameOwnership(second, true);
  const differentOwner = resolveNativeFrameOwnership(different, true);

  assert.ok(firstOwner);
  assert.ok(secondOwner);
  assert.ok(differentOwner);
  assert.equal(firstOwner.ownerId, firstAgain?.ownerId);
  assert.notEqual(firstOwner.ownerId, secondOwner.ownerId);
  assert.equal(firstOwner.principalId, secondOwner.principalId);
  assert.notEqual(firstOwner.principalId, differentOwner.principalId);
  assert.equal(resolveNativeFrameOwnership(first, false), null);
  assert.equal(resolveNativeFrameOwnership(null, true), null);
});

test("close while metadata is delayed rejects the session without frames or cache", async () => {
  const metadata = deferredMetadata();
  const presenter = new TestPresenter();
  const session = makeSession(presenter, { loadMetadata: metadata.loadMetadata });
  const opening = session.open();
  await flush();
  session.close();
  metadata.resolve();

  await assert.rejects(
    opening,
    (error: unknown) =>
      error instanceof NativeFrameError && error.code === "invalid-request",
  );
  assert.equal(presenter.closed, true);
  assert.equal(session.metrics().cache, null);
  assert.equal(session.metrics().frameBodyRequests, 0);
});

test("mode switch during delayed metadata retains context without stale visual work", async () => {
  const metadata = deferredMetadata();
  const presenter = new TestPresenter();
  const session = makeSession(presenter, { loadMetadata: metadata.loadMetadata });
  const opening = session.open();
  await flush();
  session.setMode("p1");
  metadata.resolve();

  const loaded = await opening;
  assert.equal(loaded.numberOfFrames, 8);
  const metrics = session.metrics();
  assert.equal(metrics.mode, "p1");
  assert.equal(metrics.modeEpoch, 1);
  assert.equal(metrics.metadataRequests, 1);
  assert.equal(metrics.frameBodyRequests, 0);
  assert.equal(metrics.cache, null);
  assert.equal(presenter.calls, 0);

  session.close();
});

test("close while frame retrieval is delayed rejects late admission and display", async () => {
  const requests: number[] = [];
  const frames = deferredFrames(requests);
  const presenter = new TestPresenter();
  const session = makeSession(presenter, { loadFrame: frames.loadFrame });
  await session.open();
  const selection = session.selectFrame(1);
  await flush();
  session.close();
  frames.resolve(1);

  const result = await selection;
  assert.equal(result.status, "stale");
  assert.deepEqual(requests, [1]);
  assert.equal(presenter.closed, true);
  assert.equal(presenter.calls, 0);
  assert.equal(session.metrics().cache, null);
});

test("old pending finally cannot alter newer mode counters or pending state", async () => {
  const requests: number[] = [];
  const frames = deferredFrames(requests);
  const presenter = new TestPresenter();
  const session = makeSession(presenter, { loadFrame: frames.loadFrame });
  await session.open();

  const oldSelection = session.selectFrame(1);
  await flush();
  session.setMode("p1");
  let metrics = session.metrics();
  assert.equal(metrics.mode, "p1");
  assert.equal(metrics.modeEpoch, 1);
  assert.equal(metrics.pendingFrameRequests, 0);
  assert.equal(metrics.frameBodyRequests, 0);
  assert.equal(metrics.lastSource, null);

  const newSelection = session.selectFrame(2);
  await flush();
  metrics = session.metrics();
  assert.equal(metrics.pendingFrameRequests, 1);
  assert.equal(metrics.frameBodyRequests, 1);

  frames.resolve(1);
  const oldResult = await oldSelection;
  assert.equal(oldResult.status, "stale");
  metrics = session.metrics();
  assert.equal(metrics.pendingFrameRequests, 1);
  assert.equal(metrics.frameBodyRequests, 1);
  assert.equal(metrics.lastSource, null);

  frames.resolve(2);
  const newResult = await newSelection;
  assert.equal(newResult.status, "presented");
  metrics = session.metrics();
  assert.equal(metrics.pendingFrameRequests, 0);
  assert.equal(metrics.frameBodyRequests, 1);
  assert.equal(metrics.lastSource, "network");

  session.close();
});

test("close while presentation is delayed discards hidden staging and visible commit", async () => {
  const presenter = new DeferredPresenter();
  const session = makeSession(presenter);
  await session.open();
  const selection = session.selectFrame(1);
  await flush();
  assert.equal(presenter.registrationCount(), 1);

  session.close();
  const result = await selection;
  assert.equal(result.status, "stale");
  assert.equal(presenter.closed, true);
  assert.equal(presenter.registrationCount(), 0);
  assert.equal(presenter.visibleRequestId, null);
  assert.equal(session.metrics().cache, null);
});

test("instance replacement rejects the old completion and starts a clean cache", async () => {
  const oldRequests: number[] = [];
  const oldFrames = deferredFrames(oldRequests);
  const oldPresenter = new TestPresenter();
  const oldSession = makeSession(oldPresenter, { loadFrame: oldFrames.loadFrame });
  await oldSession.open();
  const oldSelection = oldSession.selectFrame(1);
  await flush();
  oldSession.close();
  oldFrames.resolve(1);
  assert.equal((await oldSelection).status, "stale");

  const newRequests: number[] = [];
  const newPresenter = new TestPresenter();
  const newSession = makeSession(
    newPresenter,
    {
      loadFrame: countingLoader(newRequests),
      cacheScope: CACHE_SCOPE_B,
    },
    locatorB,
    contextB,
  );
  await newSession.open();
  assert.equal(newSession.metrics().cache?.entryCount, 0);
  const result = await newSession.selectFrame(1);
  assert.equal(result.status, "presented");
  assert.deepEqual(newRequests, [1]);
  assert.equal(newSession.metrics().cache?.entryCount, 1);

  oldSession.close();
  newSession.close();
});

test("principal/session replacement cannot inherit the old native cache", async () => {
  const requests: number[] = [];
  const firstPresenter = new TestPresenter();
  const firstSession = makeSession(firstPresenter, {
    loadFrame: countingLoader(requests),
  });
  await firstSession.open();
  assert.equal((await firstSession.selectFrame(1)).status, "presented");
  assert.equal(firstSession.metrics().cache?.entryCount, 1);
  firstSession.close();

  const secondPresenter = new TestPresenter();
  const secondSession = makeSession(secondPresenter, {
    loadFrame: countingLoader(requests),
    cacheScope: CACHE_SCOPE_B,
  });
  await secondSession.open();
  assert.equal(secondSession.metrics().cache?.entryCount, 0);
  assert.equal((await secondSession.selectFrame(1)).status, "presented");
  assert.deepEqual(requests, [1, 1]);
  assert.equal(secondSession.metrics().cache?.entryCount, 1);

  secondSession.close();
});

test("subscriptions do not survive close and reopen without duplication", async () => {
  const presenter = new TestPresenter();
  const session = makeSession(presenter);
  await session.open();
  const updates: string[] = [];
  const unsubscribe = session.subscribeResidency(({ snapshot }) => {
    updates.push(snapshot.mode);
  });
  await session.selectFrame(1);
  assert.ok(updates.length > 1);

  session.close();
  const afterClose = updates.length;
  assert.throws(
    () => session.subscribeResidency(() => undefined),
    (error: unknown) =>
      error instanceof NativeFrameError && error.code === "invalid-request",
  );
  assert.equal(updates.length, afterClose);

  const reopened = makeSession(new TestPresenter());
  await reopened.open();
  const reopenedUpdates: string[] = [];
  const stop = reopened.subscribeResidency(({ snapshot }) => {
    reopenedUpdates.push(snapshot.mode);
  });
  await reopened.selectFrame(1);
  assert.ok(reopenedUpdates.length > 0);
  stop();
  const beforeStop = reopenedUpdates.length;
  await reopened.selectFrame(2);
  assert.equal(reopenedUpdates.length, beforeStop);
  reopened.close();

  unsubscribe();
});

test("clear, mode switch, and close report truthful empty native state", async () => {
  const presenter = new TestPresenter();
  const session = makeSession(presenter);
  await session.open();
  assert.equal((await session.selectFrame(1)).status, "presented");
  assert.equal(session.metrics().cache?.entryCount, 1);
  assert.equal(session.metrics().displayedFrame, 1);

  session.clearRam();
  assert.equal(session.metrics().cache?.entryCount, 0);
  assert.equal(session.metrics().displayedFrame, 1);

  session.setMode("p1");
  const afterMode = session.metrics();
  assert.equal(afterMode.mode, "p1");
  assert.equal(afterMode.modeEpoch, 1);
  assert.equal(afterMode.cache, null);
  assert.equal(afterMode.acceptedSelections, 0);
  assert.equal(afterMode.frameBodyRequests, 0);
  assert.equal(afterMode.lastSource, null);
  assert.equal(afterMode.displayedFrame, 1);
  assert.equal(afterMode.pendingFrame, null);

  session.close();
  const afterClose = session.metrics();
  assert.equal(afterClose.cache, null);
  assert.equal(afterClose.displayedFrame, null);
  assert.equal(afterClose.requestedFrame, null);
});

test("P2 to P1 switch cannot serve hidden reuse on the next P1 selection", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeSession(presenter, {
    loadFrame: countingLoader(requests),
  });
  await session.open();
  assert.equal((await session.selectFrame(1)).status, "presented");
  assert.equal(requests.length, 1);

  session.setMode("p1");
  assert.equal(session.metrics().cache, null);
  assert.equal(session.metrics().modeEpoch, 1);

  const result = await session.selectFrame(1);
  assert.equal(result.status, "presented");
  if (result.status !== "presented") {
    throw new Error("expected presented");
  }
  assert.equal(result.source, "network");
  assert.equal(result.nativeCache, "not-applicable");
  assert.deepEqual(requests, [1, 1]);
  assert.equal(session.metrics().cache, null);
  assert.equal(session.metrics().frameBodyRequests, 1);

  session.close();
});
