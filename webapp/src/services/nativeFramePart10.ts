import {
  invalidRequest,
  NATIVE_FRAME_TRANSFER_SYNTAX_UID,
  WRAPPED_SINGLE_FRAME_REPRESENTATION,
  type NativeFrameContext,
  type NativeFrameLocator,
  type WrappedSingleFrame,
  validateNativeFrameContext,
  validateNativeFrameLocator,
} from "./nativeFrameContract";

const IMPLEMENTATION_CLASS_UID = "1.2.826.0.1.3680043.10.5432.1";
const IMPLEMENTATION_VERSION_NAME = "DICNXT_WEB_02C";
const LONG_LENGTH_VRS = new Set(["OB", "OW", "OF", "SQ", "UT", "UN"]);

export function buildWrappedSingleFramePart10(
  locator: NativeFrameLocator,
  context: NativeFrameContext,
  pixels: Uint8Array,
): WrappedSingleFrame {
  validateNativeFrameLocator(locator);
  validateNativeFrameContext(context);
  if (pixels.byteLength !== context.frameSizeBytes) {
    throw invalidRequest("Native-frame payload length does not match the expected frame size");
  }

  const meta = new LeWriter();
  writeElement(meta, 0x0002, 0x0001, "OB", new Uint8Array([0, 1]));
  writeElement(meta, 0x0002, 0x0002, "UI", uiValue(context.sopClassUID));
  writeElement(meta, 0x0002, 0x0003, "UI", uiValue(locator.sopInstanceUID));
  writeElement(
    meta,
    0x0002,
    0x0010,
    "UI",
    uiValue(NATIVE_FRAME_TRANSFER_SYNTAX_UID),
  );
  writeElement(meta, 0x0002, 0x0012, "UI", uiValue(IMPLEMENTATION_CLASS_UID));
  writeElement(
    meta,
    0x0002,
    0x0013,
    "SH",
    textValue(IMPLEMENTATION_VERSION_NAME),
  );
  const metaBytes = meta.finish();

  const output = new LeWriter();
  output.zeros(128);
  output.ascii("DICM");
  writeElement(output, 0x0002, 0x0000, "UL", ulValue(metaBytes.byteLength));
  output.push(metaBytes);

  writeElement(output, 0x0008, 0x0016, "UI", uiValue(context.sopClassUID));
  writeElement(output, 0x0008, 0x0018, "UI", uiValue(locator.sopInstanceUID));
  writeElement(output, 0x0020, 0x000d, "UI", uiValue(locator.studyInstanceUID));
  writeElement(output, 0x0020, 0x000e, "UI", uiValue(locator.seriesInstanceUID));
  writeElement(output, 0x0028, 0x0002, "US", usValue(context.samplesPerPixel));
  writeElement(
    output,
    0x0028,
    0x0004,
    "CS",
    textValue(context.photometricInterpretation),
  );
  writeElement(output, 0x0028, 0x0008, "IS", textValue("1"));
  writeElement(output, 0x0028, 0x0010, "US", usValue(context.rows));
  writeElement(output, 0x0028, 0x0011, "US", usValue(context.columns));
  writeElement(output, 0x0028, 0x0100, "US", usValue(context.bitsAllocated));
  writeElement(output, 0x0028, 0x0101, "US", usValue(context.bitsStored));
  writeElement(output, 0x0028, 0x0102, "US", usValue(context.highBit));
  writeElement(
    output,
    0x0028,
    0x0103,
    "US",
    usValue(context.pixelRepresentation),
  );
  writeElement(
    output,
    0x7fe0,
    0x0010,
    context.bitsAllocated <= 8 ? "OB" : "OW",
    padEven(pixels, 0),
  );

  const bytes = output.finish();
  return {
    representation: WRAPPED_SINGLE_FRAME_REPRESENTATION,
    bytes,
    blob: new Blob([toArrayBuffer(bytes)], { type: "application/dicom" }),
  };
}

class LeWriter {
  private readonly chunks: Uint8Array[] = [];
  private total = 0;

  push(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.total += bytes.byteLength;
  }

  zeros(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw invalidRequest("Invalid DICOM byte count");
    }
    this.push(new Uint8Array(count));
  }

  ascii(value: string): void {
    this.push(asciiBytes(value));
  }

  u16(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) {
      throw invalidRequest("DICOM US value is out of range");
    }
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
      throw invalidRequest("DICOM UL value is out of range");
    }
    this.push(
      new Uint8Array([
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
      ]),
    );
  }

  finish(): Uint8Array {
    const bytes = new Uint8Array(this.total);
    let offset = 0;
    for (const chunk of this.chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
}

function writeElement(
  writer: LeWriter,
  group: number,
  element: number,
  vr: string,
  value: Uint8Array,
): void {
  if (value.byteLength % 2 !== 0) {
    throw invalidRequest("DICOM element value must have even length");
  }
  writer.u16(group);
  writer.u16(element);
  writer.ascii(vr);
  if (LONG_LENGTH_VRS.has(vr)) {
    writer.u16(0);
    writer.u32(value.byteLength);
  } else {
    if (value.byteLength > 0xffff) {
      throw invalidRequest("DICOM element value exceeds the short length limit");
    }
    writer.u16(value.byteLength);
  }
  writer.push(value);
}

function uiValue(value: string): Uint8Array {
  return padEven(asciiBytes(value), 0);
}

function textValue(value: string): Uint8Array {
  return padEven(asciiBytes(value), 0x20);
}

function usValue(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) {
    throw invalidRequest("DICOM US value is out of range");
  }
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function ulValue(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw invalidRequest("DICOM UL value is out of range");
  }
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function padEven(value: Uint8Array, paddingByte: number): Uint8Array {
  if (value.byteLength % 2 === 0) {
    return value.slice();
  }
  const padded = new Uint8Array(value.byteLength + 1);
  padded.set(value, 0);
  padded[value.byteLength] = paddingByte;
  return padded;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (!(bytes.buffer instanceof ArrayBuffer)) {
    throw invalidRequest("DICOM wrapper buffer is not an ArrayBuffer");
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function asciiBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code > 0x7f) {
      throw invalidRequest("DICOM wrapper values must be ASCII");
    }
    bytes[index] = code;
  }
  return bytes;
}
