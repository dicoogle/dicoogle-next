import {
  buildNativeFramePath,
  invalidRequest,
  invalidResponse,
  isAbortError,
  MAX_MULTIPART_RESPONSE_BYTES,
  NATIVE_FRAME_REPRESENTATION,
  NativeFrameError,
  type NativeFramePayload,
  type NativeFrameRequest,
  throwIfAborted,
  validateNativeFrameRequest,
} from "./nativeFrameContract";
import {
  assertNativeFrameHeaders,
  parseMultipartBoundary,
  parseSingleFrameMultipart,
} from "./nativeFrameMultipart";

export interface NativeFrameTransportOptions {
  baseUrl: string;
  token?: string | null;
  fetchImpl?: typeof fetch;
}

export async function fetchNativeFrame(
  request: NativeFrameRequest,
  options: NativeFrameTransportOptions,
): Promise<NativeFramePayload> {
  throwIfAborted(request.signal);
  validateNativeFrameRequest(request);

  const token = options.token?.trim();
  if (!token) {
    throw invalidRequest("Native-frame request requires a non-empty authentication token");
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw invalidRequest("No fetch implementation is available");
  }

  const headers = new Headers({ Accept: "multipart/related" });
  headers.set("Authorization", token);

  const url = buildNativeFramePath(
    options.baseUrl,
    request.locator,
    request.frameNumber,
  );

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: request.signal,
    });
  } catch (error) {
    throwIfAborted(request.signal);
    if (isAbortError(error)) {
      throw error;
    }
    throw new NativeFrameError(
      "http-error",
      "Native-frame request failed before a response was received",
    );
  }

  throwIfAborted(request.signal);

  if (!response.ok) {
    await cancelBody(response);
    throw httpError(response.status);
  }

  let boundary: string;
  try {
    boundary = parseMultipartBoundary(response.headers.get("content-type"));
    assertNativeFrameHeaders(
      response.headers,
      request.context.transferSyntaxUID,
    );
  } catch (error) {
    await cancelBody(response);
    throw error;
  }

  let body: Uint8Array;
  try {
    body = await readBoundedBody(
      response,
      MAX_MULTIPART_RESPONSE_BYTES,
      request.signal,
    );
  } catch (error) {
    await cancelBody(response);
    throw error;
  }
  throwIfAborted(request.signal);
  const bytes = parseSingleFrameMultipart(
    body,
    boundary,
    request.frameNumber,
    request.context.frameSizeBytes,
  );

  return {
    representation: NATIVE_FRAME_REPRESENTATION,
    frameNumber: request.frameNumber,
    transferSyntaxUID: request.context.transferSyntaxUID,
    bytes,
  };
}

function httpError(status: number): NativeFrameError {
  if (status === 401) {
    return new NativeFrameError(
      "unauthorized",
      "Native-frame request was not authenticated",
      status,
    );
  }
  if (status === 403) {
    return new NativeFrameError(
      "forbidden",
      "Native-frame request was not authorised",
      status,
    );
  }
  return new NativeFrameError(
    "http-error",
    `Native-frame request failed with HTTP ${status}`,
    status,
  );
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^[0-9]+$/.test(contentLength)) {
      throw invalidResponse("Native-frame response has an invalid Content-Length");
    }
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength)) {
      throw invalidResponse("Native-frame response has an invalid Content-Length");
    }
    if (declaredLength > maxBytes) {
      throw new NativeFrameError(
        "body-too-large",
        "Native-frame response body exceeds the supported size limit",
      );
    }
  }

  if (!response.body) {
    throw invalidResponse("Native-frame response has no body");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      total += value.byteLength;
      if (!Number.isSafeInteger(total) || total > maxBytes) {
        await reader.cancel();
        throw new NativeFrameError(
          "body-too-large",
          "Native-frame response body exceeds the supported size limit",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    throwIfAborted(signal);
    if (isAbortError(error)) {
      throw error;
    }
    if (error instanceof NativeFrameError) {
      throw error;
    }
    throw invalidResponse("Failed to read the native-frame response body");
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function cancelBody(response: Response): Promise<void> {
  if (!response.body) {
    return;
  }
  try {
    await response.body.cancel();
  } catch {
    return;
  }
}
