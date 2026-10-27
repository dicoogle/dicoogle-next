import {
  invalidRequest,
  invalidResponse,
  MAX_DICOM_UID_LENGTH,
  NativeFrameError,
  throwIfAborted,
  type NativeFrameContext,
  type NativeFrameLocator,
  validateNativeFrameContext,
  validateNativeFrameLocator,
} from "./nativeFrameContract";

export const SOURCE_TRANSFER_SYNTAX_HEADER = "X-Source-Transfer-Syntax";
export const MAX_INSTANCE_METADATA_BYTES = 1024 * 1024;

export interface InstanceMetadata {
  context: NativeFrameContext;
  sourceTransferSyntaxUID: string;
}

export interface InstanceMetadataOptions {
  baseUrl: string;
  token?: string | null;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

type DicomJsonDataset = Record<string, unknown>;

export async function fetchInstanceMetadata(
  locator: NativeFrameLocator,
  options: InstanceMetadataOptions,
): Promise<InstanceMetadata> {
  throwIfAborted(options.signal);
  validateNativeFrameLocator(locator);

  const token = options.token?.trim();
  if (!token) {
    throw invalidRequest("Instance metadata request requires a non-empty authentication token");
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw invalidRequest("No fetch implementation is available");
  }

  const headers = new Headers({ Accept: "application/dicom+json" });
  headers.set("Authorization", token);

  let response: Response;
  try {
    response = await fetchImpl(buildInstanceMetadataPath(options.baseUrl, locator), {
      method: "GET",
      headers,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: options.signal,
    });
  } catch (error) {
    throwIfAborted(options.signal);
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new NativeFrameError(
      "http-error",
      "Instance metadata request failed before a response was received",
    );
  }

  throwIfAborted(options.signal);

  if (!response.ok) {
    await cancelBody(response);
    throw httpError(response.status);
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/dicom+json") {
    await cancelBody(response);
    throw invalidResponse("Instance metadata response is not application/dicom+json");
  }

  const sourceTransferSyntaxUID = response.headers.get(SOURCE_TRANSFER_SYNTAX_HEADER)?.trim();
  if (!sourceTransferSyntaxUID || !isDicomUid(sourceTransferSyntaxUID)) {
    await cancelBody(response);
    throw invalidResponse("Instance metadata response has no valid source transfer syntax");
  }

  let body: Uint8Array;
  try {
    body = await readBoundedMetadataBody(response, options.signal);
  } catch (error) {
    await cancelBody(response);
    throw error;
  }

  throwIfAborted(options.signal);
  const context = parseMetadataContext(
    locator,
    body,
    sourceTransferSyntaxUID,
  );

  return { context, sourceTransferSyntaxUID };
}

export function buildInstanceMetadataPath(
  baseUrl: string,
  locator: NativeFrameLocator,
): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) {
    throw invalidRequest("Instance metadata API base URL is empty");
  }
  return (
    `${base}/dicom-web/studies/${encodeURIComponent(locator.studyInstanceUID)}` +
    `/series/${encodeURIComponent(locator.seriesInstanceUID)}` +
    `/instances/${encodeURIComponent(locator.sopInstanceUID)}/metadata`
  );
}

function parseMetadataContext(
  locator: NativeFrameLocator,
  body: Uint8Array,
  sourceTransferSyntaxUID: string,
): NativeFrameContext {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw invalidResponse("Instance metadata response is not valid JSON");
  }
  if (!isRecord(parsed)) {
    throw invalidResponse("Instance metadata response is not a DICOM JSON object");
  }

  const dataset: DicomJsonDataset = parsed;
  if (readString(dataset, "0020000D") !== locator.studyInstanceUID) {
    throw invalidResponse("Instance metadata study identity does not match the request");
  }
  if (readString(dataset, "0020000E") !== locator.seriesInstanceUID) {
    throw invalidResponse("Instance metadata series identity does not match the request");
  }
  if (readString(dataset, "00080018") !== locator.sopInstanceUID) {
    throw invalidResponse("Instance metadata instance identity does not match the request");
  }

  const bodyTransferSyntaxUID = readOptionalString(dataset, "00020010");
  if (bodyTransferSyntaxUID !== undefined && bodyTransferSyntaxUID !== sourceTransferSyntaxUID) {
    throw invalidResponse("Instance metadata transfer syntax headers disagree");
  }

  const sopClassUID = readString(dataset, "00080016");
  const rows = readInteger(dataset, "00280010");
  const columns = readInteger(dataset, "00280011");
  const samplesPerPixel = readInteger(dataset, "00280002");
  const photometricInterpretation = readString(dataset, "00280004").trim();
  const bitsAllocated = readInteger(dataset, "00280100");
  const bitsStored = readInteger(dataset, "00280101");
  const highBit = readInteger(dataset, "00280102");
  const pixelRepresentation = readInteger(dataset, "00280103");
  const numberOfFrames = readOptionalIsInteger(dataset, "00280008") ?? 1;
  const frameSizeBytes = rows * columns * samplesPerPixel * (bitsAllocated / 8);
  if (!Number.isSafeInteger(frameSizeBytes) || frameSizeBytes < 1) {
    throw invalidResponse("Instance metadata frame size is invalid");
  }

  const context: NativeFrameContext = {
    sopClassUID,
    transferSyntaxUID: sourceTransferSyntaxUID,
    rows,
    columns,
    samplesPerPixel,
    photometricInterpretation,
    bitsAllocated,
    bitsStored,
    highBit,
    pixelRepresentation,
    numberOfFrames,
    frameSizeBytes,
  };
  validateNativeFrameContext(context);
  return context;
}

async function readBoundedMetadataBody(
  response: Response,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^[0-9]+$/.test(contentLength)) {
      throw invalidResponse("Instance metadata response has an invalid Content-Length");
    }
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength)) {
      throw invalidResponse("Instance metadata response has an invalid Content-Length");
    }
    if (declaredLength > MAX_INSTANCE_METADATA_BYTES) {
      throw new NativeFrameError(
        "body-too-large",
        "Instance metadata response exceeds the supported size limit",
      );
    }
  }

  if (!response.body) {
    throw invalidResponse("Instance metadata response has no body");
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
      if (!Number.isSafeInteger(total) || total > MAX_INSTANCE_METADATA_BYTES) {
        await reader.cancel();
        throw new NativeFrameError(
          "body-too-large",
          "Instance metadata response exceeds the supported size limit",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    throwIfAborted(signal);
    if (error instanceof NativeFrameError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw invalidResponse("Failed to read the instance metadata response body");
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

function httpError(status: number): NativeFrameError {
  if (status === 401) {
    return new NativeFrameError(
      "unauthorized",
      "Instance metadata request was not authenticated",
      status,
    );
  }
  if (status === 403) {
    return new NativeFrameError(
      "forbidden",
      "Instance metadata request was not authorised",
      status,
    );
  }
  return new NativeFrameError(
    "http-error",
    `Instance metadata request failed with HTTP ${status}`,
    status,
  );
}

function readString(dataset: DicomJsonDataset, tag: string): string {
  const value = readElementValue(dataset, tag);
  if (typeof value !== "string") {
    throw invalidResponse(`Instance metadata tag ${tag} is not a string`);
  }
  return value;
}

function readOptionalString(
  dataset: DicomJsonDataset,
  tag: string,
): string | undefined {
  if (dataset[tag] === undefined) {
    return undefined;
  }
  return readString(dataset, tag);
}

function readInteger(dataset: DicomJsonDataset, tag: string): number {
  const value = readElementValue(dataset, tag);
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw invalidResponse(`Instance metadata tag ${tag} is not an integer`);
  }
  return value;
}

function readIsInteger(dataset: DicomJsonDataset, tag: string): number {
  const value = readElementValue(dataset, tag);
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[+-]?\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isSafeInteger(parsed)) {
        return parsed;
      }
    }
  }
  throw invalidResponse(`Instance metadata tag ${tag} is not an integer`);
}

function readOptionalIsInteger(
  dataset: DicomJsonDataset,
  tag: string,
): number | undefined {
  if (dataset[tag] === undefined) {
    return undefined;
  }
  return readIsInteger(dataset, tag);
}

function readElementValue(dataset: DicomJsonDataset, tag: string): unknown {
  const element = dataset[tag];
  if (!isRecord(element)) {
    throw invalidResponse(`Instance metadata tag ${tag} is missing`);
  }
  const values = element.Value;
  if (!Array.isArray(values) || values.length !== 1) {
    throw invalidResponse(`Instance metadata tag ${tag} must have exactly one value`);
  }
  return values[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDicomUid(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= MAX_DICOM_UID_LENGTH &&
    /^[0-9]+(?:\.[0-9]+)*$/.test(value)
  );
}
