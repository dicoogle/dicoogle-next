import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test } from "node:test";
import {
  NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES,
  NativeFramePlaintextOpfs,
  type NativeFramePlaintextOpfsDirectoryHandle,
  type NativeFramePlaintextOpfsFileHandle,
  type NativeFramePlaintextOpfsLock,
  type NativeFramePlaintextOpfsLockManager,
  type NativeFramePlaintextOpfsWritable,
} from "../src/services/nativeFramePlaintextOpfs";
import {
  createNativeFrameCacheKey,
  type NativeFrameCacheKey,
} from "../src/services/nativeRamCache";
import {
  NATIVE_FRAME_TRANSFER_SYNTAX_UID,
} from "../src/services/nativeFrameContract";
import {
  SYNTHETIC_FIXTURE_INSTANCE_A_UID,
  SYNTHETIC_FIXTURE_SERIES_A_UID,
  SYNTHETIC_FIXTURE_SOURCE_VERSION,
  SYNTHETIC_FIXTURE_STUDY_UID,
} from "../src/services/nativeFrameFixture";
import { getNativeFrameFixtureDigest } from "../src/services/nativeFrameFixtureDigests";

const SUBTLE = webcrypto.subtle as unknown as SubtleCrypto;
const FRAME_SIZE = 8192;
const OPFS_FILE_BYTES = FRAME_SIZE + 80;
const STUDY = SYNTHETIC_FIXTURE_STUDY_UID;
const SERIES = SYNTHETIC_FIXTURE_SERIES_A_UID;
const SOP = SYNTHETIC_FIXTURE_INSTANCE_A_UID;

function payload(fill: number): Uint8Array {
  const bytes = new Uint8Array(FRAME_SIZE);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (index + fill) & 0xff;
  }
  return bytes;
}

async function digestOf(bytes: Uint8Array): Promise<string> {
  const digest = await SUBTLE.digest(
    "SHA-256",
    bytes as unknown as BufferSource,
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function makeKey(frameNumber = 1): NativeFrameCacheKey {
  return createNativeFrameCacheKey({
    principalId: "synthetic-principal",
    sessionId: "synthetic-session",
    studyInstanceUID: STUDY,
    seriesInstanceUID: SERIES,
    sopInstanceUID: SOP,
    frameNumber,
    representation: "native-frame-v1",
    transferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
    sourceVersion: SYNTHETIC_FIXTURE_SOURCE_VERSION,
  });
}

function notFound(name: string): Error {
  const error = new Error(`not found: ${name}`);
  error.name = "NotFoundError";
  return error;
}

function quotaError(): Error {
  const error = new Error("quota exceeded");
  error.name = "QuotaExceededError";
  return error;
}

class FakeFileData {
  constructor(readonly data: Uint8Array) {}

  get size(): number {
    return this.data.byteLength;
  }

  slice(start = 0, end = this.size): { arrayBuffer(): Promise<ArrayBuffer> } {
    const copy = this.data.slice(start, end);
    return {
      async arrayBuffer() {
        return copy.buffer as ArrayBuffer;
      },
    };
  }

  async text(): Promise<string> {
    return new TextDecoder().decode(this.data);
  }
}

class FakeWritable implements NativeFramePlaintextOpfsWritable {
  private chunks: Uint8Array[] = [];
  private closed = false;

  constructor(private readonly handle: FakeFileHandle) {}

  async write(data: Uint8Array): Promise<void> {
    if (this.closed) {
      throw new Error("writable closed");
    }
    const root = this.handle.dir.root;
    if (root.failNextWrite) {
      root.failNextWrite = false;
      throw new Error("synthetic write failure");
    }
    const next = this.chunks.reduce((total, chunk) => total + chunk.byteLength, 0) +
      data.byteLength;
    if (
      root.quotaBytes !== null &&
      root.totalBytes() + next > root.quotaBytes
    ) {
      throw quotaError();
    }
    this.chunks.push(data.slice());
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    const total = this.chunks.reduce(
      (sum, chunk) => sum + chunk.byteLength,
      0,
    );
    const data = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.handle.data = data;
    if (this.handle.dir.root.writeGate) {
      await this.handle.dir.root.writeGate;
    }
    if (this.handle.dir.root.writeDelayMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.handle.dir.root.writeDelayMs),
      );
    }
    this.closed = true;
  }

  async abort(): Promise<void> {
    this.chunks = [];
    this.closed = true;
  }
}

class FakeFileHandle implements NativeFramePlaintextOpfsFileHandle {
  readonly kind = "file" as const;

  constructor(
    public name: string,
    readonly dir: FakeDirectory,
    public data = new Uint8Array(),
  ) {}

  async getFile(): Promise<FakeFileData> {
    return new FakeFileData(this.data.slice());
  }

  async createWritable(): Promise<FakeWritable> {
    return new FakeWritable(this);
  }

  async move(name: string): Promise<void> {
    if (this.dir.root.failNextMove) {
      this.dir.root.failNextMove = false;
      throw new Error("synthetic move failure");
    }
    this.dir.moveFile(this.name, name);
    this.name = name;
  }
}

class FakeDirectory implements NativeFramePlaintextOpfsDirectoryHandle {
  readonly kind = "directory" as const;
  readonly children = new Map<string, FakeDirectory | FakeFileHandle>();
  readonly failRemove = new Set<string>();
  readonly root: FakeDirectory;
  quotaBytes: number | null = null;
  writeDelayMs = 0;
  writeGate: Promise<void> | null = null;
  deleteGate: Promise<void> | null = null;
  failNextWrite = false;
  failNextMove = false;

  constructor(readonly name: string, root?: FakeDirectory) {
    this.root = root ?? this;
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FakeDirectory> {
    const existing = this.children.get(name);
    if (existing) {
      if (!(existing instanceof FakeDirectory)) {
        throw notFound(name);
      }
      return existing;
    }
    if (!options?.create) {
      throw notFound(name);
    }
    const child = new FakeDirectory(name, this.root);
    this.children.set(name, child);
    return child;
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FakeFileHandle> {
    const existing = this.children.get(name);
    if (existing) {
      if (existing instanceof FakeDirectory) {
        throw notFound(name);
      }
      return existing;
    }
    if (!options?.create) {
      throw notFound(name);
    }
    const child = new FakeFileHandle(name, this);
    this.children.set(name, child);
    return child;
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.root.deleteGate) {
      await this.root.deleteGate;
    }
    if (this.failRemove.has(name)) {
      throw new Error(`synthetic delete failure: ${name}`);
    }
    const existing = this.children.get(name);
    if (!existing) {
      throw notFound(name);
    }
    if (existing instanceof FakeDirectory && !options?.recursive) {
      throw new Error("directory is not empty");
    }
    this.children.delete(name);
  }

  async *entries(): AsyncIterableIterator<
    [string, FakeDirectory | FakeFileHandle]
  > {
    for (const entry of this.children.entries()) {
      yield entry;
    }
  }

  moveFile(from: string, to: string): void {
    const file = this.children.get(from);
    if (!(file instanceof FakeFileHandle)) {
      throw notFound(from);
    }
    this.children.delete(from);
    const target = new FakeFileHandle(to, this, file.data);
    this.children.set(to, target);
  }

  totalBytes(): number {
    let total = 0;
    for (const child of this.children.values()) {
      if (child instanceof FakeDirectory) {
        total += child.totalBytes();
      } else {
        total += child.data.byteLength;
      }
    }
    return total;
  }

  file(name: string): FakeFileHandle | null {
    const child = this.children.get(name);
    return child instanceof FakeFileHandle ? child : null;
  }

  directory(name: string): FakeDirectory | null {
    const child = this.children.get(name);
    return child instanceof FakeDirectory ? child : null;
  }
}

class FakeLocks implements NativeFramePlaintextOpfsLockManager {
  readonly supported = true;
  readonly held = new Set<string>();

  async acquire(name: string): Promise<NativeFramePlaintextOpfsLock | null> {
    if (this.held.has(name)) {
      return null;
    }
    this.held.add(name);
    return {
      release: () => {
        this.held.delete(name);
      },
    };
  }

  forceReleaseAll(): void {
    this.held.clear();
  }
}

interface TestStore {
  readonly store: NativeFramePlaintextOpfs;
  readonly root: FakeDirectory;
  readonly locks: FakeLocks;
  advance(ms: number): void;
}

let aliasSequence = 0;

function makeStore(options: {
  namespace?: string;
  owner?: string;
  generation?: number;
  storage?: FakeDirectory;
  locks?: FakeLocks;
  subtle?: SubtleCrypto | null;
  limits?: Record<string, number>;
  now?: () => number;
  moveSupported?: boolean;
  maintenanceTimeoutMs?: number;
} = {}): TestStore {
  const root = options.storage ?? new FakeDirectory("root");
  const locks = options.locks ?? new FakeLocks();
  let now = 1000;
  const store = new NativeFramePlaintextOpfs({
    namespaceId: options.namespace ?? "ns-1",
    ownerId: options.owner ?? "owner-1",
    generation: options.generation ?? 1,
    storage: root,
    locks,
    subtle: options.subtle === undefined ? SUBTLE : options.subtle,
    now: options.now ?? (() => now),
    aliasFactory: () => `alias-${++aliasSequence}`,
    limits: options.limits,
    moveSupported: options.moveSupported ?? true,
    maintenanceTimeoutMs: options.maintenanceTimeoutMs ?? 50,
  });
  return {
    store,
    root,
    locks,
    advance(ms: number) {
      now += ms;
    },
  };
}

async function openStore(options: Parameters<typeof makeStore>[0] = {}) {
  const testStore = makeStore(options);
  const result = await testStore.store.open();
  return { ...testStore, openResult: result };
}

function namespaceOf(root: FakeDirectory, namespace = "ns-1"): FakeDirectory {
  const app = root.directory("dicoogle-next");
  assert.ok(app);
  const rootDir = app.directory("native-frame-p3-v1");
  assert.ok(rootDir);
  const ns = rootDir.directory(namespace);
  assert.ok(ns);
  return ns;
}

test("opens, stores exact bytes, and exposes only scalar/alias snapshot data", async () => {
  const { store, root } = await openStore();
  const bytes = payload(1);
  const digest = await digestOf(bytes);
  const put = await store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: digest,
  });
  assert.equal(put.status, "stored");
  assert.ok(put.entryAlias);

  const get = await store.get(makeKey(1), {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: digest,
  });
  assert.equal(get.status, "hit");
  assert.deepEqual(get.bytes, bytes);
  assert.equal(get.verified, true);

  const ns = namespaceOf(root);
  const entry = [...ns.children.values()].find(
    (child) => child instanceof FakeFileHandle && child.name.startsWith("e-"),
  );
  assert.ok(entry instanceof FakeFileHandle);
  assert.equal(entry.data.byteLength, NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES + FRAME_SIZE);

  const snapshot = store.snapshot();
  assert.equal(snapshot.committedEntries, 1);
  assert.equal(snapshot.committedNativeBytes, FRAME_SIZE);
  assert.equal(snapshot.committedFileBytes, FRAME_SIZE + NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES);
  assert.equal(snapshot.open, true);
  assert.equal(snapshot.entries[0]?.alias, put.entryAlias);
  assert.equal(JSON.stringify(snapshot).includes(STUDY), false);
  assert.equal(JSON.stringify(snapshot).includes("1.2.826"), false);
  await store.close();
});

test("requires a caller digest and rejects mismatched or absent digests", async () => {
  const { store } = await openStore();
  const bytes = payload(2);
  const digest = await digestOf(bytes);

  assert.deepEqual(
    await store.put(makeKey(1), bytes, { frameSizeBytes: FRAME_SIZE }),
    { status: "skipped", reason: "digest-missing" },
  );
  assert.deepEqual(
    await store.put(makeKey(1), bytes, {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: "0".repeat(64),
    }),
    { status: "invalid", reason: "digest-mismatch" },
  );
  await store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: digest,
  });
  assert.deepEqual(
    await store.get(makeKey(1), { frameSizeBytes: FRAME_SIZE }),
    { status: "skipped", reason: "digest-missing" },
  );
  assert.deepEqual(
    await store.get(makeKey(1), {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: "f".repeat(64),
    }),
    { status: "invalid", reason: "digest-mismatch" },
  );
  await store.close();
});

test("detects size, header, and payload corruption before returning bytes", async () => {
  const { store, root } = await openStore();
  const bytes = payload(3);
  const digest = await digestOf(bytes);
  const putAndFind = async (): Promise<FakeFileHandle> => {
    await store.put(makeKey(1), bytes, {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: digest,
    });
    const ns = namespaceOf(root);
    const entry = [...ns.children.values()].find(
      (child) => child instanceof FakeFileHandle && child.name.startsWith("e-"),
    );
    assert.ok(entry instanceof FakeFileHandle);
    return entry;
  };

  let entry = await putAndFind();
  entry.data = new Uint8Array(NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES - 1);
  assert.deepEqual(
    await store.get(makeKey(1), {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: digest,
    }),
    { status: "invalid", reason: "size-mismatch" },
  );

  entry = await putAndFind();
  entry.data[0] = 0;
  assert.deepEqual(
    await store.get(makeKey(1), {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: digest,
    }),
    { status: "invalid", reason: "header-invalid" },
  );

  entry = await putAndFind();
  entry.data[9] = 2;
  assert.deepEqual(
    await store.get(makeKey(1), {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: digest,
    }),
    { status: "invalid", reason: "header-invalid" },
  );

  entry = await putAndFind();
  entry.data[NATIVE_FRAME_PLAINTEXT_OPFS_HEADER_BYTES + 3] ^= 1;
  assert.deepEqual(
    await store.get(makeKey(1), {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: digest,
    }),
    { status: "invalid", reason: "checksum-mismatch" },
  );

  entry = await putAndFind();
  entry.data[16] ^= 1;
  assert.deepEqual(
    await store.get(makeKey(1), {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: digest,
    }),
    { status: "invalid", reason: "context-mismatch" },
  );
  await store.close();
});

test("enforces entry, committed, entries, and root caps before writing", async () => {
  const entry = await openStore({
    limits: { maxEntryNativeBytes: FRAME_SIZE - 1 },
  });
  assert.deepEqual(
    await entry.store.put(makeKey(1), payload(4), {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: await digestOf(payload(4)),
    }),
    { status: "invalid", reason: "size-mismatch" },
  );
  await entry.store.close();

  const committed = await openStore({
    limits: { maxCommittedNativeBytes: FRAME_SIZE },
  });
  await committed.store.put(makeKey(1), payload(5), {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(payload(5)),
  });
  assert.deepEqual(
    await committed.store.put(makeKey(2), payload(6), {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: await digestOf(payload(6)),
    }),
    { status: "skipped", reason: "committed-cap" },
  );
  await committed.store.close();

  const entries = await openStore({ limits: { maxEntries: 1 } });
  await entries.store.put(makeKey(1), payload(7), {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(payload(7)),
  });
  assert.deepEqual(
    await entries.store.put(makeKey(2), payload(8), {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: await digestOf(payload(8)),
    }),
    { status: "skipped", reason: "entries-cap" },
  );
  await entries.store.close();

  const root = await openStore({
    limits: { maxRootFileBytes: FRAME_SIZE * 2 },
  });
  await root.store.put(makeKey(1), payload(9), {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(payload(9)),
  });
  assert.deepEqual(
    await root.store.put(makeKey(2), payload(10), {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: await digestOf(payload(10)),
    }),
    { status: "skipped", reason: "root-cap" },
  );
  await root.store.close();
});

test("counts stale temporary files against the root cap", async () => {
  const { store, root } = await openStore({
    limits: { maxRootFileBytes: FRAME_SIZE + 500 },
  });
  const ns = namespaceOf(root);
  const temp = await ns.getFileHandle("t-stale.tmp", { create: true });
  temp.data = new Uint8Array(600);
  const bytes = payload(19);
  assert.deepEqual(
    await store.put(makeKey(1), bytes, {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: await digestOf(bytes),
    }),
    { status: "skipped", reason: "root-cap" },
  );
  await store.close();
});

test("bounds the queue and pending bytes and rejects a third write", async () => {
  const { store, root, advance } = await openStore();
  root.writeDelayMs = 20;
  const firstBytes = payload(11);
  const secondBytes = payload(12);
  const first = store.put(makeKey(1), firstBytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(firstBytes),
  });
  await waitFor(() => store.snapshot().pendingWrites === 1);
  const second = store.put(makeKey(2), secondBytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(secondBytes),
  });
  await waitFor(() => store.snapshot().pendingWrites === 2);
  assert.ok(store.snapshot().entries.some((entry) => entry.state === "writing"));
  assert.deepEqual(
    await store.put(makeKey(3), payload(13), {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: await digestOf(payload(13)),
    }),
    { status: "skipped", reason: "queue-full" },
  );
  assert.ok(
    store
      .eventsSince(0)
      .events.some(
        (event) => event.type === "rejected" && event.reason === "queue-full",
      ),
  );
  assert.equal((await first).status, "stored");
  assert.equal((await second).status, "stored");
  advance(0);
  await store.close();
});

test("reports digest-unavailable when hashing is unavailable and leaves storage untouched", async () => {
  const { store, root } = await openStore({ subtle: null });
  assert.equal(store.capabilities().subtle, false);
  assert.deepEqual(
    await store.get(makeKey(1), {
      frameSizeBytes: FRAME_SIZE,
      expectedDigest: "a".repeat(64),
    }),
    { status: "unavailable", reason: "not-open" },
  );
  assert.equal(root.totalBytes(), 0);
});

test("reports unsupported when OPFS is unavailable", async () => {
  const store = new NativeFramePlaintextOpfs({
    namespaceId: "ns-unsupported",
    ownerId: "owner-1",
    generation: 1,
    subtle: SUBTLE,
    locks: new FakeLocks(),
  });
  const result = await store.open();
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "unsupported");
});

test("surfaces quota and write failures without a phantom committed event", async () => {
  const quota = await openStore();
  quota.root.quotaBytes = 5000;
  const bytes = payload(14);
  const result = await quota.store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  assert.equal(result.status, "quota");
  assert.equal(quota.store.snapshot().committedEntries, 0);
  assert.equal(
    quota.store
      .eventsSince(0)
      .events.some((event) => event.type === "committed"),
    false,
  );
  await quota.store.close();

  const failed = await openStore();
  failed.root.failNextWrite = true;
  const failedBytes = payload(15);
  const failedResult = await failed.store.put(makeKey(1), failedBytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(failedBytes),
  });
  assert.equal(failedResult.status, "failed");
  assert.equal(failed.store.snapshot().committedEntries, 0);
  assert.equal(
    failed.store
      .eventsSince(0)
      .events.some((event) => event.type === "committed"),
    false,
  );
  await failed.store.close();
});

test("snapshot and events expose a deleting state before confirmed deletion", async () => {
  const { store, root } = await openStore();
  const bytes = payload(29);
  await store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  let release: (() => void) | null = null;
  root.deleteGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = store.invalidate(makeKey(1));
  await waitFor(() =>
    store.snapshot().entries.some((entry) => entry.state === "deleting"),
  );
  assert.equal(
    store.eventsSince(0).events.some((event) => event.type === "deleting"),
    true,
  );
  release?.();
  const result = await pending;
  assert.equal(result.status, "deleted");
  assert.equal(store.snapshot().entries.length, 0);
  assert.equal(
    store.eventsSince(0).events.some((event) => event.type === "deleted"),
    true,
  );
  await store.close();
});

test("keeps failed-delete bytes counted and constrained", async () => {
  const { store, root } = await openStore();
  const bytes = payload(16);
  await store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  const ns = namespaceOf(root);
  const entry = [...ns.children.values()].find(
    (child) => child instanceof FakeFileHandle && child.name.startsWith("e-"),
  );
  assert.ok(entry instanceof FakeFileHandle);
  root.failRemove.add(entry.name);
  ns.failRemove.add(entry.name);

  const result = await store.invalidate(makeKey(1));
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "delete-failed");
  assert.ok(store.snapshot().failedDeleteBytes > 0);
  assert.ok(ns.children.has(entry.name));
  assert.equal(
    store.eventsSince(0).events.some((event) => event.type === "deleted"),
    false,
  );
  await store.close();
});

test("close during an active write does not publish or leave a committed event", async () => {
  const { store, root } = await openStore();
  let release: (() => void) | null = null;
  root.writeGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bytes = payload(17);
  const pending = store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  await waitFor(() => store.snapshot().pendingWrites === 1);
  const closing = store.close();
  release?.();
  const result = await pending;
  assert.notEqual(result.status, "stored");
  const closeResult = await closing;
  assert.equal(closeResult.status, "closed");
  assert.equal(
    store.eventsSince(0).events.some((event) => event.type === "committed"),
    false,
  );
});

test("clear during an active write does not publish committed residency", async () => {
  const { store, root } = await openStore();
  let release: (() => void) | null = null;
  root.writeGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bytes = payload(18);
  const pending = store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  await waitFor(() => store.snapshot().pendingWrites === 1);
  const clearing = store.clearOwned();
  release?.();
  const result = await pending;
  assert.notEqual(result.status, "stored");
  const clearResult = await clearing;
  assert.equal(clearResult.status, "cleared");
  assert.equal(store.snapshot().committedEntries, 0);
  assert.equal(
    store.eventsSince(0).events.some((event) => event.type === "committed"),
    false,
  );
  await store.close();
});

test("bounded events resynchronise after overflow", async () => {
  const { store } = await openStore({ limits: { eventCapacity: 2 } });
  for (let frame = 1; frame <= 3; frame += 1) {
    const bytes = payload(20 + frame);
    assert.equal(
      (
        await store.put(makeKey(frame), bytes, {
          frameSizeBytes: FRAME_SIZE,
          expectedDigest: await digestOf(bytes),
        })
      ).status,
      "stored",
    );
  }
  const batch = store.eventsSince(0);
  assert.equal(batch.resynchronize, true);
  assert.equal(batch.events.length, 0);
  assert.ok(store.snapshot().droppedEventCount > 0);
  await store.close();
});

test("recovers an expired namespace only when the lock proves no live owner", async () => {
  const first = await openStore();
  const bytes = payload(21);
  await first.store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  first.locks.forceReleaseAll();
  first.advance(5 * 60 * 1000 + 1);

  const second = await openStore({
    namespace: "ns-1",
    owner: "owner-2",
    generation: 2,
    storage: first.root,
    locks: first.locks,
    now: () => 5 * 60 * 1000 + 1002,
  });
  assert.equal(second.openResult.status, "opened");
  assert.equal(second.store.snapshot().committedEntries, 0);
  await second.store.close();
});

test("blocks a fresh lease and an unprovable namespace instead of deleting it", async () => {
  const first = await openStore();
  const bytes = payload(22);
  await first.store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  first.locks.forceReleaseAll();

  const fresh = await openStore({
    namespace: "ns-1",
    owner: "owner-2",
    generation: 2,
    storage: first.root,
    locks: first.locks,
    now: () => 2000,
  });
  assert.equal(fresh.openResult.status, "unavailable");
  assert.equal(fresh.openResult.reason, "namespace-busy");
  assert.ok(namespaceOf(first.root).children.size > 0);

  const noLocks = await openStore({
    namespace: "ns-1",
    owner: "owner-3",
    generation: 3,
    storage: first.root,
    locks: { supported: false, async acquire() { return null; } },
    now: () => 999999,
  });
  assert.equal(noLocks.openResult.status, "unavailable");
  assert.equal(noLocks.openResult.reason, "namespace-unproven");
  assert.ok(namespaceOf(first.root).children.size > 0);
});

test("recover deletes an expired peer namespace inside the owned root only", async () => {
  const first = await openStore({ namespace: "ns-old" });
  const bytes = payload(30);
  await first.store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  first.locks.forceReleaseAll();
  first.advance(5 * 60 * 1000 + 1);

  const second = await openStore({
    namespace: "ns-new",
    owner: "owner-new",
    generation: 1,
    storage: first.root,
    locks: first.locks,
    now: () => 5 * 60 * 1000 + 1002,
  });
  assert.equal(second.openResult.status, "opened");
  const p3 = second.root
    .directory("dicoogle-next")
    ?.directory("native-frame-p3-v1");
  assert.ok(p3);
  assert.equal(p3.directory("ns-old"), null);
  assert.ok(p3.directory("ns-new"));
  await second.store.close();
});

test("recover removes only its own stale temp files and leaves other namespaces alone", async () => {
  const { store, root } = await openStore();
  const ns = namespaceOf(root);
  const temp = await ns.getFileHandle("t-stale.tmp", { create: true });
  temp.data = new Uint8Array([1, 2, 3]);
  const other = await root
    .getDirectoryHandle("dicoogle-next", { create: true })
    .then((app) => app.getDirectoryHandle("native-frame-p3-v1", { create: true }))
    .then((p3) => p3.getDirectoryHandle("other-ns", { create: true }));
  const otherFile = await other.getFileHandle("e-other.bin", { create: true });
  otherFile.data = new Uint8Array([9, 9]);

  const result = await store.recover();
  assert.equal(result.deletedTempFiles, 1);
  assert.equal(ns.file("t-stale.tmp"), null);
  assert.ok(other.file("e-other.bin"));
  await store.close();
});

test("replacement publishes a new complete entry and deletes the old one", async () => {
  const { store, root } = await openStore();
  const first = payload(23);
  const second = payload(24);
  await store.put(makeKey(1), first, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(first),
  });
  const replaced = await store.put(makeKey(1), second, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(second),
  });
  assert.equal(replaced.status, "replaced");
  const get = await store.get(makeKey(1), {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(second),
  });
  assert.equal(get.status, "hit");
  assert.deepEqual(get.bytes, second);
  const ns = namespaceOf(root);
  assert.equal(
    [...ns.children.values()].filter(
      (child) => child instanceof FakeFileHandle && child.name.startsWith("e-"),
    ).length,
    1,
  );
  await store.close();
});

test("a failed replacement publication leaves the old complete entry intact", async () => {
  const { store, root } = await openStore();
  const first = payload(27);
  const second = payload(28);
  await store.put(makeKey(1), first, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(first),
  });
  root.failNextMove = true;
  const failed = await store.put(makeKey(1), second, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(second),
  });
  assert.equal(failed.status, "failed");
  const get = await store.get(makeKey(1), {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(first),
  });
  assert.equal(get.status, "hit");
  assert.deepEqual(get.bytes, first);
  assert.equal(store.snapshot().committedEntries, 1);
  await store.close();
});

test("a missing entry file becomes a miss and cannot remain a hit", async () => {
  const { store, root } = await openStore();
  const bytes = payload(25);
  await store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  const ns = namespaceOf(root);
  const entry = [...ns.children.values()].find(
    (child) => child instanceof FakeFileHandle && child.name.startsWith("e-"),
  );
  assert.ok(entry instanceof FakeFileHandle);
  await ns.removeEntry(entry.name);
  const result = await store.get(makeKey(1), {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  assert.equal(result.status, "miss");
  assert.equal(result.reason, "missing");
  assert.equal(store.snapshot().committedEntries, 0);
  await store.close();
});

test("owner activation invalidates an unsettled write", async () => {
  const { store, root } = await openStore();
  let release: (() => void) | null = null;
  root.writeGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bytes = payload(26);
  const pending = store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  await waitFor(() => store.snapshot().pendingWrites === 1);
  const activation = store.activate("owner-2", 2);
  release?.();
  assert.equal((await activation).status, "updated");
  const result = await pending;
  assert.notEqual(result.status, "stored");
  assert.equal(store.snapshot().committedEntries, 0);
  await store.close();
});

test("fixture digest lookup returns a value for the supported fixture only", () => {
  assert.equal(
    getNativeFrameFixtureDigest(
      {
        studyInstanceUID: STUDY,
        seriesInstanceUID: SERIES,
        sopInstanceUID: SOP,
      },
      1,
    )?.length,
    64,
  );
});

test("requires move() and leaves a no-move store closed", async () => {
  const { store, openResult, root, locks } = await openStore({
    moveSupported: false,
  });
  assert.equal(openResult.status, "unavailable");
  assert.equal(openResult.reason, "move-unavailable");
  assert.equal(store.capabilities().move, false);
  assert.equal(root.totalBytes(), 0);
  assert.equal(locks.held.size, 0);
});

test("a failed new-entry move performs no publication and leaves no file", async () => {
  const { store, root } = await openStore();
  const bytes = payload(31);
  root.failNextMove = true;
  const result = await store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "write-failed");
  assert.equal(store.snapshot().committedEntries, 0);
  const ns = namespaceOf(root);
  assert.equal(
    [...ns.children.keys()].some((name) => name.startsWith("e-")),
    false,
  );
  assert.equal(
    [...ns.children.keys()].some((name) => name.startsWith("t-")),
    false,
  );
  assert.equal(
    store.eventsSince(0).events.some((event) => event.type === "committed"),
    false,
  );
  await store.close();
});

test("a failed replacement move keeps and re-verifies the old entry", async () => {
  const { store, root } = await openStore();
  const first = payload(32);
  const second = payload(33);
  await store.put(makeKey(1), first, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(first),
  });
  root.failNextMove = true;
  const failed = await store.put(makeKey(1), second, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(second),
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.reason, "write-failed");
  const get = await store.get(makeKey(1), {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(first),
  });
  assert.equal(get.status, "hit");
  assert.deepEqual(get.bytes, first);
  assert.equal(store.snapshot().committedEntries, 1);
  const ns = namespaceOf(root);
  assert.equal(
    [...ns.children.keys()].filter((name) => name.startsWith("e-")).length,
    1,
  );
  assert.equal(
    [...ns.children.keys()].some((name) => name.startsWith("t-")),
    false,
  );
  await store.close();
});

test("close reports write-in-flight, holds the lock, and retries after settlement", async () => {
  const first = await openStore();
  let release: (() => void) | null = null;
  first.root.writeGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bytes = payload(34);
  const pending = first.store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  await waitFor(() => first.store.snapshot().pendingWrites === 1);
  const failedClose = await first.store.close();
  assert.equal(failedClose.status, "failed");
  assert.equal(failedClose.reason, "write-in-flight");
  assert.equal(first.locks.held.size, 1);
  assert.notEqual(namespaceOf(first.root).file("lease.json"), null);

  const peer = makeStore({
    namespace: "ns-1",
    owner: "peer-owner",
    generation: 2,
    storage: first.root,
    locks: first.locks,
  });
  const peerOpen = await peer.store.open();
  assert.equal(peerOpen.status, "unavailable");
  assert.equal(peerOpen.reason, "namespace-busy");

  release?.();
  assert.notEqual((await pending).status, "stored");
  const retry = await first.store.close();
  assert.equal(retry.status, "closed");
  assert.equal(first.locks.held.size, 0);
});

test("clear reports write-in-flight, keeps the namespace, and retries", async () => {
  const first = await openStore();
  let release: (() => void) | null = null;
  first.root.writeGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bytes = payload(35);
  const pending = first.store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  await waitFor(() => first.store.snapshot().pendingWrites === 1);
  const failedClear = await first.store.clearOwned();
  assert.equal(failedClear.status, "failed");
  assert.equal(failedClear.reason, "write-in-flight");
  assert.equal(first.locks.held.size, 1);
  assert.notEqual(namespaceOf(first.root).file("lease.json"), null);

  const peer = makeStore({
    namespace: "ns-1",
    owner: "peer-owner",
    generation: 2,
    storage: first.root,
    locks: first.locks,
  });
  assert.equal((await peer.store.open()).reason, "namespace-busy");

  release?.();
  assert.notEqual((await pending).status, "stored");
  const retry = await first.store.clearOwned();
  assert.equal(retry.status, "cleared");
  assert.equal(first.store.snapshot().committedEntries, 0);
  assert.equal((await first.store.close()).status, "closed");
});

test("a failed open releases the lock and leaves no live lease", async () => {
  const first = makeStore();
  first.root.failNextWrite = true;
  const failed = await first.store.open();
  assert.equal(failed.status, "failed");
  assert.equal(failed.reason, "lease-write-failed");
  assert.equal(first.locks.held.size, 0);
  assert.equal(namespaceOf(first.root).file("lease.json"), null);

  const second = makeStore({
    namespace: "ns-1",
    owner: "owner-2",
    generation: 2,
    storage: first.root,
    locks: first.locks,
  });
  assert.equal((await second.store.open()).status, "opened");
  await second.store.close();
});

test("active temp bytes are scanned once, not double-counted with reservations", async () => {
  const { store, root } = await openStore({
    limits: { maxRootFileBytes: OPFS_FILE_BYTES * 2 + 1024 },
  });
  let release: (() => void) | null = null;
  root.writeGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = payload(36);
  const second = payload(37);
  const pendingFirst = store.put(makeKey(1), first, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(first),
  });
  await waitFor(() =>
    [...namespaceOf(root).children.values()].some(
      (child) =>
        child instanceof FakeFileHandle &&
        child.name.startsWith("t-") &&
        child.data.byteLength === OPFS_FILE_BYTES,
    ),
  );
  const pendingSecond = store.put(makeKey(2), second, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(second),
  });
  release?.();
  assert.equal((await pendingFirst).status, "stored");
  assert.equal((await pendingSecond).status, "stored");
  assert.equal(store.snapshot().committedEntries, 2);
  await store.close();
});

test("two live namespaces share the root cap without deleting the live peer", async () => {
  const first = await openStore({ namespace: "ns-a" });
  for (let frame = 1; frame <= 8; frame += 1) {
    const bytes = payload(40 + frame);
    assert.equal(
      (
        await first.store.put(makeKey(frame), bytes, {
          frameSizeBytes: FRAME_SIZE,
          expectedDigest: await digestOf(bytes),
        })
      ).status,
      "stored",
    );
  }
  const second = await openStore({
    namespace: "ns-b",
    owner: "owner-b",
    storage: first.root,
    locks: first.locks,
  });
  for (let frame = 1; frame <= 7; frame += 1) {
    const bytes = payload(50 + frame);
    assert.equal(
      (
        await second.store.put(makeKey(frame), bytes, {
          frameSizeBytes: FRAME_SIZE,
          expectedDigest: await digestOf(bytes),
        })
      ).status,
      "stored",
    );
  }
  const last = payload(58);
  const blocked = await second.store.put(makeKey(8), last, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(last),
  });
  assert.equal(blocked.status, "skipped");
  assert.equal(blocked.reason, "root-cap");
  assert.equal(first.store.snapshot().committedEntries, 8);
  assert.equal(second.store.snapshot().committedEntries, 7);

  const recovered = await second.store.recover();
  assert.equal(recovered.status, "ok");
  assert.ok(recovered.skippedNamespaces >= 1);
  assert.equal(first.store.snapshot().committedEntries, 8);
  await second.store.close();
  await first.store.close();
});

test("recover reports busy and bounded scan outcomes", async () => {
  const busy = await openStore();
  let release: (() => void) | null = null;
  busy.root.writeGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bytes = payload(60);
  const pending = busy.store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  await waitFor(() => busy.store.snapshot().pendingWrites === 1);
  const busyResult = await busy.store.recover();
  assert.equal(busyResult.status, "skipped");
  assert.equal(busyResult.reason, "busy");
  release?.();
  await pending;
  await busy.store.close();

  const limited = await openStore({
    namespace: "ns-limited",
    limits: { maxScanNamespaces: 1 },
  });
  const p3 = limited.root
    .directory("dicoogle-next")
    ?.directory("native-frame-p3-v1");
  assert.ok(p3);
  await p3.getDirectoryHandle("peer-a", { create: true });
  await p3.getDirectoryHandle("peer-b", { create: true });
  const partial = await limited.store.recover();
  assert.equal(partial.status, "partial");
  assert.equal(partial.reason, "scan-limit");
  await limited.store.close();
});

test("recover propagates own-temp delete errors", async () => {
  const { store, root } = await openStore();
  const ns = namespaceOf(root);
  const temp = await ns.getFileHandle("t-unremovable.tmp", { create: true });
  temp.data = new Uint8Array([1, 2, 3]);
  ns.failRemove.add("t-unremovable.tmp");
  const result = await store.recover();
  assert.equal(result.status, "partial");
  assert.equal(result.reason, "delete-failed");
  assert.ok(result.errors > 0);
  await store.close();
});

test("activation lease failure preserves the old lease owner", async () => {
  const { store, root } = await openStore();
  root.failNextWrite = true;
  const failed = await store.activate("owner-2", 2);
  assert.equal(failed.status, "failed");
  assert.equal(failed.reason, "lease-write-failed");
  const leaseFile = namespaceOf(root).file("lease.json");
  assert.ok(leaseFile);
  const lease = JSON.parse(new TextDecoder().decode(leaseFile.data)) as {
    ownerId: string;
    generation: number;
  };
  assert.equal(lease.ownerId, "owner-1");
  assert.equal(lease.generation, 1);

  const bytes = payload(61);
  const put = await store.put(makeKey(1), bytes, {
    frameSizeBytes: FRAME_SIZE,
    expectedDigest: await digestOf(bytes),
  });
  assert.equal(put.status, "stored");
  await store.close();
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 2000) {
      throw new Error("condition not reached");
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
