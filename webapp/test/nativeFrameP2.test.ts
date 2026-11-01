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
  type FrameSelectionResult,
  type NativeFrameSessionOptions,
} from "../src/services/nativeFrameSession";
import {
  SYNTHETIC_FIXTURE_INSTANCE_A_UID,
  SYNTHETIC_FIXTURE_SERIES_A_UID,
  SYNTHETIC_FIXTURE_STUDY_UID,
} from "../src/services/nativeFrameFixture";

const STUDY = SYNTHETIC_FIXTURE_STUDY_UID;
const SERIES = SYNTHETIC_FIXTURE_SERIES_A_UID;
const INSTANCE = SYNTHETIC_FIXTURE_INSTANCE_A_UID;
const BOUNDARY = "native-frame-p2-test-boundary";
const FRAME_SIZE = 8192;
const CACHE_SCOPE = {
  principalId: "synthetic-principal",
  sessionId: "viewer-session-p2",
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

interface PresentCall {
  requestId: number;
  wrapped: WrappedSingleFrame;
  imageId: string;
}

class TestPresenter implements FramePresenter {
  readonly calls: PresentCall[] = [];
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
    if (this.closed || requestId !== this.latestRequestId) {
      return null;
    }
    const imageId = `image-${requestId}`;
    this.calls.push({ requestId, wrapped, imageId });
    this.visibleRequestId = requestId;
    this.maxRegistrations = Math.max(
      this.maxRegistrations,
      this.registrationCount(),
    );
    return imageId;
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
  maxRegistrations = 0;
  closed = false;
  private latestRequestId = 0;
  private pending: {
    requestId: number;
    resolve: (imageId: string | null) => void;
    promise: Promise<string | null>;
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
    let resolve!: (imageId: string | null) => void;
    const promise = new Promise<string | null>((done) => {
      resolve = done;
    });
    this.pending = { requestId, resolve, promise };
    this.maxRegistrations = Math.max(
      this.maxRegistrations,
      this.registrationCount(),
    );
    return promise;
  }

  hasPending(): boolean {
    return this.pending !== null;
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

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function makeMultipart(frameNumber: number): Uint8Array {
  return concatBytes(
    ascii(
      `--${BOUNDARY}\r\nContent-Type: application/octet-stream\r\nX-Frame-Number: ${frameNumber}\r\n\r\n`,
    ),
    makeFrame(frameNumber),
    ascii(`\r\n--${BOUNDARY}--\r\n`),
  );
}

function makeFrameResponse(frameNumber: number): Response {
  return new Response(makeMultipart(frameNumber), {
    status: 200,
    headers: {
      "Content-Type": `multipart/related; type="application/octet-stream"; boundary="${BOUNDARY}"`,
      "X-Frame-Representation": "native-frame-v1",
      "X-Frame-Transfer-Syntax": NATIVE_FRAME_TRANSFER_SYNTAX_UID,
      "X-Frame-Number-Basis": "1",
      "X-Frame-Source": "next",
      "X-Frame-Cache": "bypass",
      "Cache-Control": "no-store",
    },
  });
}

function countingFetch(requests: number[]): typeof fetch {
  return async (input) => {
    const match = String(input).match(/\/frames\/(\d+)$/);
    assert.ok(match);
    const frameNumber = Number(match[1]);
    requests.push(frameNumber);
    return makeFrameResponse(frameNumber);
  };
}

function makeSession(
  presenter: FramePresenter,
  options: Partial<NativeFrameSessionOptions> = {},
  targetLocator: NativeFrameLocator = locator,
): NativeFrameSession {
  return new NativeFrameSession(targetLocator, {
    baseUrl: "https://example.test/next/api",
    token: "test-token",
    presenter,
    loadMetadata: async () => ({
      context,
      sourceTransferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
    }),
    now: () => 0,
    ...options,
  });
}

function makeP2Session(
  presenter: FramePresenter,
  options: Partial<NativeFrameSessionOptions> = {},
): NativeFrameSession {
  return makeSession(presenter, {
    mode: "p2",
    cacheScope: CACHE_SCOPE,
    ...options,
  });
}

function expectPresented(result: FrameSelectionResult) {
  if (result.status !== "presented") {
    throw new Error(`expected presented, got ${result.status}`);
  }
  return result;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}


test("P1 sequence 1,2,1 makes three frame requests", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeSession(presenter, {
    fetchImpl: countingFetch(requests),
  });

  await session.open();
  const results = [
    await session.selectFrame(1),
    await session.selectFrame(2),
    await session.selectFrame(1),
  ];
  assert.deepEqual(requests, [1, 2, 1]);
  assert.ok(results.every((result) => expectPresented(result)));
  assert.ok(
    results.every(
      (result) =>
        expectPresented(result).source === "network" &&
        expectPresented(result).nativeCache === "not-applicable",
    ),
  );
  const metrics = session.metrics();
  assert.equal(metrics.mode, "p1");
  assert.equal(metrics.frameBodyRequests, 3);
  assert.equal(metrics.acceptedSelections, 3);
  assert.equal(metrics.metadataRequests, 1);
  assert.equal(metrics.cache, null);
  assert.equal(presenter.calls.length, 3);

  session.close();
});

test("P2 sequence 1,2,1 makes two requests and reports a RAM hit", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeP2Session(presenter, {
    fetchImpl: countingFetch(requests),
  });

  await session.open();
  const first = expectPresented(await session.selectFrame(1));
  const second = expectPresented(await session.selectFrame(2));
  const third = expectPresented(await session.selectFrame(1));

  assert.deepEqual(requests, [1, 2]);
  assert.equal(first.source, "network");
  assert.equal(first.nativeCache, "miss");
  assert.equal(second.source, "network");
  assert.equal(second.nativeCache, "miss");
  assert.equal(third.source, "ram");
  assert.equal(third.nativeCache, "hit");

  const metrics = session.metrics();
  assert.equal(metrics.mode, "p2");
  assert.equal(metrics.frameBodyRequests, 2);
  assert.equal(metrics.acceptedSelections, 3);
  assert.equal(metrics.metadataRequests, 1);
  assert.deepEqual(metrics.window, {
    startFrame: 1,
    endFrame: 2,
    behind: 1,
    ahead: 1,
    epoch: 3,
  });
  assert.equal(metrics.cache?.hits, 1);
  assert.equal(metrics.cache?.misses, 2);
  assert.equal(metrics.cache?.entryCount, 2);
  assert.deepEqual(metrics.cache?.frames, [1, 2]);
  assert.equal(metrics.cache?.retainedNativeBytes, 2 * FRAME_SIZE);

  assert.equal(presenter.calls.length, 3);
  assert.equal(presenter.maxRegistrations, 1);
  assert.deepEqual(presenter.calls[2].wrapped.bytes, presenter.calls[0].wrapped.bytes);
  assert.notEqual(presenter.calls[2].wrapped.blob, presenter.calls[0].wrapped.blob);
  assert.notEqual(presenter.calls[2].imageId, presenter.calls[0].imageId);

  session.close();
});

test("direct P2 1,8,1 makes three requests and the last is a miss", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeP2Session(presenter, {
    fetchImpl: countingFetch(requests),
  });

  await session.open();
  expectPresented(await session.selectFrame(1));
  expectPresented(await session.selectFrame(8));
  const last = expectPresented(await session.selectFrame(1));

  assert.deepEqual(requests, [1, 8, 1]);
  assert.equal(last.source, "network");
  assert.equal(last.nativeCache, "miss");
  assert.deepEqual(session.metrics().cache?.frames, [1]);
  assert.equal(session.metrics().cache?.hits, 0);
  assert.equal(session.metrics().cache?.evictions, 2);

  session.close();
});

test("sequential P2 1-8,1 makes nine requests and the revisit misses", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeP2Session(presenter, {
    fetchImpl: countingFetch(requests),
  });

  await session.open();
  for (let frame = 1; frame <= 8; frame += 1) {
    expectPresented(await session.selectFrame(frame));
  }
  const last = expectPresented(await session.selectFrame(1));

  assert.deepEqual(requests, [1, 2, 3, 4, 5, 6, 7, 8, 1]);
  assert.equal(last.source, "network");
  assert.equal(last.nativeCache, "miss");
  assert.deepEqual(session.metrics().cache?.frames, [1]);
  assert.equal(session.metrics().frameBodyRequests, 9);

  session.close();
});

test("jump/reverse navigation produces deterministic P2 residency", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeP2Session(presenter, {
    fetchImpl: countingFetch(requests),
  });

  await session.open();
  const trace = [4, 8, 2, 7, 2];
  const retained: number[][] = [];
  for (const frame of trace) {
    expectPresented(await session.selectFrame(frame));
    retained.push([...(session.metrics().cache?.frames ?? [])]);
  }

  assert.deepEqual(requests, trace);
  assert.deepEqual(retained, [[4], [8], [2], [7], [2]]);
  assert.equal(session.metrics().cache?.evictions, 4);

  session.close();
});

test("mode changes preserve metadata and reset the mode-local cache", async () => {
  let metadataRequests = 0;
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeSession(presenter, {
    fetchImpl: countingFetch(requests),
    loadMetadata: async () => {
      metadataRequests += 1;
      return {
        context,
        sourceTransferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
      };
    },
    cacheScope: CACHE_SCOPE,
  });

  await session.open();
  expectPresented(await session.selectFrame(1));
  assert.equal(session.metrics().frameBodyRequests, 1);
  assert.equal(metadataRequests, 1);

  session.setMode("p2");
  assert.equal(session.metrics().mode, "p2");
  assert.equal(session.metrics().frameBodyRequests, 0);
  assert.equal(session.metrics().acceptedSelections, 0);
  assert.equal(session.metrics().metadataRequests, 1);
  assert.equal(session.metrics().cache?.entryCount, 0);
  expectPresented(await session.selectFrame(1));
  assert.equal(session.metrics().frameBodyRequests, 1);

  session.setMode("p1");
  assert.equal(session.metrics().mode, "p1");
  assert.equal(session.metrics().cache, null);
  expectPresented(await session.selectFrame(1));
  assert.equal(session.metrics().frameBodyRequests, 1);
  assert.equal(metadataRequests, 1);

  session.close();
});

test("mode change invalidates delayed presenter work", async () => {
  let metadataRequests = 0;
  const requests: number[] = [];
  const presenter = new DeferredPresenter();
  const session = makeSession(presenter, {
    fetchImpl: countingFetch(requests),
    loadMetadata: async () => {
      metadataRequests += 1;
      return {
        context,
        sourceTransferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
      };
    },
    cacheScope: CACHE_SCOPE,
  });

  await session.open();
  const first = session.selectFrame(1);
  await flush();
  assert.equal(presenter.hasPending(), true);

  session.setMode("p2");
  const firstResult = await first;
  assert.equal(firstResult.status, "stale");
  assert.equal(presenter.registrationCount(), 0);

  const second = session.selectFrame(1);
  await flush();
  assert.equal(presenter.hasPending(), true);
  presenter.settlePending();
  const secondResult = expectPresented(await second);
  assert.equal(secondResult.source, "network");
  assert.equal(session.metrics().mode, "p2");
  assert.equal(metadataRequests, 1);

  session.close();
});

test("clear RAM removes reusable bytes but keeps the displayed frame", async () => {
  const requests: number[] = [];
  const presenter = new TestPresenter();
  const session = makeP2Session(presenter, {
    fetchImpl: countingFetch(requests),
  });

  await session.open();
  expectPresented(await session.selectFrame(1));
  assert.equal(session.metrics().cache?.entryCount, 1);
  assert.equal(presenter.registrationCount(), 1);

  const cleared = session.clearRam();
  assert.equal(cleared?.clearedEntries, 1);
  assert.equal(session.metrics().cache?.entryCount, 0);
  assert.equal(presenter.registrationCount(), 1);

  const again = expectPresented(await session.selectFrame(1));
  assert.deepEqual(requests, [1, 1]);
  assert.equal(again.source, "network");

  session.close();
});

test("closing during a P2 fetch rejects the late completion", async () => {
  const presenter = new TestPresenter();
  let resolveFrame!: (payload: NativeFramePayload) => void;
  const loadFrame = async (
    request: NativeFrameRequest,
  ): Promise<NativeFramePayload> => {
    void request;
    return new Promise<NativeFramePayload>((resolve) => {
      resolveFrame = resolve;
    });
  };
  const session = makeP2Session(presenter, { loadFrame });

  await session.open();
  const pending = session.selectFrame(1);
  await flush();
  session.close();
  resolveFrame({
    representation: "native-frame-v1",
    frameNumber: 1,
    transferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
    bytes: makeFrame(1),
  });

  const result = await pending;
  assert.equal(result.status, "stale");
  assert.equal(presenter.closed, true);
  assert.equal(presenter.registrationCount(), 0);
  assert.equal(session.metrics().pendingFrameRequests, 0);
  assert.equal(session.metrics().cache, null);
});

test("malformed P2 transport does not cache and records an error", async () => {
  const presenter = new TestPresenter();
  const session = makeP2Session(presenter, {
    fetchImpl: async () =>
      new Response("not a native frame", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
  });

  await session.open();
  await assert.rejects(
    () => session.selectFrame(1),
    (error: unknown) =>
      error instanceof NativeFrameError && error.code === "invalid-response",
  );
  const metrics = session.metrics();
  assert.equal(metrics.errors, 1);
  assert.equal(metrics.frameBodyRequests, 1);
  assert.equal(metrics.pendingFrameRequests, 0);
  assert.equal(metrics.cache?.entryCount, 0);

  session.close();
});

