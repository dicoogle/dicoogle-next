import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import {
  ENHANCED_MR_IMAGE_STORAGE_SOP_CLASS_UID,
  MULTIFRAME_GRAYSCALE_WORD_SC_SOP_CLASS_UID,
  NATIVE_FRAME_TRANSFER_SYNTAX_UID,
  validateNativeFrameContext,
  type NativeFrameContext,
  type NativeFrameLocator,
} from "../src/services/nativeFrameContract";
import { deriveNativeFrameBudgets } from "../src/services/nativeFrameBudget";
import {
  computeNativeFrameP3Digest,
  NATIVE_FRAME_P3_DIGEST_LIMIT,
  NativeFrameP3DigestMap,
} from "../src/services/nativeFrameP3Digests";
import { resolveNativeFrameP3Enabled } from "../src/services/nativeFrameFeatureFlags";
import { deriveNativeFrameSourceIdentity } from "../src/services/nativeFrameSourceIdentity";

const locator: NativeFrameLocator = {
  studyInstanceUID: "1.2.826.0.1.3680043.2.1125.100.1",
  seriesInstanceUID: "1.2.826.0.1.3680043.2.1125.100.1.1",
  sopInstanceUID: "1.2.826.0.1.3680043.2.1125.100.1.1.1",
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
  frameSizeBytes: 8192,
};

test("frame-size budgets preserve fixture values and scale for 512x512", () => {
  const fixture = deriveNativeFrameBudgets(8192);
  assert.equal(fixture.cache.maxTotalNativeBytes, 32 * 1024);
  assert.equal(fixture.cache.maxEntryNativeBytes, 8192);
  assert.equal(fixture.dual.ram.maxNativeBytes, 32 * 1024);
  assert.equal(fixture.dual.opfs.maxNativeBytes, 64 * 1024);
  assert.equal(fixture.dual.maxOpfsRootFileBytes, 128 * 1024);
  assert.equal(fixture.opfs.maxCommittedNativeBytes, 64 * 1024);
  assert.equal(fixture.opfs.maxPendingNativeBytes, 16 * 1024);

  const large = deriveNativeFrameBudgets(524288);
  assert.equal(large.cache.maxEntryNativeBytes, 524288);
  assert.equal(large.cache.maxTotalNativeBytes, 4 * 524288);
  assert.equal(large.dual.opfs.maxNativeBytes, 8 * 524288);
  assert.equal(large.dual.maxOpfsRootFileBytes, 16 * 524288);
  assert.equal(large.opfs.maxPendingNativeBytes, 2 * 524288);
  assert.equal(large.cache.maxEntries, 5);
  assert.equal(large.dual.opfs.maxEntries, 8);
});

test("source identity differs by instance and is stable for equal metadata", async () => {
  const first = await deriveNativeFrameSourceIdentity({ locator, context });
  const again = await deriveNativeFrameSourceIdentity({ locator, context });
  const second = await deriveNativeFrameSourceIdentity({
    locator: { ...locator, sopInstanceUID: `${locator.sopInstanceUID}.2` },
    context,
  });
  assert.equal(first, again);
  assert.notEqual(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test("Enhanced MR profile and unlisted SOP class validation", () => {
  const enhanced: NativeFrameContext = {
    ...context,
    sopClassUID: ENHANCED_MR_IMAGE_STORAGE_SOP_CLASS_UID,
    rows: 512,
    columns: 512,
    numberOfFrames: 30,
    frameSizeBytes: 524288,
  };
  assert.doesNotThrow(() => validateNativeFrameContext(enhanced));
  assert.throws(
    () =>
      validateNativeFrameContext({
        ...enhanced,
        sopClassUID: "1.2.840.10008.5.1.4.1.1.6",
      }),
    /Unsupported SOP class/,
  );
});

test("P3 digest map is bounded, LRU, and clearable", () => {
  const map = new NativeFrameP3DigestMap();
  for (let frame = 1; frame <= NATIVE_FRAME_P3_DIGEST_LIMIT + 1; frame += 1) {
    map.set(frame, `${frame}`.padStart(64, "0"));
  }
  assert.equal(map.size, NATIVE_FRAME_P3_DIGEST_LIMIT);
  assert.equal(map.get(1), null);
  assert.notEqual(map.get(2), null);
  map.get(2);
  map.set(NATIVE_FRAME_P3_DIGEST_LIMIT + 2, "x");
  assert.equal(map.size, NATIVE_FRAME_P3_DIGEST_LIMIT);
  map.clear();
  assert.equal(map.size, 0);
});

test("P3 digest is SHA-256 hex and the flag is explicit", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const digest = await computeNativeFrameP3Digest(bytes);
  const expected = Array.from(
    new Uint8Array(
      await webcrypto.subtle.digest("SHA-256", bytes as unknown as BufferSource),
    ),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
  assert.equal(digest, expected);
  assert.equal(resolveNativeFrameP3Enabled("true"), true);
  assert.equal(resolveNativeFrameP3Enabled(undefined), false);
  assert.equal(resolveNativeFrameP3Enabled("false"), false);
});
