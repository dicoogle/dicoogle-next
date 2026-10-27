import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MULTIFRAME_GRAYSCALE_WORD_SC_SOP_CLASS_UID,
  NATIVE_FRAME_TRANSFER_SYNTAX_UID,
  type NativeFrameContext,
  type NativeFrameLocator,
  type NativeFrameRequest,
} from "../src/services/nativeFrameContract";
import type { WrappedSingleFrame } from "../src/services/nativeFrameContract";
import type { FramePresenter } from "../src/services/nativeFramePresenter";
import {
  NativeFrameSession,
  type FrameSelectionResult,
  type NativeFrameSessionOptions,
} from "../src/services/nativeFrameSession";
import { fetchNativeFrame } from "../src/services/nativeFrameTransport";

const STUDY = "1.2.826.0.1.3680043.2.1125.100.1";
const SERIES = "1.2.826.0.1.3680043.2.1125.100.1.1";
const INSTANCE = "1.2.826.0.1.3680043.2.1125.100.1.1.1";
const BOUNDARY = "native-frame-navigation-test-boundary";
const FRAME_SIZE = 8192;

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
    this.calls.push({ requestId, wrapped });
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

  settle(requestId: number): void {
    if (!this.pending || this.pending.requestId !== requestId) {
      return;
    }
    const pending = this.pending;
    this.pending = null;
    this.visibleRequestId = requestId;
    pending.resolve(`image-${requestId}`);
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

function makeSession(
  presenter: FramePresenter,
  options: Partial<NativeFrameSessionOptions> = {},
): NativeFrameSession {
  return new NativeFrameSession(locator, {
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

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("frames 1-8 issue eight requests and revisiting frame 1 issues a fresh request and decode", async () => {
  const frameRequests: number[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const match = String(input).match(/\/frames\/(\d+)$/);
    assert.ok(match);
    const frameNumber = Number(match[1]);
    frameRequests.push(frameNumber);
    return makeFrameResponse(frameNumber);
  };
  const presenter = new TestPresenter();
  const session = makeSession(presenter, { fetchImpl });

  await session.open();
  const results: FrameSelectionResult[] = [];
  for (let frameNumber = 1; frameNumber <= 8; frameNumber += 1) {
    results.push(await session.selectFrame(frameNumber));
  }
  results.push(await session.selectFrame(1));

  assert.deepEqual(frameRequests, [1, 2, 3, 4, 5, 6, 7, 8, 1]);
  assert.equal(presenter.calls.length, 9);
  assert.ok(results.every((result) => result.status === "presented"));
  assert.equal(new Set(presenter.calls.map((call) => call.wrapped.blob)).size, 9);
  assert.notEqual(
    presenter.calls[0].wrapped.bytes,
    presenter.calls[8].wrapped.bytes,
  );
  assert.deepEqual(presenter.calls[0].wrapped.bytes, presenter.calls[8].wrapped.bytes);
  assert.equal(presenter.maxRegistrations, 1);

  session.close();
  assert.equal(presenter.registrationCount(), 0);
  assert.equal(presenter.visibleRequestId, null);
});

test("stale completion never becomes the visible frame", async () => {
  const deferredFrames = new Map<
    number,
    {
      resolve: (response: Response) => void;
      reject: (error: unknown) => void;
    }
  >();
  const loadFrame = (request: NativeFrameRequest): Promise<Response> =>
    new Promise<Response>((resolve, reject) => {
      deferredFrames.set(request.frameNumber, { resolve, reject });
    });
  const presenter = new DeferredPresenter();
  const session = makeSession(presenter, {
    loadFrame: async (request) =>
      fetchNativeFrame(request, {
        baseUrl: "https://example.test/next/api",
        token: "test-token",
        fetchImpl: async () => loadFrame(request),
      }),
  });

  await session.open();
  const first = session.selectFrame(1);
  await flush();
  deferredFrames.get(1)?.resolve(makeFrameResponse(1));
  await flush();
  assert.equal(presenter.registrationCount(), 1);

  const second = session.selectFrame(2);
  await flush();
  assert.equal(presenter.registrationCount(), 0);
  deferredFrames.get(2)?.resolve(makeFrameResponse(2));
  await flush();
  assert.equal(presenter.registrationCount(), 1);

  presenter.settle(2);
  const secondResult = await second;
  assert.equal(secondResult.status, "presented");
  const firstResult = await first;
  assert.equal(firstResult.status, "stale");
  assert.equal(presenter.visibleRequestId, 2);
  assert.equal(presenter.maxRegistrations, 1);

  session.close();
  assert.equal(presenter.registrationCount(), 0);
  assert.equal(presenter.visibleRequestId, null);
});
