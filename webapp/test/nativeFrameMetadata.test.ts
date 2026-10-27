import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MULTIFRAME_GRAYSCALE_WORD_SC_SOP_CLASS_UID,
  NATIVE_FRAME_TRANSFER_SYNTAX_UID,
  NativeFrameError,
  type NativeFrameErrorCode,
  type NativeFrameLocator,
} from "../src/services/nativeFrameContract";
import {
  fetchInstanceMetadata,
  MAX_INSTANCE_METADATA_BYTES,
  SOURCE_TRANSFER_SYNTAX_HEADER,
} from "../src/services/nativeFrameMetadata";

const STUDY = "1.2.826.0.1.3680043.2.1125.100.1";
const SERIES = "1.2.826.0.1.3680043.2.1125.100.1.1";
const INSTANCE = "1.2.826.0.1.3680043.2.1125.100.1.1.1";
const CT_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.2";

const locator: NativeFrameLocator = {
  studyInstanceUID: STUDY,
  seriesInstanceUID: SERIES,
  sopInstanceUID: INSTANCE,
};

interface FetchCall {
  url: string;
  init: RequestInit;
}

function metadataDataset(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    "00080016": { vr: "UI", Value: [MULTIFRAME_GRAYSCALE_WORD_SC_SOP_CLASS_UID] },
    "00080018": { vr: "UI", Value: [INSTANCE] },
    "0020000D": { vr: "UI", Value: [STUDY] },
    "0020000E": { vr: "UI", Value: [SERIES] },
    "00280002": { vr: "US", Value: [1] },
    "00280004": { vr: "CS", Value: ["MONOCHROME2"] },
    "00280008": { vr: "IS", Value: ["8"] },
    "00280010": { vr: "US", Value: [64] },
    "00280011": { vr: "US", Value: [64] },
    "00280100": { vr: "US", Value: [16] },
    "00280101": { vr: "US", Value: [16] },
    "00280102": { vr: "US", Value: [15] },
    "00280103": { vr: "US", Value: [0] },
    ...overrides,
  };
}

function makeHeaders(
  overrides: Record<string, string> = {},
): Headers {
  return new Headers({
    "Content-Type": "application/dicom+json",
    [SOURCE_TRANSFER_SYNTAX_HEADER]: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
    ...overrides,
  });
}

function makeResponse(
  body: string | Uint8Array | ReadableStream<Uint8Array> | null,
  headers: Headers = makeHeaders(),
  status = 200,
): Response {
  return new Response(body, { status, headers });
}

function makeFetch(
  response: Response,
  calls: FetchCall[] = [],
): typeof fetch {
  return async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return response;
  };
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

async function fetchWithNumberOfFrames(value: unknown) {
  return fetchInstanceMetadata(locator, {
    baseUrl: "https://example.test/next/api",
    token: "test-token",
    fetchImpl: makeFetch(
      makeResponse(
        JSON.stringify(
          metadataDataset({ "00280008": { vr: "IS", Value: [value] } }),
        ),
      ),
    ),
  });
}

test("fetches bounded instance metadata and builds a native-frame context", async () => {
  const calls: FetchCall[] = [];
  const metadata = await fetchInstanceMetadata(locator, {
    baseUrl: "https://example.test/next/api/",
    token: "test-token",
    fetchImpl: makeFetch(
      makeResponse(JSON.stringify(metadataDataset())),
      calls,
    ),
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `https://example.test/next/api/dicom-web/studies/${STUDY}/series/${SERIES}/instances/${INSTANCE}/metadata`,
  );
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(new Headers(calls[0].init.headers).get("authorization"), "test-token");
  assert.equal(metadata.sourceTransferSyntaxUID, NATIVE_FRAME_TRANSFER_SYNTAX_UID);
  assert.equal(metadata.context.sopClassUID, MULTIFRAME_GRAYSCALE_WORD_SC_SOP_CLASS_UID);
  assert.equal(metadata.context.transferSyntaxUID, NATIVE_FRAME_TRANSFER_SYNTAX_UID);
  assert.equal(metadata.context.rows, 64);
  assert.equal(metadata.context.columns, 64);
  assert.equal(metadata.context.numberOfFrames, 8);
  assert.equal(metadata.context.frameSizeBytes, 8192);
});

test("accepts Number of Frames encoded as a DICOM JSON integer string", async () => {
  for (const value of ["8", " 8 ", "+8", "0008"]) {
    const metadata = await fetchWithNumberOfFrames(value);
    assert.equal(metadata.context.numberOfFrames, 8);
  }
});

test("accepts Number of Frames encoded as a DICOM JSON number", async () => {
  const metadata = await fetchWithNumberOfFrames(8);
  assert.equal(metadata.context.numberOfFrames, 8);
});

test("rejects non-canonical Number of Frames values", async () => {
  for (const value of [
    "8.0",
    "8abc",
    "1e3",
    "",
    "  ",
    null,
    true,
    "99999999999999999999",
  ]) {
    await expectCode(fetchWithNumberOfFrames(value), "invalid-response");
  }
});

test("requires the source transfer syntax response header independently of the JSON body", async () => {
  await expectCode(
    fetchInstanceMetadata(locator, {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(
        makeResponse(
          JSON.stringify(metadataDataset()),
          makeHeaders({ [SOURCE_TRANSFER_SYNTAX_HEADER]: "" }),
        ),
      ),
    }),
    "invalid-response",
  );
});

test("rejects an invalid source transfer syntax header", async () => {
  await expectCode(
    fetchInstanceMetadata(locator, {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(
        makeResponse(
          JSON.stringify(metadataDataset()),
          makeHeaders({ [SOURCE_TRANSFER_SYNTAX_HEADER]: "bad uid" }),
        ),
      ),
    }),
    "invalid-response",
  );
});

test("rejects an oversized declared metadata body", async () => {
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  const headers = makeHeaders({
    "Content-Length": String(MAX_INSTANCE_METADATA_BYTES + 1),
  });

  await expectCode(
    fetchInstanceMetadata(locator, {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(makeResponse(body, headers)),
    }),
    "body-too-large",
  );
});

test("rejects an oversized streamed metadata body", async () => {
  let sent = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent) {
        controller.close();
        return;
      }
      sent = true;
      controller.enqueue(new Uint8Array(MAX_INSTANCE_METADATA_BYTES + 1));
    },
  });

  await expectCode(
    fetchInstanceMetadata(locator, {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(makeResponse(body)),
    }),
    "body-too-large",
  );
});

test("rejects invalid metadata JSON", async () => {
  await expectCode(
    fetchInstanceMetadata(locator, {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(makeResponse("{not-json")),
    }),
    "invalid-response",
  );
});

test("rejects a metadata identity mismatch", async () => {
  await expectCode(
    fetchInstanceMetadata(locator, {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(
        makeResponse(
          JSON.stringify(
            metadataDataset({
              "00080018": { vr: "UI", Value: ["1.2.3.4.5"] },
            }),
          ),
        ),
      ),
    }),
    "invalid-response",
  );
});

test("accepts a CT instance without Number of Frames and with a signed 12-bit profile", async () => {
  const dataset = metadataDataset({
    "00080016": { vr: "UI", Value: [CT_IMAGE_STORAGE] },
    "00280101": { vr: "US", Value: [12] },
    "00280102": { vr: "US", Value: [11] },
    "00280103": { vr: "US", Value: [1] },
  });
  delete dataset["00280008"];

  const metadata = await fetchInstanceMetadata(locator, {
    baseUrl: "https://example.test/next/api",
    token: "test-token",
    fetchImpl: makeFetch(makeResponse(JSON.stringify(dataset))),
  });

  assert.equal(metadata.context.sopClassUID, CT_IMAGE_STORAGE);
  assert.equal(metadata.context.numberOfFrames, 1);
  assert.equal(metadata.context.bitsStored, 12);
  assert.equal(metadata.context.highBit, 11);
  assert.equal(metadata.context.pixelRepresentation, 1);
  assert.equal(metadata.context.frameSizeBytes, 8192);
});

test("rejects a body transfer syntax that disagrees with the header", async () => {
  await expectCode(
    fetchInstanceMetadata(locator, {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(
        makeResponse(
          JSON.stringify(
            metadataDataset({
              "00020010": { vr: "UI", Value: ["1.2.840.10008.1.2.4.70"] },
            }),
          ),
        ),
      ),
    }),
    "invalid-response",
  );
});

test("maps unauthenticated metadata responses to unauthorized", async () => {
  await expectCode(
    fetchInstanceMetadata(locator, {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(
        makeResponse("", new Headers({ "Content-Type": "application/problem+json" }), 401),
      ),
    }),
    "unauthorized",
  );
});

test("rejects non-DICOM-JSON metadata content", async () => {
  await expectCode(
    fetchInstanceMetadata(locator, {
      baseUrl: "https://example.test/next/api",
      token: "test-token",
      fetchImpl: makeFetch(
        makeResponse(
          JSON.stringify(metadataDataset()),
          makeHeaders({ "Content-Type": "text/html" }),
        ),
      ),
    }),
    "invalid-response",
  );
});
