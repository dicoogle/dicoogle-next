import assert from "node:assert/strict";
import { test } from "node:test";
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
  type NativeFrameSessionMetrics,
  type NativeFrameSessionOptions,
} from "../src/services/nativeFrameSession";
import type { NativeFramePlaintextOpfs } from "../src/services/nativeFramePlaintextOpfs";
import type {
  NativeFramePlaintextOpfsCapabilities,
  NativeFramePlaintextOpfsEventBatch,
  NativeFramePlaintextOpfsSnapshot,
} from "../src/services/nativeFramePlaintextOpfs";
import type { NativeFrameDualWindowConfig } from "../src/services/nativeFrameDualWindowPolicy";
import {
  buildNativeFrameResidencyView,
  reduceNativeFrameResidency,
  type NativeFrameResidencyState,
  type NativeFrameResidencyView,
} from "../src/services/nativeFrameResidency";
import {
  SYNTHETIC_FIXTURE_INSTANCE_A_UID,
  SYNTHETIC_FIXTURE_SERIES_A_UID,
  SYNTHETIC_FIXTURE_STUDY_UID,
} from "../src/services/nativeFrameFixture";

const FRAME_SIZE = 8192;
const CACHE_SCOPE = {
  principalId: "synthetic-principal-p3-residency",
  sessionId: "viewer-session-p3-residency",
};
const locator: NativeFrameLocator = {
  studyInstanceUID: SYNTHETIC_FIXTURE_STUDY_UID,
  seriesInstanceUID: SYNTHETIC_FIXTURE_SERIES_A_UID,
  sopInstanceUID: SYNTHETIC_FIXTURE_INSTANCE_A_UID,
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
    bytes[index] = (index * 17 + frameNumber * 31) & 0xff;
  }
  return bytes;
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class FakeP3Adapter {
  opened = true;
  move = true;
  openCalls = 0;
  closeCalls = 0;
  openGate: Promise<void> | null = null;
  putGate: Promise<void> | null = null;
  getGate: Promise<void> | null = null;
  invalidateGate: Promise<void> | null = null;
  putFailure: string | null = null;
  invalidateFailure: string | null = null;
  clearFailure: string | null = null;
  closeFailure: string | null = null;
  entries = new Map<string, FakeEntry>();
  events: Array<{
    sequence: number;
    type: "committed" | "deleted" | "invalidated" | "error" | "cleared";
    alias: string | null;
    nativeBytes: number;
    fileBytes: number;
  }> = [];
  sequence = 0;

  async open() {
    this.openCalls += 1;
    if (this.openGate) await this.openGate;
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
    if (this.getGate) await this.getGate;
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
    if (this.invalidateGate) await this.invalidateGate;
    const entry = this.entries.get(keyId(key));
    if (!entry) return { status: "miss" as const };
    if (this.invalidateFailure) {
      return {
        status: "failed" as const,
        reason: this.invalidateFailure as never,
        entryAlias: entry.alias,
        nativeBytes: entry.nativeBytes,
      };
    }
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
  async clearOwned() {
    const cleared = [...this.entries.values()];
    this.entries.clear();
    this.sequence += 1;
    if (this.clearFailure) {
      this.events.push({
        sequence: this.sequence,
        type: "error",
        alias: null,
        nativeBytes: 0,
        fileBytes: FRAME_SIZE,
      });
      return {
        status: "failed" as const,
        reason: this.clearFailure as never,
        clearedEntries: 0,
        clearedNativeBytes: 0,
        failedEntries: cleared.length,
        failedFileBytes: FRAME_SIZE,
      };
    }
    this.events.push({
      sequence: this.sequence,
      type: "cleared",
      alias: null,
      nativeBytes: 0,
      fileBytes: 0,
    });
    return {
      status: "cleared" as const,
      clearedEntries: cleared.length,
      clearedNativeBytes: cleared.reduce(
        (total, entry) => total + entry.nativeBytes,
        0,
      ),
      failedEntries: 0,
      failedFileBytes: 0,
    };
  }
  async close() {
    this.closeCalls += 1;
    if (this.closeFailure) {
      return { status: "failed" as const, reason: this.closeFailure as never };
    }
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

interface Harness {
  session: NativeFrameSession;
  adapter: FakeP3Adapter;
  networkCalls: number[];
  assertFresh: (label?: string) => void;
}

async function makeHarness(
  adapter = new FakeP3Adapter(),
  config: NativeFrameDualWindowConfig = {
    ram: { behind: 1, ahead: 1 },
    opfs: { behind: 3, ahead: 3 },
  },
  options: Partial<NativeFrameSessionOptions> = {},
): Promise<Harness> {
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
    p3Digest: () => "synthetic-digest",
    now: () => 0,
    ...options,
  });
  await session.open();
  const snapshots: NativeFrameSessionMetrics[] = [];
  session.subscribeResidency(({ snapshot }) => snapshots.push(snapshot));
  return {
    session,
    adapter,
    networkCalls,
    assertFresh: (label = "snapshot") => {
      assert.ok(snapshots.length > 0, `${label}: no snapshot`);
      assert.deepEqual(
        snapshots[snapshots.length - 1],
        session.metrics(),
        `${label}: last emitted snapshot is stale`,
      );
    },
  };
}

async function enterP3(harness: Harness): Promise<void> {
  const entered = await harness.session.setModeAsync("p3");
  assert.equal(entered.status, "enabled");
}

function presented(result: Awaited<ReturnType<NativeFrameSession["selectFrame"]>>) {
  assert.equal(result.status, "presented");
  if (result.status !== "presented") throw new Error("not presented");
  return result;
}

async function waitFor(
  predicate: () => boolean,
  message = "condition not reached",
): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 2000) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

function capture(
  session: NativeFrameSession,
  previous: NativeFrameResidencyState | null,
  cursor: { value: number },
): NativeFrameResidencyState {
  const snapshot = session.metrics();
  const batch = session.residencyEventsSince(cursor.value);
  cursor.value = batch.latestSequence;
  return reduceNativeFrameResidency(previous, snapshot, batch);
}

function tile(
  view: NativeFrameResidencyView,
  frameNumber: number,
) {
  const found = view.tiles.find((item) => item.frameNumber === frameNumber);
  assert.ok(found, `frame ${frameNumber} tile`);
  return found;
}

test("P3 trace 1,2,3: frame 1 is purple and frames 2-3 are BOTH", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  const cursor = { value: 0 };
  let state = capture(harness.session, null, cursor);
  for (const frame of [1, 2, 3]) {
    presented(await harness.session.selectFrame(frame));
    state = capture(harness.session, state, cursor);
  }
  await waitFor(() => harness.session.metrics().opfs?.entries === 3);
  state = capture(harness.session, state, cursor);

  const view = buildNativeFrameResidencyView(state, 8);
  assert.equal(view.opfsStatus, "enabled");
  assert.equal(view.opfsAvailable, true);
  assert.equal(tile(view, 1).residency, "opfs");
  assert.equal(tile(view, 1).nativeRam, false);
  assert.equal(tile(view, 2).residency, "both");
  assert.equal(tile(view, 3).residency, "both");
  assert.deepEqual(view.opfsFrames, [1, 2, 3]);
  const serialized = JSON.stringify(harness.session.metrics().opfs);
  assert.equal(serialized.includes("alias-"), false);
  assert.equal(serialized.includes(SYNTHETIC_FIXTURE_STUDY_UID), false);
  harness.assertFresh("end");
  harness.session.close();
});

test("P3 revisit 1 promotes to RAM and Clear RAM leaves purple only", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  const cursor = { value: 0 };
  let state = capture(harness.session, null, cursor);
  for (const frame of [1, 2, 3]) {
    presented(await harness.session.selectFrame(frame));
    state = capture(harness.session, state, cursor);
  }
  await waitFor(() => harness.session.metrics().opfs?.entries === 3);

  const revisit = presented(await harness.session.selectFrame(1));
  assert.equal(revisit.opfsCache, "hit");
  assert.equal(revisit.promotedToRam, true);
  state = capture(harness.session, state, cursor);
  let view = buildNativeFrameResidencyView(state, 8);
  assert.equal(tile(view, 1).residency, "both");
  assert.equal(tile(view, 2).residency, "both");
  assert.equal(tile(view, 3).residency, "opfs");

  harness.session.clearRam();
  state = capture(harness.session, state, cursor);
  view = buildNativeFrameResidencyView(state, 8);
  for (const frame of [1, 2, 3]) {
    assert.equal(tile(view, frame).residency, "opfs");
  }
  harness.assertFresh("end");
  harness.session.close();
});

test("P3 Clear RAM keeps the OPFS map and revisiting 2 is an OPFS hit with promotion", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  for (const frame of [1, 2, 3]) {
    presented(await harness.session.selectFrame(frame));
  }
  await waitFor(() => harness.session.metrics().opfs?.entries === 3);

  harness.session.clearRam();
  const cleared = harness.session.metrics();
  assert.deepEqual(cleared.opfs?.frames, [1, 2, 3]);
  assert.equal(cleared.opfs?.entries, 3);
  assert.deepEqual(cleared.cache?.frames ?? [], []);

  const revisit = presented(await harness.session.selectFrame(2));
  assert.equal(revisit.source, "ram");
  assert.equal(revisit.opfsSource, "opfs");
  assert.equal(revisit.opfsCache, "hit");
  assert.equal(revisit.promotedToRam, true);
  assert.equal(harness.networkCalls.length, 3);
  assert.deepEqual(harness.session.metrics().opfs?.frames, [1, 2, 3]);
  assert.ok(harness.session.metrics().cache?.frames.includes(2));
  harness.assertFresh("end");
  harness.session.close();
});

test("P3 Clear OPFS keeps RAM blue and removes only committed OPFS", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  const cursor = { value: 0 };
  let state = capture(harness.session, null, cursor);
  for (const frame of [1, 2, 3]) {
    presented(await harness.session.selectFrame(frame));
    state = capture(harness.session, state, cursor);
  }
  await waitFor(() => harness.session.metrics().opfs?.entries === 3);
  presented(await harness.session.selectFrame(1));
  state = capture(harness.session, state, cursor);

  const cleared = await harness.session.clearP3();
  assert.equal(cleared.status, "cleared");
  state = capture(harness.session, state, cursor);
  const view = buildNativeFrameResidencyView(state, 8);
  assert.equal(tile(view, 1).residency, "ram");
  assert.equal(tile(view, 2).residency, "ram");
  assert.equal(tile(view, 3).residency, "absent");
  assert.deepEqual(view.opfsFrames, []);
  harness.assertFresh("end");
  harness.session.close();
});

test("P3 Clear Both is partial when OPFS cleanup fails after RAM clear", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  presented(await harness.session.selectFrame(1));
  await waitFor(() => harness.session.metrics().opfs?.entries === 1);
  harness.adapter.clearFailure = "delete-failed";

  const result = await harness.session.clearBoth();
  assert.equal(result.status, "partial");
  assert.equal(result.ramCleared, true);
  assert.equal(result.opfs?.status, "failed");
  assert.match(result.reason ?? "", /delete-failed/);
  const view = buildNativeFrameResidencyView(
    capture(harness.session, null, { value: 0 }),
    8,
  );
  assert.equal(view.opfsAvailable, true);
  assert.deepEqual(view.opfsFrames, []);
  assert.ok((harness.session.metrics().opfs?.errors["delete-failed"] ?? 0) >= 1);
  harness.assertFresh("end");
  harness.session.close();
});

test("P3 moving beyond the disk window shows X then grey after confirmed removal", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  const cursor = { value: 0 };
  let state = capture(harness.session, null, cursor);
  for (const frame of [1, 2, 3]) {
    presented(await harness.session.selectFrame(frame));
    state = capture(harness.session, state, cursor);
  }
  await waitFor(() => harness.session.metrics().opfs?.entries === 3);

  const gate = deferred();
  harness.adapter.invalidateGate = gate.promise;
  const moving = harness.session.selectFrame(8);
  await waitFor(
    () => (harness.session.metrics().opfs?.pendingDeletes ?? 0) > 0,
    "pending delete not observed",
  );
  state = capture(harness.session, state, cursor);
  const during = buildNativeFrameResidencyView(state, 8);
  const deleting = during.tiles.find((item) => item.opfsPendingDelete);
  assert.ok(deleting);
  assert.notEqual(deleting.residency, "absent");
  assert.ok(deleting.labels.includes("X"));

  gate.resolve();
  presented(await moving);
  await waitFor(
    () => (harness.session.metrics().opfs?.pendingDeletes ?? 0) === 0,
    "pending delete not cleared",
  );
  state = capture(harness.session, state, cursor);
  const after = buildNativeFrameResidencyView(state, 8);
  for (const frame of [1, 2, 3]) {
    assert.equal(tile(after, frame).residency, "absent");
  }
  harness.assertFresh("end");
  harness.session.close();
});

test("P3 quota failure never paints purple and marks the frame", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  harness.adapter.putFailure = "quota-exceeded";
  presented(await harness.session.selectFrame(1));
  await waitFor(
    () => (harness.session.metrics().opfs?.errors["quota-exceeded"] ?? 0) > 0,
    "quota error not recorded",
  );
  const view = buildNativeFrameResidencyView(
    capture(harness.session, null, { value: 0 }),
    8,
  );
  assert.equal(tile(view, 1).residency, "ram");
  assert.equal(tile(view, 1).opfsError, true);
  assert.deepEqual(view.opfsFrames, []);
  for (const item of view.tiles) {
    assert.notEqual(item.residency, "opfs");
    assert.notEqual(item.residency, "both");
  }
  harness.assertFresh("end");
  harness.session.close();
});

test("P3 degraded marks the disk tier unavailable and never purple", async () => {
  const adapter = new FakeP3Adapter();
  adapter.opened = false;
  adapter.move = false;
  const harness = await makeHarness(adapter);
  const entered = await harness.session.setModeAsync("p3");
  assert.equal(entered.status, "degraded");
  presented(await harness.session.selectFrame(1));
  const view = buildNativeFrameResidencyView(
    capture(harness.session, null, { value: 0 }),
    8,
  );
  assert.equal(view.opfsStatus, "degraded");
  assert.equal(view.opfsAvailable, false);
  assert.equal(view.opfsUnknown, true);
  for (const item of view.tiles) {
    assert.notEqual(item.residency, "opfs");
    assert.notEqual(item.residency, "both");
  }
  const opfsLegend = view.legend.find((item) => item.key === "opfs");
  assert.equal(opfsLegend?.disabled, true);
  assert.match(opfsLegend?.label ?? "", /unavailable\/unknown/);
  harness.assertFresh("end");
  harness.session.close();
});

test("pending publication never paints purple; pending replacement keeps committed colour", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  presented(await harness.session.selectFrame(1));
  const metrics = harness.session.metrics();
  const opfsBase = metrics.opfs;
  assert.ok(opfsBase);
  const base: NativeFrameSessionMetrics = metrics;

  const pendingOnly: NativeFrameSessionMetrics = {
    ...base,
    cache: base.cache ? { ...base.cache, frames: [] } : null,
    opfs: {
      ...opfsBase,
      frames: [],
      pendingWriteFrames: [2],
    },
  };
  let state = reduceNativeFrameResidency(null, pendingOnly, null);
  let view = buildNativeFrameResidencyView(state, 8);
  assert.equal(tile(view, 2).residency, "absent");
  assert.equal(tile(view, 2).opfsPendingWrite, true);
  assert.ok(tile(view, 2).labels.includes("S"));

  const replacement: NativeFrameSessionMetrics = {
    ...base,
    cache: base.cache ? { ...base.cache, frames: [] } : null,
    opfs: {
      ...opfsBase,
      frames: [2],
      pendingWriteFrames: [2],
    },
  };
  state = reduceNativeFrameResidency(null, replacement, null);
  view = buildNativeFrameResidencyView(state, 8);
  assert.equal(tile(view, 2).residency, "opfs");
  assert.equal(tile(view, 2).opfsPendingWrite, true);
  harness.assertFresh("end");
  harness.session.close();
});

test("clear during an in-flight publication does not repopulate OPFS", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  const gate = deferred();
  harness.adapter.putGate = gate.promise;
  const selection = harness.session.selectFrame(4);
  await waitFor(
    () => (harness.session.metrics().opfs?.pendingWrites ?? 0) > 0,
    "publication not pending",
  );
  const clearing = harness.session.clearP3();
  gate.resolve();
  presented(await selection);
  const result = await clearing;
  assert.equal(result.status, "cleared");
  await waitFor(() => harness.session.metrics().opfs?.entries === 0);
  const view = buildNativeFrameResidencyView(
    capture(harness.session, null, { value: 0 }),
    8,
  );
  assert.deepEqual(view.opfsFrames, []);
  for (const item of view.tiles) {
    assert.notEqual(item.residency, "opfs");
    assert.notEqual(item.residency, "both");
  }
  harness.assertFresh("end");
  harness.session.close();
});

test("stale P2 or old-namespace snapshots cannot paint OPFS residency", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  presented(await harness.session.selectFrame(1));
  await waitFor(() => harness.session.metrics().opfs?.entries === 1);
  const p3Snapshot = harness.session.metrics();
  const staleP2: NativeFrameSessionMetrics = { ...p3Snapshot, mode: "p2" };
  let view = buildNativeFrameResidencyView(
    reduceNativeFrameResidency(null, staleP2, null),
    8,
  );
  assert.equal(view.opfsStatus, "disabled");
  assert.equal(view.opfsAvailable, false);
  for (const item of view.tiles) {
    assert.notEqual(item.residency, "opfs");
    assert.notEqual(item.residency, "both");
  }

  const oldNamespace: NativeFrameSessionMetrics = {
    ...p3Snapshot,
    opfs: null,
  };
  view = buildNativeFrameResidencyView(
    reduceNativeFrameResidency(null, oldNamespace, null),
    8,
  );
  assert.equal(view.opfsStatus, "disabled");
  assert.deepEqual(view.opfsFrames, []);
  harness.assertFresh("end");
  harness.session.close();
});

test("failed delete keeps physical presence, shows error and marks ineligible", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  for (const frame of [1, 2, 3]) {
    presented(await harness.session.selectFrame(frame));
  }
  await waitFor(() => harness.session.metrics().opfs?.entries === 3);
  harness.adapter.invalidateFailure = "delete-failed";

  presented(await harness.session.selectFrame(8));
  await waitFor(
    () => (harness.session.metrics().opfs?.pendingDeletes ?? 0) === 0,
    "failed deletes not settled",
  );
  const metrics = harness.session.metrics();
  assert.deepEqual(metrics.opfs?.frames, [1, 2, 3]);
  assert.deepEqual(metrics.opfs?.ineligibleFrames, [1, 2, 3]);
  const view = buildNativeFrameResidencyView(
    capture(harness.session, null, { value: 0 }),
    8,
  );
  for (const frame of [1, 2, 3]) {
    const item = tile(view, frame);
    assert.equal(item.residency, "opfs");
    assert.equal(item.opfsError, true);
    assert.equal(item.opfsIneligible, true);
    assert.ok(item.labels.includes("Ineligible"));
  }
  harness.assertFresh("end");
  harness.session.close();
});

test("Clear OPFS failure stays visible and never claims deletion", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  presented(await harness.session.selectFrame(1));
  await waitFor(() => harness.session.metrics().opfs?.entries === 1);
  harness.adapter.clearFailure = "delete-failed";

  const result = await harness.session.clearP3();
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "delete-failed");
  assert.equal(result.failedEntries, 1);
  assert.equal(harness.session.metrics().opfs?.storageError, "delete-failed");
  const view = buildNativeFrameResidencyView(
    capture(harness.session, null, { value: 0 }),
    8,
  );
  assert.equal(view.opfsAvailable, true);
  assert.deepEqual(view.opfsFrames, []);
  harness.assertFresh("end");
  harness.session.close();
});

test("session exposes OPFS-reading and network-pending frames independently", async () => {
  const gate = deferred();
  const networkCalls: number[] = [];
  let frameGate: Promise<void> | null = null;
  const harness = await makeHarness(new FakeP3Adapter(), undefined, {
    loadFrame: async (request: NativeFrameRequest) => {
      networkCalls.push(request.frameNumber);
      if (frameGate) await frameGate;
      return {
        representation: "native-frame-v1",
        frameNumber: request.frameNumber,
        transferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
        bytes: bytesFor(request.frameNumber),
      };
    },
  });
  await enterP3(harness);
  presented(await harness.session.selectFrame(1));
  await waitFor(() => harness.session.metrics().opfs?.entries === 1);
  harness.session.clearRam();

  harness.adapter.getGate = gate.promise;
  const reading = harness.session.selectFrame(1);
  await waitFor(
    () => harness.session.metrics().opfs?.readingFrame === 1,
    "OPFS read not reported",
  );
  assert.equal(harness.session.metrics().opfs?.networkPendingFrame, null);
  gate.resolve();
  presented(await reading);
  assert.equal(harness.session.metrics().opfs?.readingFrame, null);

  const networkGate = deferred();
  frameGate = networkGate.promise;
  const pending = harness.session.selectFrame(2);
  await waitFor(
    () => harness.session.metrics().opfs?.networkPendingFrame === 2,
    "network pending not reported",
  );
  assert.equal(harness.session.metrics().opfs?.readingFrame, null);
  networkGate.resolve();
  presented(await pending);
  assert.equal(harness.session.metrics().opfs?.networkPendingFrame, null);
  assert.deepEqual(networkCalls, [1, 2]);
  harness.assertFresh("end");
  harness.session.close();
});

test("last emitted snapshot clears pending writes after publication quiesces", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  harness.assertFresh("entry");
  presented(await harness.session.selectFrame(1));
  await waitFor(() => {
    const opfs = harness.session.metrics().opfs;
    return (opfs?.entries ?? 0) === 1 && (opfs?.pendingWrites ?? 0) === 0;
  });
  harness.assertFresh("publication quiesced");
  const opfs = harness.session.metrics().opfs;
  assert.deepEqual(opfs?.pendingWriteFrames, []);
  assert.equal(opfs?.pendingWrites, 0);
  harness.assertFresh("end");
  harness.session.close();
});

test("snapshot stays fresh through reading and pending delete frames", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  for (const frame of [1, 2, 3]) {
    presented(await harness.session.selectFrame(frame));
  }
  await waitFor(() => harness.session.metrics().opfs?.entries === 3);

  const gate = deferred();
  harness.adapter.invalidateGate = gate.promise;
  const moving = harness.session.selectFrame(8);
  await waitFor(
    () => (harness.session.metrics().opfs?.pendingDeletes ?? 0) > 0,
  );
  harness.assertFresh("pending delete");
  assert.ok(
    (harness.session.metrics().opfs?.pendingDeleteFrames ?? []).length > 0,
  );
  gate.resolve();
  presented(await moving);
  await waitFor(
    () => (harness.session.metrics().opfs?.pendingDeletes ?? 0) === 0,
  );
  harness.assertFresh("delete settled");

  harness.session.clearRam();
  const getGate = deferred();
  harness.adapter.getGate = getGate.promise;
  const reading = harness.session.selectFrame(1);
  await waitFor(
    () => harness.session.metrics().opfs?.readingFrame === 1,
  );
  harness.assertFresh("reading frame");
  getGate.resolve();
  presented(await reading);
  assert.equal(harness.session.metrics().opfs?.readingFrame, null);
  harness.assertFresh("reading cleared");
  harness.assertFresh("end");
  harness.session.close();
});

test("snapshot stays fresh through network pending, dropped and failed publication, clear and close", async () => {
  let networkGate: Promise<void> | null = null;
  const harness = await makeHarness(new FakeP3Adapter(), undefined, {
    loadFrame: async (request: NativeFrameRequest) => {
      if (networkGate) await networkGate;
      return {
        representation: "native-frame-v1",
        frameNumber: request.frameNumber,
        transferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
        bytes: bytesFor(request.frameNumber),
      };
    },
  });
  await enterP3(harness);

  const netGate = deferred();
  networkGate = netGate.promise;
  const pending = harness.session.selectFrame(2);
  await waitFor(
    () => harness.session.metrics().opfs?.networkPendingFrame === 2,
  );
  harness.assertFresh("network pending");
  netGate.resolve();
  networkGate = null;
  presented(await pending);
  assert.equal(harness.session.metrics().opfs?.networkPendingFrame, null);
  harness.assertFresh("network cleared");

  const putGate = deferred();
  harness.adapter.putGate = putGate.promise;
  presented(await harness.session.selectFrame(3));
  presented(await harness.session.selectFrame(4));
  await waitFor(
    () => (harness.session.metrics().opfs?.errors["publication-busy"] ?? 0) > 0,
  );
  harness.assertFresh("publication-busy dropped");
  putGate.resolve();
  await waitFor(
    () => (harness.session.metrics().opfs?.pendingWrites ?? 0) === 0,
  );
  harness.assertFresh("publication settled");

  harness.adapter.putFailure = "quota-exceeded";
  presented(await harness.session.selectFrame(5));
  await waitFor(
    () => (harness.session.metrics().opfs?.errors["quota-exceeded"] ?? 0) > 0,
  );
  await waitFor(
    () => (harness.session.metrics().opfs?.pendingWrites ?? 0) === 0,
  );
  harness.assertFresh("failed publication");

  const cleared = await harness.session.clearP3();
  assert.equal(cleared.status, "cleared");
  harness.assertFresh("clear OPFS");
  assert.deepEqual(harness.session.metrics().opfs?.pendingWriteFrames, []);
  assert.deepEqual(harness.session.metrics().opfs?.pendingDeleteFrames, []);

  harness.adapter.closeFailure = "delete-failed";
  const failed = await harness.session.setModeAsync("p2");
  assert.equal(failed.status, "failed");
  assert.equal(harness.session.metrics().opfs?.status, "cleanup-required");
  harness.assertFresh("cleanup-required");
  harness.adapter.closeFailure = null;
  const retried = await harness.session.retryCloseP3();
  assert.equal(retried.status, "closed");
  harness.assertFresh("close retry");
  harness.assertFresh("end");
  harness.session.close();
});

test("P3 strip is bounded and building it never fetches", async () => {
  const harness = await makeHarness();
  await enterP3(harness);
  presented(await harness.session.selectFrame(1));
  const before = harness.networkCalls.length;
  const state = reduceNativeFrameResidency(null, harness.session.metrics(), null);
  const view = buildNativeFrameResidencyView(state, 100, 50);
  assert.equal(view.tiles.length, 24);
  assert.equal(view.limit, 24);
  assert.equal(harness.networkCalls.length, before);
  harness.assertFresh("end");
  harness.session.close();
});
