import assert from "node:assert/strict";
import { test } from "node:test";
import dicomParser from "dicom-parser";
import {
  MAX_MULTIPART_RESPONSE_BYTES,
  MULTIFRAME_GRAYSCALE_WORD_SC_SOP_CLASS_UID,
  NATIVE_FRAME_TRANSFER_SYNTAX_UID,
  NativeFrameError,
  type NativeFrameContext,
  type NativeFrameErrorCode,
  type NativeFrameLocator,
  type NativeFrameRequest,
} from "../src/services/nativeFrameContract";
import { buildWrappedSingleFramePart10 } from "../src/services/nativeFramePart10";
import { fetchNativeFrame } from "../src/services/nativeFrameTransport";

const STUDY = "1.2.826.0.1.3680043.2.1125.100.1";
const SERIES = "1.2.826.0.1.3680043.2.1125.100.1.1";
const INSTANCE = "1.2.826.0.1.3680043.2.1125.100.1.1.1";
const BOUNDARY = "native-frame-test-boundary";
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

interface FetchCall {
  url: string;
  init: RequestInit;
}

function makeFrame(seed: number): Uint8Array {
  const bytes = new Uint8Array(FRAME_SIZE);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (index * 31 + seed * 17) & 0xff;
  }
  return bytes;
}

function makeRequest(overrides: Partial<NativeFrameRequest> = {}): NativeFrameRequest {
  return {
    locator,
    context,
    frameNumber: 1,
    ...overrides,
  };
}

function makeHeaders(
  boundary: string,
  overrides: Record<string, string> = {},
): Headers {
  return new Headers({
    "Content-Type": `multipart/related; type="application/octet-stream"; boundary="${boundary}"`,
    "X-Frame-Representation": "native-frame-v1",
    "X-Frame-Transfer-Syntax": NATIVE_FRAME_TRANSFER_SYNTAX_UID,
    "X-Frame-Number-Basis": "1",
    "X-Frame-Source": "next",
    "X-Frame-Cache": "bypass",
    "Cache-Control": "no-store",
    ...overrides,
  });
}

function makeResponse(
  body: Uint8Array,
  boundary = BOUNDARY,
  overrides: Record<string, string> = {},
  status = 200,
): Response {
  return new Response(body, {
    status,
    headers: makeHeaders(boundary, overrides),
  });
}

function makeFetch(
  response: Response,
  calls: FetchCall[],
): typeof fetch {
  return async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return response;
  };
}

function makeMultipart(
  payload: Uint8Array,
  options: {
    boundary?: string;
    frameNumber?: string;
    partContentType?: string;
    extraHeaders?: string[];
    finalSuffix?: string;
  } = {},
): Uint8Array {
  const boundary = options.boundary ?? BOUNDARY;
  const frameNumber = options.frameNumber ?? "1";
  const partContentType = options.partContentType ?? "application/octet-stream";
  const extraHeaders = options.extraHeaders ?? [];
  const finalSuffix = options.finalSuffix ?? "CRLF";
  const headerLines = [
    `Content-Type: ${partContentType}`,
    `X-Frame-Number: ${frameNumber}`,
    ...extraHeaders,
  ];
  const final = finalSuffix === "none" ? "--" : "--\r\n";

  return concatBytes(
    ascii(`--${boundary}\r\n${headerLines.join("\r\n")}\r\n\r\n`),
    payload,
    ascii(`\r\n--${boundary}${final}`),
  );
}

function makeTwoPartBody(boundary = BOUNDARY): Uint8Array {
  const frame = makeFrame(1);
  return concatBytes(
    ascii(
      `--${boundary}\r\nContent-Type: application/octet-stream\r\nX-Frame-Number: 1\r\n\r\n`,
    ),
    frame,
    ascii(
      `\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\nX-Frame-Number: 2\r\n\r\n`,
    ),
    frame,
    ascii(`\r\n--${boundary}--\r\n`),
  );
}

async function expectCode(
  promise: Promise<unknown>,
  code: NativeFrameErrorCode,
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof NativeFrameError);
    assert.equal(error.code, code);
    return true;
  });
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

test("fetches one frame with no-store and exact multipart bytes", async () => {
  const frame = makeFrame(1);
  const calls: FetchCall[] = [];
  const response = makeResponse(makeMultipart(frame));
  const payload = await fetchNativeFrame(makeRequest(), {
    baseUrl: "https://example.test/next/api/",
    token: "test-token",
    fetchImpl: makeFetch(response, calls),
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `https://example.test/next/api/dicom-web/studies/${STUDY}/series/${SERIES}/instances/${INSTANCE}/frames/1`,
  );
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.redirect, "error");
  const sentHeaders = new Headers(calls[0].init.headers);
  assert.equal(sentHeaders.get("authorization"), "test-token");
  assert.equal(sentHeaders.get("accept"), "multipart/related");

  assert.equal(payload.representation, "native-frame-v1");
  assert.equal(payload.frameNumber, 1);
  assert.equal(payload.transferSyntaxUID, NATIVE_FRAME_TRANSFER_SYNTAX_UID);
  assert.deepEqual(payload.bytes, frame);
});

test("accepts no-store alongside other cache directives", async () => {
  const frame = makeFrame(2);
  const response = makeResponse(makeMultipart(frame), BOUNDARY, {
    "Cache-Control": "no-store, max-age=0",
  });
  const payload = await fetchNativeFrame(makeRequest(), {
    baseUrl: "https://example.test/next/api",
    token: "test-token",
    fetchImpl: makeFetch(response, []),
  });
  assert.deepEqual(payload.bytes, frame);
});

test("rejects a response with the wrong representation header", async () => {
  const response = makeResponse(makeMultipart(makeFrame(1)), BOUNDARY, {
    "X-Frame-Representation": "png-preview",
  });
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("rejects a response without no-store", async () => {
  const response = makeResponse(makeMultipart(makeFrame(1)), BOUNDARY, {
    "Cache-Control": "max-age=60",
  });
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("rejects a response with the wrong transfer syntax", async () => {
  const response = makeResponse(makeMultipart(makeFrame(1)), BOUNDARY, {
    "X-Frame-Transfer-Syntax": "1.2.840.10008.1.2.4.70",
  });
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("rejects an invalid multipart boundary", async () => {
  const response = makeResponse(makeMultipart(makeFrame(1)), BOUNDARY, {
    "Content-Type": 'multipart/related; type="application/octet-stream"; boundary="bad boundary"',
  });
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("rejects a non-multipart response", async () => {
  const response = makeResponse(ascii("<html>login</html>"), BOUNDARY, {
    "Content-Type": "text/html",
  });
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("rejects a part with the wrong frame number", async () => {
  const response = makeResponse(
    makeMultipart(makeFrame(1), { frameNumber: "2" }),
  );
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("rejects a part with a non-canonical frame number", async () => {
  const response = makeResponse(
    makeMultipart(makeFrame(1), { frameNumber: "01" }),
  );
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("rejects a payload with the wrong length", async () => {
  const response = makeResponse(makeMultipart(makeFrame(1).slice(0, FRAME_SIZE - 1)));
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("rejects multiple parts", async () => {
  const response = makeResponse(makeTwoPartBody());
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("rejects duplicate part headers", async () => {
  const response = makeResponse(
    makeMultipart(makeFrame(1), {
      extraHeaders: ["X-Frame-Number: 1"],
    }),
  );
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("rejects a wrong part content type", async () => {
  const response = makeResponse(
    makeMultipart(makeFrame(1), { partContentType: "application/json" }),
  );
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("rejects trailing multipart data", async () => {
  const response = makeResponse(
    concatBytes(makeMultipart(makeFrame(1)), ascii("extra")),
  );
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("rejects a missing final CRLF", async () => {
  const response = makeResponse(
    makeMultipart(makeFrame(1), { finalSuffix: "none" }),
  );
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("rejects an oversized declared response body without reading it", async () => {
  const response = makeResponse(makeMultipart(makeFrame(1)), BOUNDARY, {
    "Content-Length": String(MAX_MULTIPART_RESPONSE_BYTES + 1),
  });
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "body-too-large",
  );
});

test("rejects an invalid declared Content-Length", async () => {
  const response = makeResponse(makeMultipart(makeFrame(1)), BOUNDARY, {
    "Content-Length": "not-a-number",
  });
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("rejects an oversized streamed response body", async () => {
  let sent = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent) {
        controller.close();
        return;
      }
      sent = true;
      controller.enqueue(new Uint8Array(MAX_MULTIPART_RESPONSE_BYTES + 1));
    },
  });
  const response = new Response(body, { headers: makeHeaders(BOUNDARY) });
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "body-too-large",
  );
});

test("rejects a response without a body", async () => {
  const response = new Response(null, { headers: makeHeaders(BOUNDARY) });
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, []),
    }),
    "invalid-response",
  );
});

test("maps an unauthenticated response to unauthorized", async () => {
  const calls: FetchCall[] = [];
  const response = new Response("", {
    status: 401,
    headers: { "Content-Type": "application/problem+json" },
  });
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, calls),
    }),
    "unauthorized",
  );
  assert.equal(calls.length, 1);
});

test("maps an unsupported response to an HTTP error without fallback", async () => {
  const calls: FetchCall[] = [];
  const response = new Response("", {
    status: 415,
    headers: { "Content-Type": "application/problem+json" },
  });
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(response, calls),
    }),
    "http-error",
  );
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url.includes("/dic2png"),
    false,
  );
});

test("fails before fetch for an invalid frame number", async () => {
  const calls: FetchCall[] = [];
  await expectCode(
    fetchNativeFrame(makeRequest({ frameNumber: 9 }), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(makeResponse(makeMultipart(makeFrame(1))), calls),
    }),
    "invalid-request",
  );
  assert.equal(calls.length, 0);
});

test("fails before fetch for an invalid SOP Class UID", async () => {
  const calls: FetchCall[] = [];
  const badContext = { ...context, sopClassUID: "not-a-uid" };
  await expectCode(
    fetchNativeFrame(makeRequest({ context: badContext }), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(makeResponse(makeMultipart(makeFrame(1))), calls),
    }),
    "invalid-request",
  );
  assert.equal(calls.length, 0);
});

test("fails before fetch for an inconsistent frame size", async () => {
  const calls: FetchCall[] = [];
  const badContext = { ...context, frameSizeBytes: FRAME_SIZE - 2 };
  await expectCode(
    fetchNativeFrame(makeRequest({ context: badContext }), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(makeResponse(makeMultipart(makeFrame(1))), calls),
    }),
    "invalid-request",
  );
  assert.equal(calls.length, 0);
});

test("does not fetch when the signal is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  const calls: FetchCall[] = [];
  await assert.rejects(
    fetchNativeFrame(makeRequest({ signal: controller.signal }), {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(makeResponse(makeMultipart(makeFrame(1))), calls),
    }),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
  assert.equal(calls.length, 0);
});

test("fails before fetch when the token is missing", async () => {
  const calls: FetchCall[] = [];
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      fetchImpl: makeFetch(makeResponse(makeMultipart(makeFrame(1))), calls),
    }),
    "invalid-request",
  );
  assert.equal(calls.length, 0);
});

test("fails before fetch when the token is blank", async () => {
  const calls: FetchCall[] = [];
  await expectCode(
    fetchNativeFrame(makeRequest(), {
      baseUrl: "https://example.test/next/api",
      token: " \t ",
      fetchImpl: makeFetch(makeResponse(makeMultipart(makeFrame(1))), calls),
    }),
    "invalid-request",
  );
  assert.equal(calls.length, 0);
});

test("builds a parseable transient single-frame Part-10 wrapper", () => {
  const frame = makeFrame(3);
  const wrapped = buildWrappedSingleFramePart10(locator, context, frame);

  assert.equal(wrapped.representation, "wrapped-single-frame-v1");
  assert.equal(wrapped.blob.type, "application/dicom");
  assert.equal(wrapped.blob.size, wrapped.bytes.byteLength);
  assert.equal(String.fromCharCode(...wrapped.bytes.slice(128, 132)), "DICM");

  const parsed = dicomParser.parseDicom(wrapped.bytes);
  assert.equal(parsed.string("x00020010").replace(/\0/g, ""), NATIVE_FRAME_TRANSFER_SYNTAX_UID);
  assert.equal(
    parsed.string("x00020002").replace(/\0/g, ""),
    MULTIFRAME_GRAYSCALE_WORD_SC_SOP_CLASS_UID,
  );
  assert.equal(parsed.string("x00020003").replace(/\0/g, ""), INSTANCE);
  assert.equal(parsed.string("x00080016").replace(/\0/g, ""), context.sopClassUID);
  assert.equal(parsed.string("x00080018").replace(/\0/g, ""), INSTANCE);
  assert.equal(parsed.string("x0020000d").replace(/\0/g, ""), STUDY);
  assert.equal(parsed.string("x0020000e").replace(/\0/g, ""), SERIES);
  assert.equal(parsed.uint16("x00280002"), 1);
  assert.equal(parsed.string("x00280004"), "MONOCHROME2");
  assert.equal(parsed.string("x00280008").trim(), "1");
  assert.equal(parsed.uint16("x00280010"), 64);
  assert.equal(parsed.uint16("x00280011"), 64);
  assert.equal(parsed.uint16("x00280100"), 16);
  assert.equal(parsed.uint16("x00280101"), 16);
  assert.equal(parsed.uint16("x00280102"), 15);
  assert.equal(parsed.uint16("x00280103"), 0);

  const pixelElement = parsed.elements.x7fe00010;
  assert.ok(pixelElement);
  assert.equal(pixelElement.length, FRAME_SIZE);
  assert.deepEqual(
    parsed.byteArray.slice(
      pixelElement.dataOffset,
      pixelElement.dataOffset + pixelElement.length,
    ),
    frame,
  );
});

test("builds an eight-bit wrapper with an OB Pixel Data element", () => {
  const eightBitContext: NativeFrameContext = {
    ...context,
    sopClassUID: "1.2.840.10008.5.1.4.1.1.2",
    photometricInterpretation: "MONOCHROME1",
    bitsAllocated: 8,
    bitsStored: 8,
    highBit: 7,
    pixelRepresentation: 1,
    numberOfFrames: 1,
    frameSizeBytes: FRAME_SIZE / 2,
  };
  const frame = makeFrame(5).slice(0, FRAME_SIZE / 2);
  const wrapped = buildWrappedSingleFramePart10(locator, eightBitContext, frame);

  const parsed = dicomParser.parseDicom(wrapped.bytes);
  const pixelElement = parsed.elements.x7fe00010;
  assert.equal(pixelElement.vr, "OB");
  assert.equal(pixelElement.length, frame.byteLength);
  assert.deepEqual(
    parsed.byteArray.slice(
      pixelElement.dataOffset,
      pixelElement.dataOffset + pixelElement.length,
    ),
    frame,
  );
});

test("does not build a wrapper from a payload of the wrong length", () => {
  assert.throws(
    () => buildWrappedSingleFramePart10(locator, context, makeFrame(4).slice(0, 100)),
    (error: unknown) => error instanceof NativeFrameError && error.code === "invalid-request",
  );
});
