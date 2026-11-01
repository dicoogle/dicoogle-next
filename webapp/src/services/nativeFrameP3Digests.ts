export const NATIVE_FRAME_P3_DIGEST_LIMIT = 16;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 is unavailable for P3 frame digests");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as BufferSource,
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export async function computeNativeFrameP3Digest(
  bytes: Uint8Array,
): Promise<string> {
  return sha256Hex(bytes);
}

/**
 * Bounded LRU map of frame-number -> expected SHA-256. The expected digest is
 * always supplied by the session/request side; a digest read from the stored
 * OPFS file is never used as the expected value.
 */
export class NativeFrameP3DigestMap {
  private readonly entries = new Map<number, string>();

  constructor(readonly limit = NATIVE_FRAME_P3_DIGEST_LIMIT) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new Error("P3 digest limit must be a positive integer");
    }
  }

  get size(): number {
    return this.entries.size;
  }

  get(frameNumber: number): string | null {
    const digest = this.entries.get(frameNumber);
    if (digest === undefined) {
      return null;
    }
    this.entries.delete(frameNumber);
    this.entries.set(frameNumber, digest);
    return digest;
  }

  set(frameNumber: number, digest: string): void {
    this.entries.delete(frameNumber);
    this.entries.set(frameNumber, digest);
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
  }

  delete(frameNumber: number): void {
    this.entries.delete(frameNumber);
  }

  clear(): void {
    this.entries.clear();
  }
}
