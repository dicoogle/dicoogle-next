import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import {
  MULTIFRAME_GRAYSCALE_WORD_SC_SOP_CLASS_UID,
  NATIVE_FRAME_TRANSFER_SYNTAX_UID,
  type NativeFrameContext,
  type NativeFrameLocator,
  type NativeFramePayload,
  type NativeFrameRequest,
  type WrappedSingleFrame,
} from "../src/services/nativeFrameContract";
import type { FramePresenter } from "../src/services/nativeFramePresenter";
import {
  NativeFrameSession,
  type NativeFrameSessionOptions,
} from "../src/services/nativeFrameSession";
import { NativeFramePlaintextOpfs } from "../src/services/nativeFramePlaintextOpfs";
import type {
  NativeFramePlaintextOpfsCapabilities,
  NativeFramePlaintextOpfsEventBatch,
  NativeFramePlaintextOpfsSnapshot,
} from "../src/services/nativeFramePlaintextOpfs";
import type { NativeFrameDualWindowConfig } from "../src/services/nativeFrameDualWindowPolicy";
import {
  createFakeRoot,
  FakeLocks,
} from "./helpers/plaintextOpfsFake";
import {
  SYNTHETIC_FIXTURE_INSTANCE_A_UID,
  SYNTHETIC_FIXTURE_SERIES_A_UID,
  SYNTHETIC_FIXTURE_STUDY_UID,
} from "../src/services/nativeFrameFixture";

const FRAME_SIZE = 8192;
const STUDY = SYNTHETIC_FIXTURE_STUDY_UID;
const SERIES = SYNTHETIC_FIXTURE_SERIES_A_UID;
const INSTANCE = SYNTHETIC_FIXTURE_INSTANCE_A_UID;
const CACHE_SCOPE = {
  principalId: "synthetic-principal-p3",
  sessionId: "viewer-session-p3",
};
const locator: NativeFrameLocator = {
  studyInstanceUID: STUDY,
  seriesInstanceUID: SERIES,
  sopInstanceUID: INSTANCE,
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
  frameSizeBytes: FRAME_SIZE,
};

class TestPresenter implements FramePresenter {
  calls = 0;
  visibleRequestId: number | null = null;
  private latestRequestId = 0;
  begin(requestId: number): void {
    this.latestRequestId = requestId;
  }
  async present(
    requestId: number,
    wrapped: WrappedSingleFrame,
  ): Promise<string | null> {
    void wrapped;
    if (requestId !== this.latestRequestId) return null;
    this.calls += 1;
    this.visibleRequestId = requestId;
    return `image-${requestId}`;
  }
  close(): void {
    this.visibleRequestId = null;
  }
  registrationCount(): number {
    return this.visibleRequestId === null ? 0 : 1;
  }
}

function bytesFor(frameNumber: number): Uint8Array {
  const bytes = new Uint8Array(FRAME_SIZE);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (index * 13 + frameNumber * 29) & 0xff;
  }
  return bytes;
}

async function digestFor(bytes: Uint8Array): Promise<string> {
  const digest = await webcrypto.subtle.digest(
    "SHA-256",
    bytes as unknown as BufferSource,
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function keyId(key: {
  principalId: string;
  sessionId: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  sopInstanceUID: string;
  frameNumber: number;
  representation: string;
  transferSyntaxUID: string;
  sourceVersion: string;
}): string {
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

interface FakeEntry {
  alias: string;
  keyId: string;
  frameNumber: number;
  nativeBytes: number;
  fileBytes: number;
  bytes: Uint8Array;
}

class FakeP3Adapter {
  opened = true;
  closed = false;
  move = true;
  openCalls = 0;
  closeCalls = 0;
  closeResult: "closed" | "failed" = "closed";
  openGate: Promise<void> | null = null;
  putGate: Promise<void> | null = null;
  putFailure: string | null = null;
  getResult: "hit" | "miss" | "invalid" | null = null;
  entries = new Map<string, FakeEntry>();
  events: Array<{
    sequence: number;
    type: "committed" | "deleted" | "invalidated";
    alias: string;
    nativeBytes: number;
    fileBytes: number;
  }> = [];
  sequence = 0;

  async open() {
    this.openCalls += 1;
    if (this.openGate) await this.openGate;
    this.closed = false;
    return {
      status: this.opened ? ("opened" as const) : ("unavailable" as const),
      reason: this.opened ? undefined : ("move-unavailable" as const),
      capabilities: this.capabilities(),
      snapshot: this.snapshot(),
    };
  }
  capabilities(): NativeFramePlaintextOpfsCapabilities {
    return {
      opfs: true,
      writable: true,
      locks: true,
      subtle: true,
      move: this.move,
    };
  }
  async get(key: Parameters<NativeFramePlaintextOpfs["get"]>[0]) {
    if (this.getResult === "miss") return { status: "miss" as const };
    if (this.getResult === "invalid") {
      const entry = this.entries.get(keyId(key));
      if (entry) {
        this.entries.delete(entry.keyId);
        this.sequence += 1;
        this.events.push({
          sequence: this.sequence,
          type: "invalidated",
          alias: entry.alias,
          nativeBytes: entry.nativeBytes,
          fileBytes: entry.fileBytes,
        });
      }
      return { status: "invalid" as const, reason: "digest-mismatch" as const };
    }
    const entry = this.entries.get(keyId(key));
    if (!entry) return { status: "miss" as const };
    return {
      status: "hit" as const,
      bytes: entry.bytes.slice(),
      entryAlias: entry.alias,
      nativeBytes: entry.nativeBytes,
      verified: true,
    };
  }
  async put(
    key: Parameters<NativeFramePlaintextOpfs["put"]>[0],
    bytes: Uint8Array,
  ) {
    if (this.putGate) await this.putGate;
    if (this.closed) {
      return { status: "unavailable" as const, reason: "closed" as const };
    }
    if (this.putFailure) {
      return { status: "failed" as const, reason: this.putFailure as never };
    }
    const alias = `alias-${key.frameNumber}`;
    const entry: FakeEntry = {
      alias,
      keyId: keyId(key),
      frameNumber: key.frameNumber,
      nativeBytes: bytes.byteLength,
      fileBytes: bytes.byteLength + 80,
      bytes: bytes.slice(),
    };
    this.entries.set(entry.keyId, entry);
    this.sequence += 1;
    this.events.push({
      sequence: this.sequence,
      type: "committed",
      alias,
      nativeBytes: entry.nativeBytes,
      fileBytes: entry.fileBytes,
    });
    return {
      status: "stored" as const,
      entryAlias: alias,
      nativeBytes: entry.nativeBytes,
      fileBytes: entry.fileBytes,
    };
  }
  async invalidate(key: Parameters<NativeFramePlaintextOpfs["invalidate"]>[0]) {
    const entry = this.entries.get(keyId(key));
    if (!entry) return { status: "miss" as const };
    this.entries.delete(entry.keyId);
    this.sequence += 1;
    this.events.push({
      sequence: this.sequence,
      type: "deleted",
      alias: entry.alias,
      nativeBytes: entry.nativeBytes,
      fileBytes: entry.fileBytes,
    });
    return { status: "deleted" as const, entryAlias: entry.alias };
  }
  async close() {
    this.closeCalls += 1;
    if (this.closeResult === "failed") {
      return { status: "failed" as const, reason: "write-in-flight" as const };
    }
    this.closed = true;
    this.entries.clear();
    return { status: "closed" as const };
  }
  snapshot(): NativeFramePlaintextOpfsSnapshot {
    const entries = [...this.entries.values()];
    const fileBytes = entries.reduce((total, entry) => total + entry.fileBytes, 0);
    return {
      storeId: "fake",
      revision: this.sequence,
      sequence: this.sequence,
      oldestSequence: this.events[0]?.sequence ?? null,
      droppedEventCount: 0,
      open: true,
      capabilities: this.capabilities(),
      entries: entries.map((entry) => ({
        alias: entry.alias,
        state: "committed" as const,
        nativeBytes: entry.nativeBytes,
        fileBytes: entry.fileBytes,
      })),
      truncated: false,
      committedEntries: entries.length,
      committedNativeBytes: entries.reduce(
        (total, entry) => total + entry.nativeBytes,
        0,
      ),
      committedFileBytes: fileBytes,
      pendingWrites: 0,
      pendingNativeBytes: 0,
      reservedFileBytes: 0,
      queuedWrites: 0,
      rootFileBytes: fileBytes,
      tempFileBytes: 0,
      failedDeleteBytes: 0,
      lease: { state: "live", updatedAt: 1 },
      limits: {
        maxCommittedNativeBytes: 64 * 1024,
        maxEntryNativeBytes: 8 * 1024,
        maxEntries: 8,
        maxRootFileBytes: 128 * 1024,
        maxHeaderBytes: 80,
        maxLeaseBytes: 1024,
        maxQueuedWrites: 1,
        maxPendingNativeBytes: 16 * 1024,
        maxScanNamespaces: 32,
        maxScanEntries: 64,
        eventCapacity: 64,
        leaseTtlMs: 300000,
        leaseHeartbeatMs: 30000,
      },
    };
  }
  eventsSince(afterSequence: number): NativeFramePlaintextOpfsEventBatch {
    const events = this.events
      .filter((event) => event.sequence > afterSequence)
      .map((event) => ({
        sequence: event.sequence,
        revision: event.sequence,
        type: event.type,
        entryAlias: event.alias,
        nativeBytes: event.nativeBytes,
        fileBytes: event.fileBytes,
      }));
    return {
      storeId: "fake",
      afterSequence,
      oldestSequence: this.events[0]?.sequence ?? null,
      latestSequence: this.sequence,
      revision: this.sequence,
      events,
      droppedEventCount: 0,
      resynchronize: false,
    };
  }
}

interface P3Harness {
  session: NativeFrameSession;
  adapter: FakeP3Adapter;
  presenter: TestPresenter;
  networkCalls: number[];
  digests: Map<number, string>;
  config: NativeFrameDualWindowConfig;
}

async function makeHarness(
  adapter = new FakeP3Adapter(),
  options: Partial<NativeFrameSessionOptions> = {},
  config: NativeFrameDualWindowConfig = {
    ram: { behind: 1, ahead: 1 },
    opfs: { behind: 3, ahead: 3 },
  },
): Promise<P3Harness> {
  const digests = new Map<number, string>();
  for (let frame = 1; frame <= 8; frame += 1) {
    digests.set(frame, await digestFor(bytesFor(frame)));
  }
  const presenter = new TestPresenter();
  const networkCalls: number[] = [];
  const session = new NativeFrameSession(locator, {
    baseUrl: "https://example.test/next/api",
    token: "test-token",
    presenter,
    mode: "p1",
    cacheScope: CACHE_SCOPE,
    loadMetadata: async () => ({
      context,
      sourceTransferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
    }),
    loadFrame: async (
      request: NativeFrameRequest,
    ): Promise<NativeFramePayload> => {
      networkCalls.push(request.frameNumber);
      return {
        representation: "native-frame-v1",
        frameNumber: request.frameNumber,
        transferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
        bytes: bytesFor(request.frameNumber),
      };
    },
    p3: {
      adapter: adapter as unknown as NativeFramePlaintextOpfs,
      config,
    },
    p3Digest: (_locator, frameNumber) => digests.get(frameNumber) ?? null,
    now: () => 0,
    ...options,
  });
  await session.open();
  return { session, adapter, presenter, networkCalls, digests, config };
}

function presented(result: Awaited<ReturnType<NativeFrameSession["selectFrame"]>>) {
  assert.equal(result.status, "presented");
  if (result.status !== "presented") throw new Error("not presented");
  return result;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 2000) throw new Error("condition not reached");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

test("P3 entry enables storage and OPFS hit reads do not refetch network", async () => {
  const { session, adapter, networkCalls } = await makeHarness();
  const entered = await session.setModeAsync("p3");
  assert.equal(entered.status, "enabled");
  assert.equal(adapter.openCalls, 1);

  const first = presented(await session.selectFrame(1));
  assert.equal(first.source, "network");
  assert.equal(first.opfsCache, "miss");
  await waitFor(() => session.metrics().opfs?.entries === 1);
  assert.equal(networkCalls.length, 1);

  session.clearRam();
  const second = presented(await session.selectFrame(1));
  assert.equal(second.opfsSource, "opfs");
  assert.equal(second.opfsCache, "hit");
  assert.equal(second.promotedToRam, true);
  assert.equal(networkCalls.length, 1);
  assert.equal(session.metrics().opfs?.source, "opfs");
});

test("P3 real adapter double round-trips through the session and OPFS hit path", async () => {
  const root = createFakeRoot();
  const locks = new FakeLocks();
  let alias = 0;
  const realAdapter = new NativeFramePlaintextOpfs({
    namespaceId: "p3-real-ns",
    ownerId: "p3-real-owner",
    generation: 1,
    storage: root,
    locks,
    subtle: webcrypto.subtle as unknown as SubtleCrypto,
    moveSupported: true,
    maintenanceTimeoutMs: 50,
    aliasFactory: () => `real-${++alias}`,
  });
  const { session, networkCalls } = await makeHarness(
    realAdapter as unknown as FakeP3Adapter,
  );
  const entered = await session.setModeAsync("p3");
  assert.equal(entered.status, "enabled");
  await session.selectFrame(1);
  await waitFor(() => session.metrics().opfs?.entries === 1);
  session.clearRam();
  const hit = presented(await session.selectFrame(1));
  assert.equal(hit.opfsSource, "opfs");
  assert.equal(hit.opfsCache, "hit");
  assert.equal(hit.promotedToRam, true);
  assert.equal(networkCalls.length, 1);
  assert.equal((await session.closeP3()).status, "closed");
});

test("P3 degrades to labelled RAM-only when adapter open lacks move", async () => {
  const adapter = new FakeP3Adapter();
  adapter.opened = false;
  adapter.move = false;
  const { session, networkCalls } = await makeHarness(adapter);
  const entered = await session.setModeAsync("p3");
  assert.equal(entered.status, "degraded");
  assert.ok(entered.storageError);
  const result = presented(await session.selectFrame(1));
  assert.equal(result.opfsSource, null);
  assert.equal(session.metrics().opfs?.status, "degraded");
  assert.equal(session.metrics().opfs?.entries, 0);
  assert.equal(networkCalls.length, 1);
});

test("P3 opfs digest failure falls back to network without residency", async () => {
  const { session, adapter, networkCalls } = await makeHarness();
  await session.setModeAsync("p3");
  await session.selectFrame(1);
  await waitFor(() => session.metrics().opfs?.entries === 1);
  session.clearRam();
  adapter.getResult = "invalid";
  const result = presented(await session.selectFrame(1));
  assert.equal(result.opfsSource, null);
  assert.equal(result.opfsCache, "invalid");
  assert.equal(networkCalls.length, 2);
  assert.ok((session.metrics().opfs?.errors["digest-mismatch"] ?? 0) > 0);
});

test("P3 pending publication supersedes only before the adapter write starts", async () => {
  const { session, adapter } = await makeHarness();
  await session.setModeAsync("p3");
  let release!: () => void;
  adapter.putGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await session.selectFrame(1);
  await waitFor(() => session.metrics().opfs?.pendingWrites === 1);
  await session.selectFrame(2);
  // The active write is not superseded; the second publication is reported busy.
  assert.ok((session.metrics().opfs?.errors["publication-busy"] ?? 0) > 0);
  release();
  await waitFor(() => session.metrics().opfs?.entries === 1);
  assert.equal(session.metrics().displayedFrame, 2);
});

test("P3 failed close keeps cleanup-required and retries without false residency", async () => {
  const { session, adapter } = await makeHarness();
  await session.setModeAsync("p3");
  adapter.closeResult = "failed";
  const failed = await session.closeP3();
  assert.equal(failed.status, "failed");
  assert.equal(session.metrics().opfs?.status, "cleanup-required");
  assert.ok(session.metrics().opfs?.storageError);
  // Viewing continues in RAM/network-only mode.
  const result = presented(await session.selectFrame(1));
  assert.equal(result.opfsSource, null);
  adapter.closeResult = "closed";
  const retry = await session.retryCloseP3();
  assert.equal(retry.status, "closed");
  assert.equal(session.metrics().opfs?.entries, 0);
});

test("P3 single-flight rejects/queues double entry and exits during entry", async () => {
  const adapter = new FakeP3Adapter();
  let release!: () => void;
  adapter.openGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { session } = await makeHarness(adapter);
  const first = session.setModeAsync("p3");
  const second = session.setModeAsync("p3");
  const exit = session.setModeAsync("p2");
  release();
  assert.equal((await first).status, "enabled");
  assert.equal((await second).status, "enabled");
  assert.equal(adapter.openCalls, 1);
  const exitResult = await exit;
  assert.equal(exitResult.mode, "p2");
  assert.equal(session.metrics().mode, "p2");
});

test("P3 navigation 1..8 uses hits and 3/3 maintenance deletes outside entries", async () => {
  const config = {
    ram: { behind: 1, ahead: 1 },
    opfs: { behind: 7, ahead: 7 },
  };
  const { session, adapter, networkCalls } = await makeHarness(
    new FakeP3Adapter(),
    {},
    config,
  );
  await session.setModeAsync("p3");
  for (let frame = 1; frame <= 8; frame += 1) {
    presented(await session.selectFrame(frame));
  }
  await waitFor(() => session.metrics().opfs?.entries === 8);
  assert.equal(networkCalls.length, 8);

  for (let frame = 1; frame <= 8; frame += 1) {
    const result = presented(await session.selectFrame(frame));
    assert.equal(result.opfsSource === "opfs" || result.source === "ram", true);
  }
  assert.equal(networkCalls.length, 8);
  assert.equal(session.metrics().opfs?.entries, 8);

  // Switch to the default 3/3 policy and select 8; the policy must delete
  // frames 1–4 from disk after the completed hit.
  (config as { opfs: { behind: number; ahead: number } }).opfs = {
    behind: 3,
    ahead: 3,
  };
  presented(await session.selectFrame(8));
  await waitFor(() => session.metrics().opfs?.entries === 4);
  assert.equal(adapter.entries.size, 4);
  assert.deepEqual(
    [...adapter.entries.values()]
      .map((entry) => entry.frameNumber)
      .sort((left, right) => left - right),
    [5, 6, 7, 8],
  );
});

test("P3 default demo trace 1..5 then 2 has one OPFS hit and deletes frame 1", async () => {
  const { session, adapter, networkCalls } = await makeHarness();
  await session.setModeAsync("p3");
  for (let frame = 1; frame <= 5; frame += 1) {
    presented(await session.selectFrame(frame));
    await waitFor(() =>
      frame === 1
        ? (session.metrics().opfs?.entries ?? 0) >= 1
        : (session.metrics().opfs?.entries ?? 0) >= Math.min(frame, 4),
    );
  }
  await waitFor(() => session.metrics().opfs?.entries === 4);
  assert.equal(networkCalls.length, 5);

  const hit = presented(await session.selectFrame(2));
  assert.equal(hit.opfsSource, "opfs");
  assert.equal(hit.opfsCache, "hit");
  assert.equal(hit.promotedToRam, true);
  assert.equal(networkCalls.length, 5);
  assert.equal(session.metrics().lastSource, "opfs");
  assert.deepEqual(
    [...adapter.entries.values()]
      .map((entry) => entry.frameNumber)
      .sort((left, right) => left - right),
    [2, 3, 4, 5],
  );
  assert.equal(session.metrics().opfs?.entries, 4);
  const ramWindow = session.metrics().window;
  assert.ok(ramWindow);
  assert.equal(ramWindow.startFrame, 1);
  assert.equal(ramWindow.endFrame, 3);
  assert.equal(ramWindow.behind, 1);
  assert.equal(ramWindow.ahead, 1);
  assert.deepEqual(session.metrics().cache?.frames, [2]);
});

test("P3 OPFS hit does not increment network or RAM-hit counters", async () => {
  const { session } = await makeHarness();
  await session.setModeAsync("p3");
  await session.selectFrame(1);
  await waitFor(() => session.metrics().opfs?.entries === 1);
  await session.selectFrame(2);
  await waitFor(() => session.metrics().opfs?.entries === 2);
  session.clearRam();
  const before = session.metrics();
  const hit = presented(await session.selectFrame(2));
  const after = session.metrics();

  assert.equal(hit.opfsSource, "opfs");
  assert.equal(hit.opfsCache, "hit");
  assert.equal(hit.promotedToRam, true);
  // Legacy result.source is intentionally ram/network for viewer compatibility;
  // the P3 truth is opfsSource and lastSource.
  assert.equal(hit.source, "ram");
  assert.equal(hit.nativeCache, "miss");
  assert.equal(after.lastSource, "opfs");
  assert.equal(after.cache?.hits, before.cache?.hits);
  assert.equal(after.cache?.hits, 0);
  assert.equal(after.frameBodyRequests, before.frameBodyRequests);
  assert.equal(after.demandFrameBodyRequests, before.demandFrameBodyRequests);
  assert.equal(after.prefetchFrameBodyRequests, 0);
  assert.equal(after.opfs?.cache, "hit");
  assert.equal(after.opfs?.source, "opfs");
  assert.equal(after.opfs?.promotedToRam, true);
});

test("P3 late completion after navigation is reconciled and outside entries deleted", async () => {
  const { session, adapter } = await makeHarness();
  await session.setModeAsync("p3");
  let release!: () => void;
  adapter.putGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await session.selectFrame(1);
  await waitFor(() => session.metrics().opfs?.pendingWrites === 1);
  await session.selectFrame(2);
  adapter.closeResult = "failed";
  assert.equal((await session.closeP3()).status, "failed");
  release();
  await waitFor(() => adapter.entries.size === 0);
  assert.equal(session.metrics().displayedFrame, 2);
  assert.equal(session.metrics().opfs?.entries, 0);
  assert.equal(session.metrics().opfs?.status, "cleanup-required");
});

test("P3 mode exit during an active write does not repopulate a closed map", async () => {
  const { session, adapter } = await makeHarness();
  await session.setModeAsync("p3");
  let release!: () => void;
  adapter.putGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await session.selectFrame(1);
  await waitFor(() => session.metrics().opfs?.pendingWrites === 1);
  adapter.closeResult = "closed";
  const exit = await session.setModeAsync("p2");
  assert.equal(exit.mode, "p2");
  release();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(session.metrics().mode, "p2");
  assert.equal(session.metrics().opfs, null);
  assert.equal(adapter.entries.size, 0);
});

test("P3 clear RAM keeps OPFS residency and the next read is an OPFS hit", async () => {
  const { session, adapter, networkCalls } = await makeHarness();
  await session.setModeAsync("p3");
  await session.selectFrame(1);
  await waitFor(() => session.metrics().opfs?.entries === 1);
  session.clearRam();
  const result = presented(await session.selectFrame(1));
  assert.equal(result.opfsSource, "opfs");
  assert.equal(result.opfsCache, "hit");
  assert.equal(networkCalls.length, 1);
  assert.equal(adapter.entries.size, 1);
});

test("P3 publication failures are visible with counters and no false residency", async () => {
  for (const failure of [
    "quota-exceeded",
    "write-failed",
    "queue-full",
    "root-cap",
  ]) {
    const { session, adapter } = await makeHarness();
    await session.setModeAsync("p3");
    adapter.putFailure = failure;
    const result = presented(await session.selectFrame(1));
    await waitFor(
      () => (session.metrics().opfs?.errors[failure] ?? 0) > 0,
    );
    assert.ok((session.metrics().opfs?.errors[failure] ?? 0) > 0);
    assert.equal(session.metrics().opfs?.entries, 0);
    assert.equal(session.metrics().opfs?.status, "enabled");
    assert.equal(result.opfsSource, null);
  }
});

test("P3 mode exit with failed close stays cleanup-required and retries", async () => {
  const { session, adapter } = await makeHarness();
  await session.setModeAsync("p3");
  let release!: () => void;
  adapter.putGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await session.selectFrame(1);
  await waitFor(() => session.metrics().opfs?.pendingWrites === 1);
  adapter.closeResult = "failed";
  const exit = await session.setModeAsync("p2");
  assert.equal(exit.status, "failed");
  assert.equal(session.metrics().mode, "p3");
  assert.equal(session.metrics().opfs?.status, "cleanup-required");
  release();
  await waitFor(() => session.metrics().opfs?.entries === 1);
  adapter.closeResult = "closed";
  assert.equal((await session.retryCloseP3()).status, "closed");
  const retryExit = await session.setModeAsync("p2");
  assert.equal(retryExit.mode, "p2");
});

test("P3 late completion after failed close/logout is retained when in window and retry cleans", async () => {
  const { session, adapter } = await makeHarness();
  await session.setModeAsync("p3");
  let release!: () => void;
  adapter.putGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await session.selectFrame(1);
  await waitFor(() => session.metrics().opfs?.pendingWrites === 1);
  adapter.closeResult = "failed";
  assert.equal((await session.closeP3()).status, "failed");
  release();
  await waitFor(() => session.metrics().opfs?.entries === 1);
  assert.equal(session.metrics().opfs?.status, "cleanup-required");
  adapter.closeResult = "closed";
  assert.equal((await session.retryCloseP3()).status, "closed");
  assert.equal(session.metrics().opfs?.entries, 0);
  assert.equal(adapter.entries.size, 0);
});

