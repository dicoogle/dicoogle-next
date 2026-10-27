import {
  invalidResponse,
  MAX_BOUNDARY_LENGTH,
  MAX_PART_HEADER_BYTES,
  MAX_PART_HEADER_COUNT,
  NATIVE_FRAME_REPRESENTATION,
} from "./nativeFrameContract";

const CR = 13;
const LF = 10;
const DASH = 45;
const CRLF = new Uint8Array([CR, LF]);
const HEADER_END = new Uint8Array([CR, LF, CR, LF]);
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const BOUNDARY_PATTERN = /^[0-9A-Za-z'()+_,\-./:=?]{1,70}$/;

interface PartHeaders {
  contentType: string;
  frameNumber: string;
}

export function parseMultipartBoundary(contentType: string | null): string {
  if (!contentType || /[\r\n]/.test(contentType)) {
    throw invalidResponse("Native-frame response has an invalid Content-Type");
  }

  const parts = contentType.split(";");
  const mediaType = parts.shift()?.trim().toLowerCase();
  if (mediaType !== "multipart/related") {
    throw invalidResponse("Native-frame response is not multipart/related");
  }

  let boundary: string | null = null;
  let relatedType: string | null = null;

  for (const rawParameter of parts) {
    const equals = rawParameter.indexOf("=");
    if (equals < 0) {
      throw invalidResponse("Native-frame response has a malformed Content-Type parameter");
    }
    const name = rawParameter.slice(0, equals).trim().toLowerCase();
    const parameterValue = parseParameterValue(rawParameter.slice(equals + 1));
    if (!name) {
      throw invalidResponse("Native-frame response has a malformed Content-Type parameter");
    }
    if (name === "boundary") {
      if (boundary !== null) {
        throw invalidResponse("Native-frame response has multiple boundary parameters");
      }
      boundary = parameterValue;
    } else if (name === "type") {
      if (relatedType !== null) {
        throw invalidResponse("Native-frame response has multiple type parameters");
      }
      relatedType = parameterValue.toLowerCase();
    }
  }

  if (
    boundary === null ||
    boundary.length > MAX_BOUNDARY_LENGTH ||
    !BOUNDARY_PATTERN.test(boundary)
  ) {
    throw invalidResponse("Native-frame response has an invalid multipart boundary");
  }
  if (relatedType !== null && relatedType !== "application/octet-stream") {
    throw invalidResponse("Native-frame multipart type is not application/octet-stream");
  }

  return boundary;
}

export function assertNativeFrameHeaders(
  headers: Headers,
  expectedTransferSyntaxUID: string,
): void {
  assertHeader(headers, "x-frame-representation", NATIVE_FRAME_REPRESENTATION);
  assertHeader(headers, "x-frame-transfer-syntax", expectedTransferSyntaxUID);
  assertHeader(headers, "x-frame-number-basis", "1");
  assertHeader(headers, "x-frame-source", "next");
  assertHeader(headers, "x-frame-cache", "bypass");

  const cacheControl = headers.get("cache-control");
  if (!cacheControl) {
    throw invalidResponse("Native-frame response is missing Cache-Control");
  }
  const directives = cacheControl
    .split(",")
    .map((directive) => directive.trim().toLowerCase());
  if (!directives.includes("no-store")) {
    throw invalidResponse("Native-frame response must use Cache-Control: no-store");
  }
}

export function parseSingleFrameMultipart(
  body: Uint8Array,
  boundary: string,
  expectedFrameNumber: number,
  expectedFrameSizeBytes: number,
): Uint8Array {
  if (!Number.isSafeInteger(expectedFrameSizeBytes) || expectedFrameSizeBytes < 1) {
    throw invalidResponse("Expected native-frame size is invalid");
  }
  if (boundary.length > MAX_BOUNDARY_LENGTH || !BOUNDARY_PATTERN.test(boundary)) {
    throw invalidResponse("Native-frame multipart boundary is invalid");
  }

  const boundaryBytes = asciiBytes(boundary);
  const delimiter = concatBytes(new Uint8Array([DASH, DASH]), boundaryBytes);
  const nextDelimiter = concatBytes(CRLF, delimiter);

  if (!startsWith(body, delimiter, 0)) {
    throw invalidResponse("Native-frame multipart body does not start with a boundary");
  }
  let position = delimiter.byteLength;
  if (!startsWith(body, CRLF, position)) {
    throw invalidResponse("Native-frame multipart boundary is not terminated with CRLF");
  }
  position += CRLF.byteLength;

  const headerEnd = indexOf(body, HEADER_END, position);
  if (headerEnd < 0) {
    throw invalidResponse("Native-frame multipart part headers are unterminated");
  }
  if (headerEnd - position > MAX_PART_HEADER_BYTES) {
    throw invalidResponse("Native-frame multipart part headers exceed the size limit");
  }

  const partHeaders = parsePartHeaders(body.subarray(position, headerEnd));
  position = headerEnd + HEADER_END.byteLength;

  const payloadEnd = indexOf(body, nextDelimiter, position);
  if (payloadEnd < 0) {
    throw invalidResponse("Native-frame multipart payload boundary is missing");
  }
  const payloadSize = payloadEnd - position;
  if (payloadSize !== expectedFrameSizeBytes) {
    throw invalidResponse("Native-frame payload length does not match the expected frame size");
  }
  if (partHeaders.frameNumber !== String(expectedFrameNumber)) {
    throw invalidResponse("Native-frame part number does not match the requested frame");
  }
  if (partHeaders.contentType.toLowerCase() !== "application/octet-stream") {
    throw invalidResponse("Native-frame part is not application/octet-stream");
  }

  const payload = body.slice(position, payloadEnd);
  position = payloadEnd + nextDelimiter.byteLength;

  if (
    position + 2 > body.byteLength ||
    body[position] !== DASH ||
    body[position + 1] !== DASH
  ) {
    throw invalidResponse("Native-frame response must contain exactly one multipart part");
  }
  position += 2;
  if (!startsWith(body, CRLF, position)) {
    throw invalidResponse("Native-frame final multipart boundary is malformed");
  }
  position += CRLF.byteLength;
  if (position !== body.byteLength) {
    throw invalidResponse("Native-frame multipart body has trailing data");
  }

  return payload;
}

function parsePartHeaders(bytes: Uint8Array): PartHeaders {
  if (bytes.byteLength === 0) {
    throw invalidResponse("Native-frame multipart part has no headers");
  }

  const lines = splitByCrlf(bytes);
  if (lines.length > MAX_PART_HEADER_COUNT) {
    throw invalidResponse("Native-frame multipart part has too many headers");
  }

  const headers = new Map<string, string>();
  for (const lineBytes of lines) {
    if (lineBytes.byteLength === 0) {
      throw invalidResponse("Native-frame multipart part has an empty header line");
    }
    if (lineBytes.byteLength > 1024) {
      throw invalidResponse("Native-frame multipart header line exceeds the size limit");
    }
    if (lineBytes[0] === 32 || lineBytes[0] === 9) {
      throw invalidResponse("Folded native-frame multipart headers are not supported");
    }

    const line = decodeAscii(lineBytes);
    const colon = line.indexOf(":");
    if (colon <= 0) {
      throw invalidResponse("Native-frame multipart part has a malformed header");
    }
    const name = line.slice(0, colon);
    if (!HEADER_NAME_PATTERN.test(name)) {
      throw invalidResponse("Native-frame multipart part has an invalid header name");
    }
    const key = name.toLowerCase();
    if (headers.has(key)) {
      throw invalidResponse("Native-frame multipart part has a duplicate header");
    }
    const value = trimOws(line.slice(colon + 1));
    if (containsControlCharacters(value)) {
      throw invalidResponse("Native-frame multipart part has an invalid header value");
    }
    headers.set(key, value);
  }

  const contentType = headers.get("content-type");
  const frameNumber = headers.get("x-frame-number");
  if (!contentType || !frameNumber) {
    throw invalidResponse("Native-frame multipart part is missing required headers");
  }

  return { contentType, frameNumber };
}

function containsControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 8 || (code >= 10 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

function parseParameterValue(rawValue: string): string {
  const value = rawValue.trim();
  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length < 2) {
      throw invalidResponse("Native-frame response has a malformed quoted parameter");
    }
    const unquoted = value.slice(1, -1);
    if (unquoted.includes('"')) {
      throw invalidResponse("Native-frame response has a malformed quoted parameter");
    }
    return unquoted;
  }
  if (value.includes('"')) {
    throw invalidResponse("Native-frame response has a malformed Content-Type parameter");
  }
  return value;
}

function assertHeader(headers: Headers, name: string, expected: string): void {
  const actual = headers.get(name);
  if (actual !== expected) {
    throw invalidResponse(`Native-frame response header ${name} is missing or incorrect`);
  }
}

function splitByCrlf(bytes: Uint8Array): Uint8Array[] {
  const lines: Uint8Array[] = [];
  let start = 0;
  for (let index = 0; index < bytes.byteLength - 1; index += 1) {
    if (bytes[index] === CR && bytes[index + 1] === LF) {
      lines.push(bytes.subarray(start, index));
      start = index + 2;
      index += 1;
    }
  }
  if (start !== bytes.byteLength) {
    lines.push(bytes.subarray(start));
  }
  return lines;
}

function asciiBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code > 0x7f) {
      throw invalidResponse("Native-frame multipart boundary is not ASCII");
    }
    bytes[index] = code;
  }
  return bytes;
}

function decodeAscii(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) {
    if (byte > 0x7f) {
      throw invalidResponse("Native-frame multipart headers are not ASCII");
    }
    value += String.fromCharCode(byte);
  }
  return value;
}

function trimOws(value: string): string {
  return value.replace(/^[ \t]+|[ \t]+$/g, "");
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const result = new Uint8Array(first.byteLength + second.byteLength);
  result.set(first, 0);
  result.set(second, first.byteLength);
  return result;
}

function startsWith(haystack: Uint8Array, needle: Uint8Array, offset: number): boolean {
  if (offset < 0 || offset + needle.byteLength > haystack.byteLength) {
    return false;
  }
  for (let index = 0; index < needle.byteLength; index += 1) {
    if (haystack[offset + index] !== needle[index]) {
      return false;
    }
  }
  return true;
}

function indexOf(haystack: Uint8Array, needle: Uint8Array, from: number): number {
  if (needle.byteLength === 0) {
    return from;
  }
  let index = haystack.indexOf(needle[0], from);
  while (index >= 0) {
    if (startsWith(haystack, needle, index)) {
      return index;
    }
    index = haystack.indexOf(needle[0], index + 1);
  }
  return -1;
}
