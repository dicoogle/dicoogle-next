import {
  DEFAULT_NATIVE_RAM_CACHE_LIMITS,
  type NativeRamCacheLimits,
} from "./nativeRamCache";
import {
  DEFAULT_NATIVE_FRAME_DUAL_WINDOW_LIMITS,
  type NativeFrameDualWindowLimits,
} from "./nativeFrameDualWindowPolicy";
import {
  DEFAULT_NATIVE_FRAME_PLAINTEXT_OPFS_LIMITS,
  type NativeFramePlaintextOpfsLimits,
} from "./nativeFramePlaintextOpfs";

const MIB = 1024 * 1024;
const ABSOLUTE_BYTE_CEILING = 16 * MIB;
const RAM_ENTRIES = 5;
const OPFS_ENTRIES = 8;

export interface NativeFrameBudgetSet {
  readonly cache: NativeRamCacheLimits;
  readonly dual: NativeFrameDualWindowLimits;
  readonly opfs: NativeFramePlaintextOpfsLimits;
}

function scaled(frameSizeBytes: number, factor: number): number {
  return Math.min(frameSizeBytes * factor, ABSOLUTE_BYTE_CEILING);
}

export function deriveNativeFrameBudgets(
  frameSizeBytes: number,
): NativeFrameBudgetSet {
  if (!Number.isSafeInteger(frameSizeBytes) || frameSizeBytes < 1) {
    throw new Error("Frame size must be a positive integer");
  }
  if (frameSizeBytes > ABSOLUTE_BYTE_CEILING) {
    throw new Error("Frame size exceeds the supported native-frame bound");
  }
  const ramTotal = scaled(frameSizeBytes, 4);
  const opfsCommitted = scaled(frameSizeBytes, 8);
  const opfsRoot = scaled(frameSizeBytes, 16);
  const pending = scaled(frameSizeBytes, 2);
  return Object.freeze({
    cache: Object.freeze({
      ...DEFAULT_NATIVE_RAM_CACHE_LIMITS,
      maxTotalNativeBytes: ramTotal,
      maxEntryNativeBytes: frameSizeBytes,
      maxEntries: RAM_ENTRIES,
    }),
    dual: Object.freeze({
      ram: Object.freeze({
        ...DEFAULT_NATIVE_FRAME_DUAL_WINDOW_LIMITS.ram,
        maxNativeBytes: ramTotal,
        maxEntryNativeBytes: frameSizeBytes,
        maxEntries: RAM_ENTRIES,
      }),
      opfs: Object.freeze({
        ...DEFAULT_NATIVE_FRAME_DUAL_WINDOW_LIMITS.opfs,
        maxNativeBytes: opfsCommitted,
        maxEntryNativeBytes: frameSizeBytes,
        maxEntries: OPFS_ENTRIES,
      }),
      maxOpfsRootFileBytes: opfsRoot,
    }),
    opfs: Object.freeze({
      ...DEFAULT_NATIVE_FRAME_PLAINTEXT_OPFS_LIMITS,
      maxCommittedNativeBytes: opfsCommitted,
      maxEntryNativeBytes: frameSizeBytes,
      maxRootFileBytes: opfsRoot,
      maxPendingNativeBytes: pending,
    }),
  });
}
