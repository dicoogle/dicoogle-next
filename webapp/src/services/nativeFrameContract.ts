export const NATIVE_FRAME_REPRESENTATION = "native-frame-v1";
export const WRAPPED_SINGLE_FRAME_REPRESENTATION = "wrapped-single-frame-v1";
export const NATIVE_FRAME_TRANSFER_SYNTAX_UID = "1.2.840.10008.1.2.1";
export const SECONDARY_CAPTURE_SOP_CLASS_UID =
  "1.2.840.10008.5.1.4.1.1.7";
export const MULTIFRAME_GRAYSCALE_WORD_SC_SOP_CLASS_UID =
  "1.2.840.10008.5.1.4.1.1.7.3";
export const CT_IMAGE_STORAGE_SOP_CLASS_UID =
  "1.2.840.10008.5.1.4.1.1.2";
export const MR_IMAGE_STORAGE_SOP_CLASS_UID =
  "1.2.840.10008.5.1.4.1.1.4";
export const ENHANCED_MR_IMAGE_STORAGE_SOP_CLASS_UID =
  "1.2.840.10008.5.1.4.1.1.4.1";

export const SUPPORTED_NATIVE_FRAME_SOP_CLASS_UIDS: ReadonlySet<string> =
  Object.freeze(
    new Set([
      SECONDARY_CAPTURE_SOP_CLASS_UID,
      MULTIFRAME_GRAYSCALE_WORD_SC_SOP_CLASS_UID,
      CT_IMAGE_STORAGE_SOP_CLASS_UID,
      MR_IMAGE_STORAGE_SOP_CLASS_UID,
      ENHANCED_MR_IMAGE_STORAGE_SOP_CLASS_UID,
    ]),
  );

export const MAX_NATIVE_FRAME_BYTES = 16 * 1024 * 1024;
export const MAX_MULTIPART_RESPONSE_BYTES =
  MAX_NATIVE_FRAME_BYTES + 64 * 1024;
export const MAX_PART_HEADER_BYTES = 8 * 1024;
export const MAX_PART_HEADER_COUNT = 16;
export const MAX_BOUNDARY_LENGTH = 70;
export const MAX_DICOM_UID_LENGTH = 64;

const DICOM_UID_PATTERN = /^[0-9]+(?:\.[0-9]+)*$/;

export type NativeFrameErrorCode =
  | "invalid-request"
  | "unauthorized"
  | "forbidden"
  | "http-error"
  | "invalid-response"
  | "body-too-large";

export class NativeFrameError extends Error {
  readonly code: NativeFrameErrorCode;
  readonly status?: number;

  constructor(code: NativeFrameErrorCode, message: string, status?: number) {
    super(message);
    this.name = "NativeFrameError";
    this.code = code;
    this.status = status;
  }
}

export interface NativeFrameLocator {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  sopInstanceUID: string;
}

export interface NativeFrameContext {
  sopClassUID: string;
  transferSyntaxUID: string;
  rows: number;
  columns: number;
  samplesPerPixel: number;
  photometricInterpretation: string;
  bitsAllocated: number;
  bitsStored: number;
  highBit: number;
  pixelRepresentation: number;
  numberOfFrames: number;
  frameSizeBytes: number;
}

export interface NativeFrameRequest {
  locator: NativeFrameLocator;
  context: NativeFrameContext;
  frameNumber: number;
  signal?: AbortSignal;
}

export interface NativeFramePayload {
  representation: typeof NATIVE_FRAME_REPRESENTATION;
  frameNumber: number;
  transferSyntaxUID: string;
  bytes: Uint8Array;
}

export interface WrappedSingleFrame {
  representation: typeof WRAPPED_SINGLE_FRAME_REPRESENTATION;
  bytes: Uint8Array;
  blob: Blob;
}

export function invalidRequest(message: string): NativeFrameError {
  return new NativeFrameError("invalid-request", message);
}

export function invalidResponse(message: string): NativeFrameError {
  return new NativeFrameError("invalid-response", message);
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  if (signal.reason instanceof Error) {
    throw signal.reason;
  }
  throw new DOMException("The native-frame request was aborted", "AbortError");
}

export function validateNativeFrameLocator(locator: NativeFrameLocator): void {
  assertDicomUid(locator.studyInstanceUID, "studyInstanceUID");
  assertDicomUid(locator.seriesInstanceUID, "seriesInstanceUID");
  assertDicomUid(locator.sopInstanceUID, "sopInstanceUID");
}

export function validateNativeFrameContext(context: NativeFrameContext): void {
  if (context.transferSyntaxUID !== NATIVE_FRAME_TRANSFER_SYNTAX_UID) {
    throw invalidRequest("Unsupported native-frame transfer syntax");
  }
  assertDicomUid(context.sopClassUID, "sopClassUID");
  if (!SUPPORTED_NATIVE_FRAME_SOP_CLASS_UIDS.has(context.sopClassUID)) {
    throw invalidRequest("Unsupported SOP class for native-frame retrieval");
  }
  assertPositiveInteger(context.rows, "rows");
  assertPositiveInteger(context.columns, "columns");
  assertPositiveInteger(context.samplesPerPixel, "samplesPerPixel");
  assertPositiveInteger(context.numberOfFrames, "numberOfFrames");
  assertPositiveInteger(context.frameSizeBytes, "frameSizeBytes");

  if (
    context.photometricInterpretation !== "MONOCHROME1" &&
    context.photometricInterpretation !== "MONOCHROME2"
  ) {
    throw invalidRequest("Unsupported photometric interpretation");
  }
  if (context.bitsAllocated !== 8 && context.bitsAllocated !== 16) {
    throw invalidRequest("Unsupported Bits Allocated");
  }
  if (context.bitsStored > context.bitsAllocated) {
    throw invalidRequest("Unsupported Bits Stored");
  }
  if (context.highBit !== context.bitsStored - 1) {
    throw invalidRequest("Unsupported High Bit");
  }
  if (context.pixelRepresentation !== 0 && context.pixelRepresentation !== 1) {
    throw invalidRequest("Unsupported Pixel Representation");
  }

  const expectedFrameSize =
    context.rows *
    context.columns *
    context.samplesPerPixel *
    (context.bitsAllocated / 8);
  if (!Number.isSafeInteger(expectedFrameSize)) {
    throw invalidRequest("Native-frame dimensions overflow");
  }
  if (context.frameSizeBytes !== expectedFrameSize) {
    throw invalidRequest("frameSizeBytes does not match the pixel profile");
  }
  if (context.frameSizeBytes > MAX_NATIVE_FRAME_BYTES) {
    throw invalidRequest("Native frame exceeds the supported size limit");
  }
}

export function validateFrameNumber(
  frameNumber: number,
  context: NativeFrameContext,
): void {
  if (!Number.isSafeInteger(frameNumber) || frameNumber < 1) {
    throw invalidRequest("Frame number must be a positive integer");
  }
  if (frameNumber > context.numberOfFrames) {
    throw invalidRequest("Frame number is outside the instance frame range");
  }
}

export function validateNativeFrameRequest(request: NativeFrameRequest): void {
  validateNativeFrameLocator(request.locator);
  validateNativeFrameContext(request.context);
  validateFrameNumber(request.frameNumber, request.context);
}

export function buildNativeFramePath(
  baseUrl: string,
  locator: NativeFrameLocator,
  frameNumber: number,
): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) {
    throw invalidRequest("Native-frame API base URL is empty");
  }
  return (
    `${base}/dicom-web/studies/${encodeURIComponent(locator.studyInstanceUID)}` +
    `/series/${encodeURIComponent(locator.seriesInstanceUID)}` +
    `/instances/${encodeURIComponent(locator.sopInstanceUID)}` +
    `/frames/${frameNumber}`
  );
}

function assertDicomUid(value: string, field: string): void {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_DICOM_UID_LENGTH ||
    !DICOM_UID_PATTERN.test(value)
  ) {
    throw invalidRequest(`Invalid DICOM UID: ${field}`);
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw invalidRequest(`Invalid positive integer: ${field}`);
  }
}
