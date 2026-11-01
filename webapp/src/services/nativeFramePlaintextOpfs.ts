import {
  createNativeFrameCacheKey,
  type NativeFrameCacheKey,
} from "./nativeRamCache";

export const NATIVE_FRAME_PLAINTEXT_OPFS_APP_ROOT = "dicoogle-next";
export const NATIVE_FRAME_PLAINTEXT_OPFS_ROOT = "native-frame-p3-v1";
export const NATIVE_FRAME_PLAINTEXT_OPFS_FORMAT_VERSION = 1;
export const NATIVE_FRAME_PLAINTEXT_OPFS_MAGIC = "NFOPFS1\n";
export const NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES = 80;
export const NATIVE_FRAME_PLAINTEXT_OPFS_LEASE_FILE = "lease.json";
export const NATIVE_FRAME_PLAINTEXT_OPFS_EVENT_CAPACITY = 64;

const SAFE_TOKEN = /^[A-Za-z0-9._-]+$/;
const MAX_TOKEN_LENGTH = 96;
const MAX_ALIAS_LENGTH = 64;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export interface NativeFramePlaintextOpfsLimits {
  readonly maxCommittedNativeBytes: number;
  readonly maxEntryNativeBytes: number;
  readonly maxEntries: number;
  readonly maxRootFileBytes: number;
  readonly maxHeaderBytes: number;
  readonly maxLeaseBytes: number;
  readonly maxQueuedWrites: number;
  readonly maxPendingNativeBytes: number;
  readonly maxScanNamespaces: number;
  readonly maxScanEntries: number;
  readonly eventCapacity: number;
  readonly leaseTtlMs: number;
  readonly leaseHeartbeatMs: number;
}

export const DEFAULT_NATIVE_FRAME_PLAINTEXT_OPFS_LIMITS: Readonly<NativeFramePlaintextOpfsLimits> =
  Object.freeze({
    maxCommittedNativeBytes: 64 * 1024,
    maxEntryNativeBytes: 8 * 1024,
    maxEntries: 8,
    maxRootFileBytes: 128 * 1024,
    maxHeaderBytes: NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES,
    maxLeaseBytes: 1024,
    maxQueuedWrites: 1,
    maxPendingNativeBytes: 16 * 1024,
    maxScanNamespaces: 32,
    maxScanEntries: 64,
    eventCapacity: NATIVE_FRAME_PLAINTEXT_OPFS_EVENT_CAPACITY,
    leaseTtlMs: 5 * 60 * 1000,
    leaseHeartbeatMs: 30 * 1000,
  });

export interface NativeFramePlaintextOpfsCapabilities {
  readonly opfs: boolean;
  readonly writable: boolean;
  readonly locks: boolean;
  readonly subtle: boolean;
  readonly move: boolean;
}

export interface NativeFramePlaintextOpfsWritable {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

export interface NativeFramePlaintextOpfsFileData {
  readonly size: number;
  slice(start?: number, end?: number): {
    arrayBuffer(): Promise<ArrayBuffer>;
  };
  text?(): Promise<string>;
}

export interface NativeFramePlaintextOpfsFileHandle {
  readonly kind?: "file";
  getFile(): Promise<NativeFramePlaintextOpfsFileData>;
  createWritable(): Promise<NativeFramePlaintextOpfsWritable>;
  move?(name: string): Promise<void>;
}

export interface NativeFramePlaintextOpfsDirectoryHandle {
  readonly kind?: "directory";
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<NativeFramePlaintextOpfsDirectoryHandle>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<NativeFramePlaintextOpfsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterableIterator<
    [
      string,
      | NativeFramePlaintextOpfsDirectoryHandle
      | NativeFramePlaintextOpfsFileHandle,
    ]
  >;
}

export interface NativeFramePlaintextOpfsLock {
  release(): void;
}

export interface NativeFramePlaintextOpfsLockManager {
  readonly supported: boolean;
  acquire(name: string): Promise<NativeFramePlaintextOpfsLock | null>;
}

export type NativeFramePlaintextOpfsReason =
  | "unsupported"
  | "not-open"
  | "closed"
  | "namespace-busy"
  | "namespace-unproven"
  | "namespace-cleared"
  | "lease-expired"
  | "lease-missing"
  | "lease-write-failed"
  | "digest-unavailable"
  | "digest-missing"
  | "digest-mismatch"
  | "move-unavailable"
  | "write-in-flight"
  | "busy"
  | "size-mismatch"
  | "context-mismatch"
  | "header-invalid"
  | "checksum-mismatch"
  | "invalid-key"
  | "invalid-bytes"
  | "entry-oversize"
  | "committed-cap"
  | "entries-cap"
  | "root-cap"
  | "queue-full"
  | "pending-cap"
  | "write-failed"
  | "read-failed"
  | "delete-failed"
  | "quota-exceeded"
  | "aborted"
  | "stale-owner"
  | "stale-generation"
  | "scan-limit"
  | "recovery-skipped"
  | "write-pending"
  | "missing";

export type NativeFramePlaintextOpfsStatus =
  | "opened"
  | "hit"
  | "miss"
  | "stored"
  | "replaced"
  | "deleted"
  | "cleared"
  | "skipped"
  | "unavailable"
  | "quota"
  | "invalid"
  | "failed"
  | "idle"
  | "drained"
  | "timeout"
  | "closed";

export interface NativeFramePlaintextOpfsOpenResult {
  readonly status: "opened" | "unavailable" | "failed";
  readonly reason?: NativeFramePlaintextOpfsReason;
  readonly capabilities: NativeFramePlaintextOpfsCapabilities;
  readonly snapshot?: NativeFramePlaintextOpfsSnapshot;
}

export interface NativeFramePlaintextOpfsGetResult {
  readonly status: "hit" | "miss" | "skipped" | "unavailable" | "invalid" | "failed";
  readonly reason?: NativeFramePlaintextOpfsReason;
  readonly bytes?: Uint8Array;
  readonly entryAlias?: string;
  readonly nativeBytes?: number;
  readonly verified?: boolean;
}

export interface NativeFramePlaintextOpfsPutResult {
  readonly status:
    | "stored"
    | "replaced"
    | "skipped"
    | "unavailable"
    | "quota"
    | "invalid"
    | "failed";
  readonly reason?: NativeFramePlaintextOpfsReason;
  readonly entryAlias?: string;
  readonly nativeBytes?: number;
  readonly fileBytes?: number;
}

export interface NativeFramePlaintextOpfsDeleteResult {
  readonly status:
    | "deleted"
    | "miss"
    | "skipped"
    | "unavailable"
    | "invalid"
    | "failed";
  readonly reason?: NativeFramePlaintextOpfsReason;
  readonly entryAlias?: string;
  readonly nativeBytes?: number;
}

export interface NativeFramePlaintextOpfsClearResult {
  readonly status: "cleared" | "unavailable" | "failed";
  readonly reason?: NativeFramePlaintextOpfsReason;
  readonly clearedEntries: number;
  readonly clearedNativeBytes: number;
  readonly failedEntries: number;
  readonly failedFileBytes: number;
}

export interface NativeFramePlaintextOpfsDrainResult {
  readonly status: "idle" | "drained" | "timeout" | "failed";
  readonly reason?: NativeFramePlaintextOpfsReason;
}

export interface NativeFramePlaintextOpfsCloseResult {
  readonly status: "closed" | "failed";
  readonly reason?: NativeFramePlaintextOpfsReason;
}

export interface NativeFramePlaintextOpfsRecoveryResult {
  readonly status: "ok" | "skipped" | "partial" | "failed";
  readonly reason?: NativeFramePlaintextOpfsReason;
  readonly scannedNamespaces: number;
  readonly deletedNamespaces: number;
  readonly deletedTempFiles: number;
  readonly skippedNamespaces: number;
  readonly errors: number;
}

export type NativeFramePlaintextOpfsEntryState =
  | "committed"
  | "writing"
  | "deleting"
  | "error";

export interface NativeFramePlaintextOpfsSnapshotEntry {
  readonly alias: string;
  readonly state: NativeFramePlaintextOpfsEntryState;
  readonly nativeBytes: number;
  readonly fileBytes: number;
}

export interface NativeFramePlaintextOpfsLeaseState {
  readonly state: "live" | "expired" | "missing" | "unproven";
  readonly updatedAt: number | null;
}

export interface NativeFramePlaintextOpfsSnapshot {
  readonly storeId: string;
  readonly revision: number;
  readonly sequence: number;
  readonly oldestSequence: number | null;
  readonly droppedEventCount: number;
  readonly open: boolean;
  readonly capabilities: NativeFramePlaintextOpfsCapabilities;
  readonly entries: readonly NativeFramePlaintextOpfsSnapshotEntry[];
  readonly truncated: boolean;
  readonly committedEntries: number;
  readonly committedNativeBytes: number;
  readonly committedFileBytes: number;
  readonly pendingWrites: number;
  readonly pendingNativeBytes: number;
  readonly reservedFileBytes: number;
  readonly queuedWrites: number;
  readonly rootFileBytes: number;
  readonly tempFileBytes: number;
  readonly failedDeleteBytes: number;
  readonly lease: NativeFramePlaintextOpfsLeaseState;
  readonly limits: NativeFramePlaintextOpfsLimits;
}

export type NativeFramePlaintextOpfsEventType =
  | "queued"
  | "writing"
  | "committed"
  | "invalidated"
  | "deleting"
  | "deleted"
  | "rejected"
  | "error"
  | "cleared";

export interface NativeFramePlaintextOpfsEvent {
  readonly sequence: number;
  readonly revision: number;
  readonly type: NativeFramePlaintextOpfsEventType;
  readonly entryAlias: string | null;
  readonly nativeBytes: number;
  readonly fileBytes: number;
  readonly reason?: NativeFramePlaintextOpfsReason;
}

export interface NativeFramePlaintextOpfsEventBatch {
  readonly storeId: string;
  readonly afterSequence: number;
  readonly oldestSequence: number | null;
  readonly latestSequence: number;
  readonly revision: number;
  readonly events: readonly NativeFramePlaintextOpfsEvent[];
  readonly droppedEventCount: number;
  readonly resynchronize: boolean;
}

export interface NativeFramePlaintextOpfsOptions {
  readonly namespaceId: string;
  readonly ownerId: string;
  readonly generation: number;
  readonly storage?: NativeFramePlaintextOpfsDirectoryHandle;
  readonly limits?: Partial<NativeFramePlaintextOpfsLimits>;
  readonly now?: () => number;
  readonly subtle?: SubtleCrypto | null;
  readonly locks?: NativeFramePlaintextOpfsLockManager;
  readonly aliasFactory?: () => string;
  readonly moveSupported?: boolean;
  readonly maintenanceTimeoutMs?: number;
}

interface LeaseRecord {
  readonly version: 1;
  readonly ownerId: string;
  readonly generation: number;
  readonly openedAt: number;
  readonly updatedAt: number;
}

interface EntryRecord {
  readonly alias: string;
  readonly fingerprint: string;
  readonly key: NativeFrameCacheKey;
  readonly fileName: string;
  nativeBytes: number;
  fileBytes: number;
  payloadDigestHex: string;
  state: NativeFramePlaintextOpfsEntryState;
}

interface WriteJob {
  readonly alias: string;
  readonly key: NativeFrameCacheKey;
  readonly fingerprint: string;
  readonly payload: Uint8Array;
  readonly contextDigest: Uint8Array;
  readonly payloadDigest: Uint8Array;
  readonly expectedDigest: string;
  readonly fileBytes: number;
  readonly ownerEpoch: number;
  readonly replacement: boolean;
  readonly signal?: AbortSignal;
  resolve: (result: NativeFramePlaintextOpfsPutResult) => void;
  cancelled: boolean;
  materialized: boolean;
}

interface RootScan {
  readonly ok: boolean;
  readonly reason?: NativeFramePlaintextOpfsReason;
  readonly totalBytes: number;
  readonly namespaces: number;
  readonly entries: number;
  readonly ownFileBytes: number;
  readonly ownTempBytes: number;
  readonly ownCommittedBytes: number;
}

interface HeaderData {
  readonly payloadBytes: number;
  readonly contextDigest: Uint8Array;
  readonly payloadChecksum: Uint8Array;
}

let defaultAliasSequence = 0;

function defaultAlias(): string {
  const bytes = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
      "",
    );
  }
  defaultAliasSequence += 1;
  return `a${defaultAliasSequence.toString(16).padStart(15, "0")}`;
}

function assertToken(value: string, what: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_TOKEN_LENGTH ||
    !SAFE_TOKEN.test(value) ||
    value.includes("..")
  ) {
    throw new Error(`Invalid ${what}`);
  }
  return value;
}

function assertAlias(value: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_ALIAS_LENGTH ||
    !SAFE_TOKEN.test(value) ||
    value.includes("..")
  ) {
    throw new Error("Invalid opaque alias");
  }
  return value;
}

function keyFingerprint(key: NativeFrameCacheKey): string {
  return [
    key.principalId,
    key.sessionId,
    key.studyInstanceUID,
    key.seriesInstanceUID,
    key.sopInstanceUID,
    String(key.frameNumber),
    key.representation,
    key.transferSyntaxUID,
    key.sourceVersion,
  ].join("\u0000");
}

function entryFileName(alias: string): string {
  return `e-${assertAlias(alias)}.bin`;
}

function tempFileName(alias: string): string {
  return `t-${assertAlias(alias)}.tmp`;
}

function leaseLockName(namespaceId: string): string {
  return `dicoogle-next/${NATIVE_FRAME_PLAINTEXT_OPFS_ROOT}/${namespaceId}`;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "NotFoundError"
  );
}

function isQuotaError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "QuotaExceededError"
  );
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function normalizeDigest(value: string): string {
  return value.trim().toLowerCase();
}

function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function buildHeader(
  payloadBytes: number,
  contextDigest: Uint8Array,
  payloadChecksum: Uint8Array,
): Uint8Array {
  const header = new Uint8Array(NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES);
  header.set(TEXT_ENCODER.encode(NATIVE_FRAME_PLAINTEXT_OPFS_MAGIC), 0);
  const view = new DataView(header.buffer);
  view.setUint16(8, NATIVE_FRAME_PLAINTEXT_OPFS_FORMAT_VERSION, false);
  view.setUint16(10, NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES, false);
  view.setUint32(12, payloadBytes, false);
  header.set(contextDigest, 16);
  header.set(payloadChecksum, 48);
  return header;
}

function parseHeader(bytes: Uint8Array): HeaderData | null {
  if (bytes.byteLength !== NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES) {
    return null;
  }
  const magic = TEXT_ENCODER.encode(NATIVE_FRAME_PLAINTEXT_OPFS_MAGIC);
  if (!equalBytes(bytes.slice(0, magic.byteLength), magic)) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint16(8, false) !==
      NATIVE_FRAME_PLAINTEXT_OPFS_FORMAT_VERSION ||
    view.getUint16(10, false) !== NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES
  ) {
    return null;
  }
  const payloadBytes = view.getUint32(12, false);
  if (!Number.isSafeInteger(payloadBytes) || payloadBytes < 1) {
    return null;
  }
  return {
    payloadBytes,
    contextDigest: bytes.slice(16, 48),
    payloadChecksum: bytes.slice(48, 80),
  };
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const output = new Uint8Array(left.byteLength + right.byteLength);
  output.set(left, 0);
  output.set(right, left.byteLength);
  return output;
}

function defaultLocks(): NativeFramePlaintextOpfsLockManager {
  const locks = globalThis.navigator?.locks;
  if (!locks || typeof locks.request !== "function") {
    return {
      supported: false,
      async acquire() {
        return null;
      },
    };
  }
  return {
    supported: true,
    acquire(name: string) {
      return new Promise<NativeFramePlaintextOpfsLock | null>((resolve) => {
        let releaseHeld: (() => void) | null = null;
        const held = new Promise<void>((release) => {
          releaseHeld = release;
        });
        locks
          .request(name, { ifAvailable: true }, async (lock) => {
            if (!lock) {
              resolve(null);
              return;
            }
            resolve({
              release() {
                releaseHeld?.();
              },
            });
            await held;
          })
          .catch(() => resolve(null));
      });
    },
  };
}

export class NativeFramePlaintextOpfs {
  private readonly namespaceId: string;
  private ownerId: string;
  private generation: number;
  private readonly storageOption?: NativeFramePlaintextOpfsDirectoryHandle;
  private readonly limits: NativeFramePlaintextOpfsLimits;
  private readonly now: () => number;
  private readonly subtle: SubtleCrypto | null;
  private readonly locks: NativeFramePlaintextOpfsLockManager;
  private readonly aliasFactory: () => string;
  private readonly storeId: string;
  private readonly moveSupportedOption?: boolean;
  private readonly maintenanceTimeoutMs: number;

  private rootDir: NativeFramePlaintextOpfsDirectoryHandle | null = null;
  private namespaceDir: NativeFramePlaintextOpfsDirectoryHandle | null = null;
  private lock: NativeFramePlaintextOpfsLock | null = null;
  private lease: LeaseRecord | null = null;
  private opened = false;
  private closed = false;
  private closing = false;
  private clearing = false;
  private ownerEpoch = 0;
  private activeJob: WriteJob | null = null;
  private queuedJobs: WriteJob[] = [];
  private pendingNativeBytes = 0;
  private unmaterializedFileBytes = 0;
  private idleWaiters: Array<() => void> = [];
  private revision = 0;
  private sequence = 0;
  private droppedEventCount = 0;
  private events: NativeFramePlaintextOpfsEvent[] = [];
  private rootFileBytes = 0;
  private tempFileBytes = 0;
  private failedDeleteBytes = 0;
  private lastLeaseWrite = 0;
  private readonly records = new Map<string, EntryRecord>();
  private readonly aliases = new Map<string, EntryRecord>();

  constructor(options: NativeFramePlaintextOpfsOptions) {
    this.namespaceId = assertToken(options.namespaceId, "namespace");
    this.ownerId = assertToken(options.ownerId, "owner");
    if (!Number.isSafeInteger(options.generation) || options.generation < 1) {
      throw new Error("Invalid owner generation");
    }
    this.generation = options.generation;
    this.storageOption = options.storage;
    this.limits = Object.freeze({
      ...DEFAULT_NATIVE_FRAME_PLAINTEXT_OPFS_LIMITS,
      ...(options.limits ?? {}),
    });
    this.now = options.now ?? (() => Date.now());
    this.subtle =
      options.subtle === undefined
        ? (globalThis.crypto?.subtle ?? null)
        : options.subtle;
    this.locks = options.locks ?? defaultLocks();
    this.aliasFactory = options.aliasFactory ?? defaultAlias;
    this.moveSupportedOption = options.moveSupported;
    this.maintenanceTimeoutMs = options.maintenanceTimeoutMs ?? 5000;
    if (
      !Number.isSafeInteger(this.maintenanceTimeoutMs) ||
      this.maintenanceTimeoutMs < 1
    ) {
      throw new Error("Invalid maintenance timeout");
    }
    this.storeId = `S-${this.aliasFactory()}`;
  }

  capabilities(): NativeFramePlaintextOpfsCapabilities {
    const opfs =
      !!this.storageOption ||
      (typeof globalThis.navigator !== "undefined" &&
        !!globalThis.navigator.storage?.getDirectory);
    const move =
      this.moveSupportedOption ??
      (() => {
        const handle = (globalThis as unknown as {
          FileSystemFileHandle?: { prototype?: { move?: unknown } };
        }).FileSystemFileHandle;
        return typeof handle?.prototype?.move === "function";
      })();
    return Object.freeze({
      opfs,
      writable: opfs,
      locks: this.locks.supported,
      subtle: !!this.subtle,
      move,
    });
  }

  async open(): Promise<NativeFramePlaintextOpfsOpenResult> {
    const capabilities = this.capabilities();
    if (this.closed) {
      return { status: "unavailable", reason: "closed", capabilities };
    }
    if (this.opened) {
      return {
        status: "opened",
        capabilities,
        snapshot: this.snapshot(),
      };
    }
    if (!capabilities.opfs) {
      return { status: "unavailable", reason: "unsupported", capabilities };
    }
    if (!capabilities.subtle) {
      return {
        status: "unavailable",
        reason: "digest-unavailable",
        capabilities,
      };
    }
    if (!capabilities.move) {
      return {
        status: "unavailable",
        reason: "move-unavailable",
        capabilities,
      };
    }

    let leaseExisted = false;
    try {
      if (this.locks.supported) {
        const lock = await this.locks.acquire(
          leaseLockName(this.namespaceId),
        );
        if (!lock) {
          return {
            status: "unavailable",
            reason: "namespace-busy",
            capabilities,
          };
        }
        this.lock = lock;
      }

      const storage: NativeFramePlaintextOpfsDirectoryHandle =
        this.storageOption ??
        ((await globalThis.navigator.storage.getDirectory()) as unknown as NativeFramePlaintextOpfsDirectoryHandle);
      const appRoot = await storage.getDirectoryHandle(
        NATIVE_FRAME_PLAINTEXT_OPFS_APP_ROOT,
        { create: true },
      );
      const root = await appRoot.getDirectoryHandle(
        NATIVE_FRAME_PLAINTEXT_OPFS_ROOT,
        { create: true },
      );
      this.rootDir = root;
      const namespaceDir = await root.getDirectoryHandle(this.namespaceId, {
        create: true,
      });
      this.namespaceDir = namespaceDir;

      const existingLease = await this.readLeaseFrom(namespaceDir);
      leaseExisted = !!existingLease;
      const namespaceHasFiles = await this.directoryHasFiles(namespaceDir);
      if (existingLease) {
        const sameOwner =
          existingLease.ownerId === this.ownerId &&
          existingLease.generation === this.generation;
        const expired =
          this.now() - existingLease.updatedAt > this.limits.leaseTtlMs;
        if (expired) {
          if (!this.lock) {
            this.releaseLock();
            return {
              status: "unavailable",
              reason: "namespace-unproven",
              capabilities,
            };
          }
          await this.clearNamespaceContents();
        } else if (!sameOwner) {
          this.releaseLock();
          return {
            status: "unavailable",
            reason: "namespace-busy",
            capabilities,
          };
        }
      } else if (namespaceHasFiles) {
        this.releaseLock();
        return {
          status: "unavailable",
          reason: "namespace-unproven",
          capabilities,
        };
      }

      await this.recoverOtherNamespaces();
      await this.deleteOwnTempFiles();
      const scan = await this.scanRoot();
      if (
        !scan.ok ||
        scan.totalBytes + this.limits.maxLeaseBytes >
          this.limits.maxRootFileBytes
      ) {
        this.releaseLock();
        return {
          status: "unavailable",
          reason: scan.ok ? "root-cap" : scan.reason,
          capabilities,
        };
      }
      try {
        await this.writeLease();
      } catch {
        if (!leaseExisted) {
          await this.removeLeaseEntry();
        }
        this.releaseLock();
        return {
          status: "failed",
          reason: "lease-write-failed",
          capabilities,
        };
      }
      this.rootFileBytes = scan.totalBytes;
      this.tempFileBytes = scan.ownTempBytes;
      this.opened = true;
      return {
        status: "opened",
        capabilities,
        snapshot: this.snapshot(),
      };
    } catch (error) {
      if (!leaseExisted) {
        await this.removeLeaseEntry();
      }
      this.releaseLock();
      return {
        status: "failed",
        reason: isQuotaError(error) ? "quota-exceeded" : "write-failed",
        capabilities,
      };
    }
  }

  async get(
    keyInput: NativeFrameCacheKey,
    expected: {
      readonly frameSizeBytes: number;
      readonly expectedDigest?: string;
    },
  ): Promise<NativeFramePlaintextOpfsGetResult> {
    if (!this.opened) {
      return { status: "unavailable", reason: "not-open" };
    }
    if (this.closed) {
      return { status: "unavailable", reason: "closed" };
    }
    let key: NativeFrameCacheKey;
    try {
      key = createNativeFrameCacheKey(keyInput);
    } catch {
      return { status: "invalid", reason: "invalid-key" };
    }
    if (
      !Number.isSafeInteger(expected.frameSizeBytes) ||
      expected.frameSizeBytes < 1 ||
      expected.frameSizeBytes > this.limits.maxEntryNativeBytes
    ) {
      return { status: "invalid", reason: "size-mismatch" };
    }
    if (!this.subtle) {
      return { status: "unavailable", reason: "digest-unavailable" };
    }
    if (!expected.expectedDigest) {
      return { status: "skipped", reason: "digest-missing" };
    }
    if (!isSha256Hex(normalizeDigest(expected.expectedDigest))) {
      return { status: "invalid", reason: "digest-mismatch" };
    }

    const record = this.records.get(keyFingerprint(key));
    if (!record || record.state !== "committed") {
      return { status: "miss" };
    }
    const dir = this.namespaceDir;
    if (!dir) {
      return { status: "unavailable", reason: "not-open" };
    }

    try {
      const handle = await dir.getFileHandle(record.fileName, {
        create: false,
      });
      const file = await handle.getFile();
      const expectedFileBytes =
        NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES + expected.frameSizeBytes;
      if (file.size !== expectedFileBytes) {
        await this.markInvalid(record, "size-mismatch");
        return { status: "invalid", reason: "size-mismatch" };
      }
      const headerBytes = new Uint8Array(
        await file
          .slice(0, NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES)
          .arrayBuffer(),
      );
      const header = parseHeader(headerBytes);
      if (!header) {
        await this.markInvalid(record, "header-invalid");
        return { status: "invalid", reason: "header-invalid" };
      }
      if (header.payloadBytes !== expected.frameSizeBytes) {
        await this.markInvalid(record, "size-mismatch");
        return { status: "invalid", reason: "size-mismatch" };
      }
      const expectedContext = await this.contextDigest(key);
      if (!equalBytes(header.contextDigest, expectedContext)) {
        await this.markInvalid(record, "context-mismatch");
        return { status: "invalid", reason: "context-mismatch" };
      }
      const payloadBytes = new Uint8Array(
        await file
          .slice(
            NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES,
            NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES + header.payloadBytes,
          )
          .arrayBuffer(),
      );
      if (payloadBytes.byteLength !== header.payloadBytes) {
        await this.markInvalid(record, "size-mismatch");
        return { status: "invalid", reason: "size-mismatch" };
      }
      const checksum = await this.sha256(payloadBytes);
      if (!equalBytes(checksum, header.payloadChecksum)) {
        await this.markInvalid(record, "checksum-mismatch");
        return { status: "invalid", reason: "checksum-mismatch" };
      }
      if (toHex(checksum) !== normalizeDigest(expected.expectedDigest)) {
        await this.markInvalid(record, "digest-mismatch");
        return { status: "invalid", reason: "digest-mismatch" };
      }
      return {
        status: "hit",
        bytes: payloadBytes,
        entryAlias: record.alias,
        nativeBytes: payloadBytes.byteLength,
        verified: true,
      };
    } catch (error) {
      if (isNotFound(error)) {
        this.removeRecord(record, false);
        this.emit("invalidated", record, "missing");
        this.emit("deleted", record, "missing");
        return { status: "miss", reason: "missing" };
      }
      return {
        status: "failed",
        reason: isQuotaError(error) ? "quota-exceeded" : "read-failed",
      };
    }
  }

  async put(
    keyInput: NativeFrameCacheKey,
    bytes: Uint8Array,
    expected: {
      readonly frameSizeBytes: number;
      readonly expectedDigest?: string;
      readonly signal?: AbortSignal;
    },
  ): Promise<NativeFramePlaintextOpfsPutResult> {
    if (!this.opened) {
      return { status: "unavailable", reason: "not-open" };
    }
    if (this.closed) {
      return { status: "unavailable", reason: "closed" };
    }
    if (this.closing || this.clearing) {
      return { status: "unavailable", reason: "write-in-flight" };
    }
    if (expected.signal?.aborted) {
      return this.rejectPut({ status: "skipped", reason: "aborted" });
    }
    let key: NativeFrameCacheKey;
    try {
      key = createNativeFrameCacheKey(keyInput);
    } catch {
      return this.rejectPut({ status: "invalid", reason: "invalid-key" });
    }
    if (
      !Number.isSafeInteger(expected.frameSizeBytes) ||
      expected.frameSizeBytes < 1 ||
      bytes.byteLength !== expected.frameSizeBytes ||
      bytes.byteLength > this.limits.maxEntryNativeBytes
    ) {
      return this.rejectPut({ status: "invalid", reason: "size-mismatch" });
    }
    if (!this.subtle) {
      return { status: "unavailable", reason: "digest-unavailable" };
    }
    if (!expected.expectedDigest) {
      return this.rejectPut({ status: "skipped", reason: "digest-missing" });
    }
    if (!isSha256Hex(normalizeDigest(expected.expectedDigest))) {
      return this.rejectPut({ status: "invalid", reason: "digest-mismatch" });
    }

    const payload = bytes.slice();
    const payloadDigest = await this.sha256(payload);
    if (toHex(payloadDigest) !== normalizeDigest(expected.expectedDigest)) {
      return this.rejectPut({ status: "invalid", reason: "digest-mismatch" });
    }
    const contextDigest = await this.contextDigest(key);
    const fingerprint = keyFingerprint(key);
    const existing = this.records.get(fingerprint);
    if (existing && existing.state !== "committed") {
      return this.rejectPut({ status: "skipped", reason: "write-pending" });
    }
    if (
      (this.activeJob ? 1 : 0) + this.queuedJobs.length >=
      1 + this.limits.maxQueuedWrites
    ) {
      return this.rejectPut({ status: "skipped", reason: "queue-full" });
    }
    if (
      this.pendingNativeBytes + payload.byteLength >
      this.limits.maxPendingNativeBytes
    ) {
      return this.rejectPut({ status: "skipped", reason: "pending-cap" });
    }

    const projectedCommitted =
      (existing
        ? this.committedNativeBytes() - existing.nativeBytes
        : this.committedNativeBytes()) +
      this.pendingNativeBytes +
      payload.byteLength;
    if (projectedCommitted > this.limits.maxCommittedNativeBytes) {
      return this.rejectPut({ status: "skipped", reason: "committed-cap" });
    }
    const pendingEntries = (this.activeJob ? 1 : 0) + this.queuedJobs.length;
    if (
      (!existing && this.records.size + pendingEntries >= this.limits.maxEntries) ||
      (existing && this.records.size + pendingEntries > this.limits.maxEntries)
    ) {
      return this.rejectPut({ status: "skipped", reason: "entries-cap" });
    }

    const scan = await this.scanRoot();
    if (!scan.ok) {
      return this.rejectPut({ status: "unavailable", reason: scan.reason });
    }
    const fileBytes =
      NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES + payload.byteLength;
    if (
      scan.totalBytes + this.unmaterializedFileBytes + fileBytes >
      this.limits.maxRootFileBytes
    ) {
      return this.rejectPut({ status: "skipped", reason: "root-cap" });
    }

    const alias = assertAlias(this.aliasFactory());
    const job: WriteJob = {
      alias,
      key,
      fingerprint,
      payload,
      contextDigest,
      payloadDigest,
      expectedDigest: normalizeDigest(expected.expectedDigest),
      fileBytes,
      ownerEpoch: this.ownerEpoch,
      replacement: !!existing,
      signal: expected.signal,
      resolve: () => undefined,
      cancelled: false,
      materialized: false,
    };
    this.pendingNativeBytes += payload.byteLength;
    this.unmaterializedFileBytes += fileBytes;
    const result = new Promise<NativeFramePlaintextOpfsPutResult>((resolve) => {
      job.resolve = resolve;
    });
    this.queuedJobs.push(job);
    this.bumpRevision();
    this.emit("queued", job, undefined);
    void this.startNext();
    return result;
  }

  private rejectPut(
    result: NativeFramePlaintextOpfsPutResult,
  ): NativeFramePlaintextOpfsPutResult {
    this.bumpRevision();
    this.emit("rejected", null, result.reason);
    return result;
  }

  async invalidate(
    keyInput: NativeFrameCacheKey,
  ): Promise<NativeFramePlaintextOpfsDeleteResult> {
    if (!this.opened) {
      return { status: "unavailable", reason: "not-open" };
    }
    if (this.closed) {
      return { status: "unavailable", reason: "closed" };
    }
    let key: NativeFrameCacheKey;
    try {
      key = createNativeFrameCacheKey(keyInput);
    } catch {
      return { status: "invalid", reason: "invalid-key" };
    }
    const record = this.records.get(keyFingerprint(key));
    if (!record) {
      return { status: "miss" };
    }
    if (record.state !== "committed") {
      return { status: "skipped", reason: "write-pending" };
    }
    this.records.delete(record.fingerprint);
    this.bumpRevision();
    this.emit("invalidated", record, undefined);
    record.state = "deleting";
    this.emit("deleting", record, undefined);
    const deleted = await this.removeFile(record.fileName);
    if (deleted) {
      this.aliases.delete(record.alias);
      this.emit("deleted", record, undefined);
      await this.refreshUsage();
      return {
        status: "deleted",
        entryAlias: record.alias,
        nativeBytes: record.nativeBytes,
      };
    }
    record.state = "error";
    this.failedDeleteBytes += record.fileBytes;
    this.aliases.set(record.alias, record);
    this.emit("error", record, "delete-failed");
    await this.refreshUsage();
    return {
      status: "failed",
      reason: "delete-failed",
      entryAlias: record.alias,
      nativeBytes: record.nativeBytes,
    };
  }

  async clearOwned(): Promise<NativeFramePlaintextOpfsClearResult> {
    if (!this.opened) {
      return {
        status: "unavailable",
        reason: "not-open",
        clearedEntries: 0,
        clearedNativeBytes: 0,
        failedEntries: 0,
        failedFileBytes: 0,
      };
    }
    if (this.closed) {
      return {
        status: "unavailable",
        reason: "closed",
        clearedEntries: 0,
        clearedNativeBytes: 0,
        failedEntries: 0,
        failedFileBytes: 0,
      };
    }
    if (this.closing) {
      return {
        status: "failed",
        reason: "write-in-flight",
        clearedEntries: 0,
        clearedNativeBytes: 0,
        failedEntries: 0,
        failedFileBytes: 0,
      };
    }
    const clearedEntries = this.records.size;
    const clearedNativeBytes = this.committedNativeBytes();
    this.clearing = true;
    this.ownerEpoch += 1;
    this.cancelQueued("aborted");
    try {
      await this.touchLease();
    } catch {
      this.clearing = false;
      return {
        status: "failed",
        reason: "lease-write-failed",
        clearedEntries: 0,
        clearedNativeBytes: 0,
        failedEntries: 0,
        failedFileBytes: 0,
      };
    }
    const drained = await this.drain({
      timeoutMs: this.maintenanceTimeoutMs,
    });
    if (drained.status === "timeout") {
      return {
        status: "failed",
        reason: "write-in-flight",
        clearedEntries: 0,
        clearedNativeBytes: 0,
        failedEntries: 0,
        failedFileBytes: 0,
      };
    }
    this.records.clear();
    this.aliases.clear();
    this.failedDeleteBytes = 0;
    const deletion = await this.removeAllNamespaceFiles();
    let leaseOk = true;
    try {
      await this.writeLease();
    } catch {
      leaseOk = false;
    }
    this.bumpRevision();
    await this.refreshUsage();
    this.clearing = false;
    if (deletion.failed > 0 || !leaseOk) {
      this.failedDeleteBytes = deletion.failedBytes;
      const reason: NativeFramePlaintextOpfsReason = leaseOk
        ? "delete-failed"
        : "lease-write-failed";
      this.emit("error", null, reason, 0, deletion.failedBytes);
      return {
        status: "failed",
        reason,
        clearedEntries: Math.max(0, clearedEntries - deletion.failed),
        clearedNativeBytes,
        failedEntries: deletion.failed,
        failedFileBytes: deletion.failedBytes,
      };
    }
    this.emit("cleared", null, undefined);
    return {
      status: "cleared",
      clearedEntries,
      clearedNativeBytes,
      failedEntries: 0,
      failedFileBytes: 0,
    };
  }

  async drain(options: { readonly timeoutMs?: number } = {}): Promise<NativeFramePlaintextOpfsDrainResult> {
    if (!this.activeJob && this.queuedJobs.length === 0) {
      return { status: "idle" };
    }
    const timeoutMs = options.timeoutMs ?? 5000;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: NativeFramePlaintextOpfsDrainResult) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };
      const timer = setTimeout(() => finish({ status: "timeout" }), timeoutMs);
      this.idleWaiters.push(() => {
        clearTimeout(timer);
        finish({ status: "drained" });
      });
    });
  }

  async close(): Promise<NativeFramePlaintextOpfsCloseResult> {
    if (this.closed) {
      return { status: "closed" };
    }
    if (this.clearing) {
      return { status: "failed", reason: "write-in-flight" };
    }
    this.closing = true;
    this.ownerEpoch += 1;
    this.cancelQueued("closed");
    try {
      await this.touchLease();
    } catch {
      return { status: "failed", reason: "lease-write-failed" };
    }
    const drained = await this.drain({
      timeoutMs: this.maintenanceTimeoutMs,
    });
    if (drained.status === "timeout") {
      return { status: "failed", reason: "write-in-flight" };
    }
    if (this.namespaceDir) {
      try {
        await this.removeAllNamespaceFiles();
        await this.rootDir?.removeEntry(this.namespaceId, { recursive: true });
      } catch {
        return { status: "failed", reason: "delete-failed" };
      }
    }
    this.records.clear();
    this.aliases.clear();
    this.opened = false;
    this.closed = true;
    this.closing = false;
    this.lease = null;
    this.releaseLock();
    return { status: "closed" };
  }

  async recover(): Promise<NativeFramePlaintextOpfsRecoveryResult> {
    if (
      !this.opened ||
      this.closed ||
      this.closing ||
      this.clearing ||
      this.activeJob ||
      this.queuedJobs.length
    ) {
      return {
        status: "skipped",
        reason: "busy",
        scannedNamespaces: 0,
        deletedNamespaces: 0,
        deletedTempFiles: 0,
        skippedNamespaces: 0,
        errors: 0,
      };
    }
    const ownTemps = await this.deleteOwnTempFiles();
    const other = await this.recoverOtherNamespaces();
    const scan = await this.refreshUsage();
    const errors = ownTemps.errors + other.errors;
    if (!scan.ok || other.scanLimited) {
      return {
        status: "partial",
        reason: "scan-limit",
        scannedNamespaces: other.scanned,
        deletedNamespaces: other.deleted,
        deletedTempFiles: ownTemps.deleted,
        skippedNamespaces: other.skipped,
        errors,
      };
    }
    if (errors > 0) {
      return {
        status: "partial",
        reason: "delete-failed",
        scannedNamespaces: other.scanned,
        deletedNamespaces: other.deleted,
        deletedTempFiles: ownTemps.deleted,
        skippedNamespaces: other.skipped,
        errors,
      };
    }
    return {
      status: "ok",
      scannedNamespaces: other.scanned,
      deletedNamespaces: other.deleted,
      deletedTempFiles: ownTemps.deleted,
      skippedNamespaces: other.skipped,
      errors: 0,
    };
  }

  snapshot(): NativeFramePlaintextOpfsSnapshot {
    const entries: NativeFramePlaintextOpfsSnapshotEntry[] = [];
    for (const record of this.records.values()) {
      entries.push({
        alias: record.alias,
        state: record.state,
        nativeBytes: record.nativeBytes,
        fileBytes: record.fileBytes,
      });
    }
    if (this.activeJob) {
      entries.push({
        alias: this.activeJob.alias,
        state: "writing",
        nativeBytes: this.activeJob.payload.byteLength,
        fileBytes: this.activeJob.fileBytes,
      });
    }
    for (const job of this.queuedJobs) {
      entries.push({
        alias: job.alias,
        state: "writing",
        nativeBytes: job.payload.byteLength,
        fileBytes: job.fileBytes,
      });
    }
    for (const record of this.aliases.values()) {
      if (
        (record.state === "error" || record.state === "deleting") &&
        !this.records.has(record.fingerprint)
      ) {
        entries.push({
          alias: record.alias,
          state: record.state,
          nativeBytes: record.nativeBytes,
          fileBytes: record.fileBytes,
        });
      }
    }
    const maxEntries =
      this.limits.maxEntries + this.limits.maxQueuedWrites + 1;
    const truncated = entries.length > maxEntries;
    const boundedEntries = entries.slice(0, maxEntries);
    const committedRecords = Array.from(this.records.values()).filter(
      (record) => record.state === "committed",
    );
    const leaseState = this.leaseState();
    return Object.freeze({
      storeId: this.storeId,
      revision: this.revision,
      sequence: this.sequence,
      oldestSequence: this.events[0]?.sequence ?? null,
      droppedEventCount: this.droppedEventCount,
      open: this.opened && !this.closed,
      capabilities: this.capabilities(),
      entries: Object.freeze(boundedEntries),
      truncated,
      committedEntries: committedRecords.length,
      committedNativeBytes: committedRecords.reduce(
        (total, record) => total + record.nativeBytes,
        0,
      ),
      committedFileBytes: committedRecords.reduce(
        (total, record) => total + record.fileBytes,
        0,
      ),
      pendingWrites: (this.activeJob ? 1 : 0) + this.queuedJobs.length,
      pendingNativeBytes: this.pendingNativeBytes,
      reservedFileBytes: this.unmaterializedFileBytes,
      queuedWrites: this.queuedJobs.length,
      rootFileBytes: this.rootFileBytes,
      tempFileBytes: this.tempFileBytes,
      failedDeleteBytes: this.failedDeleteBytes,
      lease: leaseState,
      limits: this.limits,
    });
  }

  eventsSince(afterSequence: number): NativeFramePlaintextOpfsEventBatch {
    const oldest = this.events[0]?.sequence ?? null;
    const resynchronize =
      !Number.isSafeInteger(afterSequence) ||
      afterSequence < 0 ||
      (oldest !== null && afterSequence < oldest - 1) ||
      afterSequence > this.sequence;
    if (resynchronize) {
      return Object.freeze({
        storeId: this.storeId,
        afterSequence,
        oldestSequence: oldest,
        latestSequence: this.sequence,
        revision: this.revision,
        events: Object.freeze([]),
        droppedEventCount: this.droppedEventCount,
        resynchronize: true,
      });
    }
    return Object.freeze({
      storeId: this.storeId,
      afterSequence,
      oldestSequence: oldest,
      latestSequence: this.sequence,
      revision: this.revision,
      events: Object.freeze(
        this.events.filter((event) => event.sequence > afterSequence),
      ),
      droppedEventCount: this.droppedEventCount,
      resynchronize: false,
    });
  }

  async activate(
    ownerId: string,
    generation: number,
  ): Promise<{ readonly status: "updated" | "failed"; readonly reason?: NativeFramePlaintextOpfsReason }> {
    const owner = assertToken(ownerId, "owner");
    if (!Number.isSafeInteger(generation) || generation < 1) {
      return { status: "failed", reason: "stale-generation" };
    }
    if (owner === this.ownerId && generation === this.generation) {
      return { status: "updated" };
    }
    this.ownerEpoch += 1;
    this.cancelQueued("stale-owner");
    if (this.opened && !this.closed) {
      try {
        await this.writeLeaseFor(owner, generation);
      } catch {
        return { status: "failed", reason: "lease-write-failed" };
      }
    }
    this.ownerId = owner;
    this.generation = generation;
    return { status: "updated" };
  }

  private async startNext(): Promise<void> {
    if (this.activeJob || this.queuedJobs.length === 0 || this.closed) {
      return;
    }
    const job = this.queuedJobs.shift();
    if (!job) {
      return;
    }
    if (job.cancelled || job.signal?.aborted) {
      this.pendingNativeBytes = Math.max(
        0,
        this.pendingNativeBytes - job.payload.byteLength,
      );
      if (!job.materialized) {
        this.unmaterializedFileBytes = Math.max(
          0,
          this.unmaterializedFileBytes - job.fileBytes,
        );
      }
      job.resolve({ status: "skipped", reason: "aborted" });
      this.resolveIdle();
      void this.startNext();
      return;
    }
    this.activeJob = job;
    let result: NativeFramePlaintextOpfsPutResult;
    try {
      result = await this.writeJob(job);
    } catch (error) {
      result = {
        status: isQuotaError(error) ? "quota" : "failed",
        reason: isQuotaError(error) ? "quota-exceeded" : "write-failed",
      };
    }
    this.pendingNativeBytes = Math.max(
      0,
      this.pendingNativeBytes - job.payload.byteLength,
    );
    if (!job.materialized) {
      this.unmaterializedFileBytes = Math.max(
        0,
        this.unmaterializedFileBytes - job.fileBytes,
      );
    }
    this.activeJob = null;
    await this.refreshUsage();
    job.resolve(result);
    if (!this.closed) {
      void this.startNext();
    }
    this.resolveIdle();
  }

  private async writeJob(
    job: WriteJob,
  ): Promise<NativeFramePlaintextOpfsPutResult> {
    if (job.cancelled || job.signal?.aborted || this.closed) {
      return { status: "skipped", reason: "aborted" };
    }
    if (job.ownerEpoch !== this.ownerEpoch) {
      return { status: "skipped", reason: "stale-owner" };
    }
    if (!this.namespaceDir) {
      return { status: "unavailable", reason: "not-open" };
    }
    const tempName = tempFileName(job.alias);
    const old = this.records.get(job.fingerprint);
    const finalName = old ? old.fileName : entryFileName(job.alias);
    const finalExistedBefore = !!old;
    this.bumpRevision();
    this.emit("writing", job, undefined);
    let tempHandle: NativeFramePlaintextOpfsFileHandle | null = null;
    try {
      await this.touchLease();
      tempHandle = await this.namespaceDir.getFileHandle(tempName, {
        create: true,
      });
      job.materialized = true;
      this.unmaterializedFileBytes = Math.max(
        0,
        this.unmaterializedFileBytes - job.fileBytes,
      );
      const preWriteScan = await this.scanRoot();
      if (
        !preWriteScan.ok ||
        preWriteScan.totalBytes +
          job.fileBytes +
          this.unmaterializedFileBytes >
          this.limits.maxRootFileBytes
      ) {
        this.failedDeleteBytes += await this.deleteTracked(tempName);
        this.emit("error", job, preWriteScan.ok ? "root-cap" : preWriteScan.reason);
        return { status: "skipped", reason: "root-cap" };
      }
      const header = buildHeader(
        job.payload.byteLength,
        job.contextDigest,
        job.payloadDigest,
      );
      const data = concatBytes(header, job.payload);
      const writable = await tempHandle.createWritable();
      await writable.write(data);
      await writable.close();
      const tempFile = await tempHandle.getFile();
      if (tempFile.size !== job.fileBytes) {
        this.failedDeleteBytes += await this.deleteTracked(tempName);
        this.emit("error", job, "size-mismatch");
        return { status: "invalid", reason: "size-mismatch" };
      }
      if (
        job.cancelled ||
        job.signal?.aborted ||
        this.closed ||
        job.ownerEpoch !== this.ownerEpoch
      ) {
        this.failedDeleteBytes += await this.deleteTracked(tempName);
        const reason: NativeFramePlaintextOpfsReason = job.signal?.aborted
          ? "aborted"
          : "stale-owner";
        this.emit("error", job, reason);
        return { status: "skipped", reason };
      }
      const published = await this.publishTemp(tempHandle, finalName);
      if (!published) {
        this.failedDeleteBytes += await this.deleteTracked(tempName);
        if (!finalExistedBefore) {
          this.failedDeleteBytes += await this.deleteTracked(finalName);
        } else if (old) {
          const verified = await this.verifyRecord(old);
          if (!verified) {
            this.records.delete(old.fingerprint);
            old.state = "error";
            this.aliases.set(old.alias, old);
            this.failedDeleteBytes += old.fileBytes;
            this.emit("error", old, "checksum-mismatch");
          }
        }
        this.emit("error", job, "write-failed");
        return { status: "failed", reason: "write-failed" };
      }
      if (
        job.cancelled ||
        job.signal?.aborted ||
        this.closed ||
        job.ownerEpoch !== this.ownerEpoch
      ) {
        this.failedDeleteBytes += await this.deleteTracked(finalName);
        if (old) {
          this.records.delete(old.fingerprint);
          this.aliases.delete(old.alias);
        }
        const reason: NativeFramePlaintextOpfsReason = job.signal?.aborted
          ? "aborted"
          : "stale-owner";
        this.emit("error", job, reason);
        return { status: "skipped", reason };
      }

      const record: EntryRecord = old
        ? {
            ...old,
            nativeBytes: job.payload.byteLength,
            fileBytes: job.fileBytes,
            payloadDigestHex: toHex(job.payloadDigest),
            state: "committed",
          }
        : {
            alias: job.alias,
            fingerprint: job.fingerprint,
            key: job.key,
            fileName: finalName,
            nativeBytes: job.payload.byteLength,
            fileBytes: job.fileBytes,
            payloadDigestHex: toHex(job.payloadDigest),
            state: "committed",
          };
      this.records.set(record.fingerprint, record);
      this.aliases.set(record.alias, record);
      this.bumpRevision();
      this.emit("committed", record, undefined);
      await this.refreshUsage();
      return {
        status: job.replacement ? "replaced" : "stored",
        entryAlias: record.alias,
        nativeBytes: record.nativeBytes,
        fileBytes: record.fileBytes,
      };
    } catch (error) {
      this.failedDeleteBytes += await this.deleteTracked(tempName);
      if (!finalExistedBefore) {
        this.failedDeleteBytes += await this.deleteTracked(finalName);
      }
      const reason = isQuotaError(error)
        ? "quota-exceeded"
        : "write-failed";
      this.bumpRevision();
      this.emit("error", job, reason);
      return {
        status: isQuotaError(error) ? "quota" : "failed",
        reason,
      };
    }
  }

  private async publishTemp(
    tempHandle: NativeFramePlaintextOpfsFileHandle,
    finalName: string,
  ): Promise<boolean> {
    if (typeof tempHandle.move !== "function") {
      return false;
    }
    try {
      await tempHandle.move(finalName);
      return true;
    } catch {
      return false;
    }
  }

  private async verifyRecord(record: EntryRecord): Promise<boolean> {
    const dir = this.namespaceDir;
    if (!dir) {
      return false;
    }
    try {
      const handle = await dir.getFileHandle(record.fileName, {
        create: false,
      });
      const file = await handle.getFile();
      if (
        file.size !==
        NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES + record.nativeBytes
      ) {
        return false;
      }
      const headerBytes = new Uint8Array(
        await file
          .slice(0, NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES)
          .arrayBuffer(),
      );
      const header = parseHeader(headerBytes);
      if (!header || header.payloadBytes !== record.nativeBytes) {
        return false;
      }
      const expectedContext = await this.contextDigest(record.key);
      if (!equalBytes(header.contextDigest, expectedContext)) {
        return false;
      }
      const payload = new Uint8Array(
        await file
          .slice(
            NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES,
            NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES + header.payloadBytes,
          )
          .arrayBuffer(),
      );
      if (payload.byteLength !== record.nativeBytes) {
        return false;
      }
      const checksum = await this.sha256(payload);
      return (
        equalBytes(checksum, header.payloadChecksum) &&
        toHex(checksum) === record.payloadDigestHex
      );
    } catch {
      return false;
    }
  }

  private async deleteTracked(fileName: string): Promise<number> {
    const dir = this.namespaceDir;
    if (!dir) {
      return 0;
    }
    let size = 0;
    try {
      size = await this.fileSize(dir, fileName);
    } catch {
      size = 0;
    }
    try {
      await dir.removeEntry(fileName);
      return 0;
    } catch (error) {
      return isNotFound(error) ? 0 : size;
    }
  }

  private async contextDigest(key: NativeFrameCacheKey): Promise<Uint8Array> {
    return this.sha256(TEXT_ENCODER.encode(`native-frame-opfs-v1\u0000${keyFingerprint(key)}`));
  }

  private async sha256(bytes: Uint8Array): Promise<Uint8Array> {
    if (!this.subtle) {
      throw new Error("SHA-256 unavailable");
    }
    const digest = await this.subtle.digest(
      "SHA-256",
      bytes as unknown as BufferSource,
    );
    return new Uint8Array(digest);
  }

  private async markInvalid(
    record: EntryRecord,
    reason: NativeFramePlaintextOpfsReason,
  ): Promise<void> {
    this.records.delete(record.fingerprint);
    this.aliases.delete(record.alias);
    this.bumpRevision();
    this.emit("invalidated", record, reason);
    const deleted = await this.removeFile(record.fileName);
    if (deleted) {
      this.emit("deleted", record, reason);
    } else {
      const errorRecord: EntryRecord = { ...record, state: "error" };
      this.aliases.set(errorRecord.alias, errorRecord);
      this.failedDeleteBytes += errorRecord.fileBytes;
      this.emit("error", errorRecord, "delete-failed");
    }
    await this.refreshUsage();
  }

  private async removeFile(fileName: string): Promise<boolean> {
    if (!this.namespaceDir) {
      return false;
    }
    try {
      await this.namespaceDir.removeEntry(fileName);
      return true;
    } catch (error) {
      return isNotFound(error);
    }
  }

  private async removeAllNamespaceFiles(): Promise<{
    readonly failed: number;
    readonly failedBytes: number;
  }> {
    const dir = this.namespaceDir;
    if (!dir) {
      return { failed: 0, failedBytes: 0 };
    }
    let failed = 0;
    let failedBytes = 0;
    const names: string[] = [];
    try {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === "directory") {
          continue;
        }
        if (name === NATIVE_FRAME_PLAINTEXT_OPFS_LEASE_FILE) {
          continue;
        }
        names.push(name);
      }
    } catch {
      return { failed: 1, failedBytes: 0 };
    }
    for (const name of names) {
      try {
        await dir.removeEntry(name);
      } catch (error) {
        if (!isNotFound(error)) {
          failed += 1;
          try {
            failedBytes += await this.fileSize(dir, name);
          } catch {
            // The file is still counted as failed; its size could not be read.
          }
        }
      }
    }
    return { failed, failedBytes };
  }

  private async clearNamespaceContents(): Promise<void> {
    const result = await this.removeAllNamespaceFiles();
    if (result.failed > 0) {
      throw new Error("OPFS namespace recovery failed");
    }
    if (this.namespaceDir) {
      try {
        await this.namespaceDir.removeEntry(
          NATIVE_FRAME_PLAINTEXT_OPFS_LEASE_FILE,
        );
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }
    }
    this.records.clear();
    this.aliases.clear();
    this.failedDeleteBytes = 0;
  }

  private async directoryHasFiles(
    dir: NativeFramePlaintextOpfsDirectoryHandle,
  ): Promise<boolean> {
    let count = 0;
    try {
      for await (const [, handle] of dir.entries()) {
        if (handle.kind === "directory") {
          return true;
        }
        count += 1;
        if (count > 1) {
          return true;
        }
      }
      return count > 0;
    } catch {
      return true;
    }
  }

  private async readLeaseFrom(
    dir: NativeFramePlaintextOpfsDirectoryHandle,
  ): Promise<LeaseRecord | null> {
    try {
      const handle = await dir.getFileHandle(
        NATIVE_FRAME_PLAINTEXT_OPFS_LEASE_FILE,
        { create: false },
      );
      const file = await handle.getFile();
      if (file.size > this.limits.maxLeaseBytes) {
        return null;
      }
      const text = file.text
        ? await file.text()
        : TEXT_DECODER.decode(await file.slice(0, file.size).arrayBuffer());
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      const value = parsed as Partial<LeaseRecord>;
      if (
        value.version !== 1 ||
        typeof value.ownerId !== "string" ||
        typeof value.generation !== "number" ||
        !Number.isSafeInteger(value.generation) ||
        value.generation < 1 ||
        typeof value.openedAt !== "number" ||
        typeof value.updatedAt !== "number"
      ) {
        return null;
      }
      return {
        version: 1,
        ownerId: value.ownerId,
        generation: value.generation,
        openedAt: value.openedAt,
        updatedAt: value.updatedAt,
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      return null;
    }
  }

  private async removeLeaseEntry(): Promise<void> {
    const dir = this.namespaceDir;
    if (!dir) {
      return;
    }
    try {
      await dir.removeEntry(NATIVE_FRAME_PLAINTEXT_OPFS_LEASE_FILE);
    } catch (error) {
      if (!isNotFound(error)) {
        // A failed cleanup is reported by the caller's failed open result.
      }
    }
  }

  private async writeLease(): Promise<void> {
    await this.writeLeaseFor(this.ownerId, this.generation);
  }

  private async writeLeaseFor(
    ownerId: string,
    generation: number,
  ): Promise<void> {
    const dir = this.namespaceDir;
    if (!dir) {
      throw new Error("OPFS namespace is not open");
    }
    const now = this.now();
    const lease: LeaseRecord = this.lease
      ? {
          ...this.lease,
          ownerId,
          generation,
          updatedAt: now,
        }
      : {
          version: 1,
          ownerId,
          generation,
          openedAt: now,
          updatedAt: now,
        };
    const data = TEXT_ENCODER.encode(JSON.stringify(lease));
    if (data.byteLength > this.limits.maxLeaseBytes) {
      throw new Error("OPFS lease is too large");
    }
    const handle = await dir.getFileHandle(
      NATIVE_FRAME_PLAINTEXT_OPFS_LEASE_FILE,
      { create: true },
    );
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    this.lease = lease;
    this.lastLeaseWrite = now;
  }

  private async touchLease(): Promise<void> {
    if (this.now() - this.lastLeaseWrite < this.limits.leaseHeartbeatMs) {
      return;
    }
    await this.writeLease();
  }

  private leaseState(): NativeFramePlaintextOpfsLeaseState {
    if (!this.lease) {
      return { state: "missing", updatedAt: null };
    }
    if (this.now() - this.lease.updatedAt > this.limits.leaseTtlMs) {
      return { state: "expired", updatedAt: this.lease.updatedAt };
    }
    return { state: "live", updatedAt: this.lease.updatedAt };
  }

  private async recoverOtherNamespaces(): Promise<{
    readonly scanned: number;
    readonly deleted: number;
    readonly skipped: number;
    readonly errors: number;
    readonly scanLimited: boolean;
  }> {
    const root = this.rootDir;
    if (!root || !this.locks.supported) {
      return {
        scanned: 0,
        deleted: 0,
        skipped: 0,
        errors: 0,
        scanLimited: false,
      };
    }
    let scanned = 0;
    let deleted = 0;
    let skipped = 0;
    let errors = 0;
    let scanLimited = false;
    try {
      for await (const [name, handle] of root.entries()) {
        if (handle.kind !== "directory" || name === this.namespaceId) {
          continue;
        }
        if (scanned >= this.limits.maxScanNamespaces) {
          scanLimited = true;
          break;
        }
        scanned += 1;
        const lock = await this.locks.acquire(leaseLockName(name));
        if (!lock) {
          skipped += 1;
          continue;
        }
        try {
          const lease = await this.readLeaseFrom(handle);
          if (
            !lease ||
            this.now() - lease.updatedAt <= this.limits.leaseTtlMs
          ) {
            skipped += 1;
            continue;
          }
          await root.removeEntry(name, { recursive: true });
          deleted += 1;
        } catch {
          errors += 1;
        } finally {
          lock.release();
        }
      }
    } catch {
      errors += 1;
    }
    return { scanned, deleted, skipped, errors, scanLimited };
  }

  private async deleteOwnTempFiles(): Promise<{
    readonly deleted: number;
    readonly errors: number;
  }> {
    const dir = this.namespaceDir;
    if (!dir) {
      return { deleted: 0, errors: 0 };
    }
    const names: string[] = [];
    let errors = 0;
    try {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind !== "directory" && name.startsWith("t-")) {
          names.push(name);
        }
      }
    } catch {
      errors += 1;
    }
    let deleted = 0;
    for (const name of names) {
      try {
        await dir.removeEntry(name);
        deleted += 1;
      } catch {
        errors += 1;
      }
    }
    return { deleted, errors };
  }

  private async scanRoot(): Promise<RootScan> {
    const root = this.rootDir;
    if (!root) {
      return {
        ok: false,
        reason: "not-open",
        totalBytes: 0,
        namespaces: 0,
        entries: 0,
        ownFileBytes: 0,
        ownTempBytes: 0,
        ownCommittedBytes: 0,
      };
    }
    let totalBytes = 0;
    let namespaces = 0;
    let entries = 0;
    let ownFileBytes = 0;
    let ownTempBytes = 0;
    let ownCommittedBytes = 0;
    try {
      for await (const [name, handle] of root.entries()) {
        if (handle.kind !== "directory") {
          entries += 1;
          if (entries > this.limits.maxScanEntries) {
            return {
              ok: false,
              reason: "scan-limit",
              totalBytes,
              namespaces,
              entries,
              ownFileBytes,
              ownTempBytes,
              ownCommittedBytes,
            };
          }
          totalBytes += await this.fileSize(root, name);
          continue;
        }
        namespaces += 1;
        if (namespaces > this.limits.maxScanNamespaces) {
          return {
            ok: false,
            reason: "scan-limit",
            totalBytes,
            namespaces,
            entries,
            ownFileBytes,
            ownTempBytes,
            ownCommittedBytes,
          };
        }
        for await (const [fileName, child] of handle.entries()) {
          if (child.kind === "directory") {
            continue;
          }
          entries += 1;
          if (entries > this.limits.maxScanEntries) {
            return {
              ok: false,
              reason: "scan-limit",
              totalBytes,
              namespaces,
              entries,
              ownFileBytes,
              ownTempBytes,
              ownCommittedBytes,
            };
          }
          const size = await this.fileSize(handle, fileName);
          totalBytes += size;
          if (name === this.namespaceId) {
            ownFileBytes += size;
            if (fileName.startsWith("t-")) {
              ownTempBytes += size;
            } else if (fileName.startsWith("e-")) {
              ownCommittedBytes += size;
            }
          }
        }
      }
      return {
        ok: true,
        totalBytes,
        namespaces,
        entries,
        ownFileBytes,
        ownTempBytes,
        ownCommittedBytes,
      };
    } catch {
      return {
        ok: false,
        reason: "scan-limit",
        totalBytes,
        namespaces,
        entries,
        ownFileBytes,
        ownTempBytes,
        ownCommittedBytes,
      };
    }
  }

  private async fileSize(
    dir: NativeFramePlaintextOpfsDirectoryHandle,
    name: string,
  ): Promise<number> {
    try {
      const handle = await dir.getFileHandle(name, { create: false });
      const file = await handle.getFile();
      return file.size;
    } catch (error) {
      if (isNotFound(error)) {
        return 0;
      }
      throw error;
    }
  }

  private async refreshUsage(): Promise<RootScan> {
    const scan = await this.scanRoot();
    this.rootFileBytes = scan.totalBytes;
    this.tempFileBytes = scan.ownTempBytes;
    return scan;
  }

  private committedNativeBytes(): number {
    let total = 0;
    for (const record of this.records.values()) {
      if (record.state === "committed") {
        total += record.nativeBytes;
      }
    }
    return total;
  }

  private removeRecord(record: EntryRecord, keepAlias: boolean): void {
    this.records.delete(record.fingerprint);
    if (!keepAlias) {
      this.aliases.delete(record.alias);
    }
  }

  private cancelQueued(reason: NativeFramePlaintextOpfsReason): void {
    const queued = this.queuedJobs.slice();
    this.queuedJobs.length = 0;
    for (const job of queued) {
      job.cancelled = true;
      this.pendingNativeBytes = Math.max(
        0,
        this.pendingNativeBytes - job.payload.byteLength,
      );
      if (!job.materialized) {
        this.unmaterializedFileBytes = Math.max(
          0,
          this.unmaterializedFileBytes - job.fileBytes,
        );
      }
      job.resolve({ status: "skipped", reason });
    }
    if (this.activeJob) {
      this.activeJob.cancelled = true;
    }
    this.resolveIdle();
  }

  private resolveIdle(): void {
    if (this.activeJob || this.queuedJobs.length) {
      return;
    }
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const waiter of waiters) {
      waiter();
    }
  }

  private bumpRevision(): void {
    this.revision += 1;
  }

  private emit(
    type: NativeFramePlaintextOpfsEventType,
    source: EntryRecord | WriteJob | null,
    reason?: NativeFramePlaintextOpfsReason,
    nativeBytes?: number,
    fileBytes?: number,
  ): void {
    this.sequence += 1;
    const event: NativeFramePlaintextOpfsEvent = {
      sequence: this.sequence,
      revision: this.revision,
      type,
      entryAlias: source?.alias ?? null,
      nativeBytes:
        nativeBytes ??
        (source
          ? "payload" in source
            ? source.payload.byteLength
            : source.nativeBytes
          : 0),
      fileBytes:
        fileBytes ??
        (source
          ? "payload" in source
            ? source.fileBytes
            : source.fileBytes
          : 0),
      ...(reason ? { reason } : {}),
    };
    this.events.push(event);
    if (this.events.length > this.limits.eventCapacity) {
      this.events.shift();
      this.droppedEventCount += 1;
    }
  }

  private releaseLock(): void {
    if (!this.lock) {
      return;
    }
    try {
      this.lock.release();
    } finally {
      this.lock = null;
    }
  }
}
