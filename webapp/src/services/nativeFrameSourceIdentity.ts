import {
  NATIVE_FRAME_REPRESENTATION,
  type NativeFrameContext,
  type NativeFrameLocator,
} from "./nativeFrameContract";

export interface NativeFrameSourceIdentityInput {
  readonly locator: NativeFrameLocator;
  readonly context: NativeFrameContext;
}

function canonicalSourceIdentity(input: NativeFrameSourceIdentityInput): string {
  const { locator, context } = input;
  return JSON.stringify([
    "native-frame-source-v1",
    locator.studyInstanceUID,
    locator.seriesInstanceUID,
    locator.sopInstanceUID,
    context.sopClassUID,
    context.transferSyntaxUID,
    context.rows,
    context.columns,
    context.samplesPerPixel,
    context.photometricInterpretation,
    context.bitsAllocated,
    context.bitsStored,
    context.highBit,
    context.pixelRepresentation,
    context.numberOfFrames,
    context.frameSizeBytes,
    NATIVE_FRAME_REPRESENTATION,
  ]);
}

async function sha256Hex(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 is unavailable for source identity");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export async function deriveNativeFrameSourceIdentity(
  input: NativeFrameSourceIdentityInput,
): Promise<string> {
  return sha256Hex(canonicalSourceIdentity(input));
}
