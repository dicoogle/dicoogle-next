import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_NATIVE_FRAME_DUAL_WINDOW_LIMITS,
  planNativeFrameDualWindowPolicy,
  type NativeFrameDualWindowDescriptor,
  type NativeFrameDualWindowIncoming,
  type NativeFrameDualWindowOkPlan,
  type NativeFrameDualWindowPendingDelete,
  type NativeFrameDualWindowPendingWrite,
  type NativeFrameDualWindowPolicyInput,
} from "../src/services/nativeFrameDualWindowPolicy";
import {
  createNativeFrameCacheKey,
  type NativeFrameCacheKey,
} from "../src/services/nativeRamCache";
import { NATIVE_FRAME_TRANSFER_SYNTAX_UID } from "../src/services/nativeFrameContract";
import {
  SYNTHETIC_FIXTURE_INSTANCE_A_UID,
  SYNTHETIC_FIXTURE_SERIES_A_UID,
  SYNTHETIC_FIXTURE_SOURCE_VERSION,
  SYNTHETIC_FIXTURE_STUDY_UID,
} from "../src/services/nativeFrameFixture";

const FRAME_SIZE = 8192;
const OPFS_FILE_BYTES = FRAME_SIZE + 80;

function makeKey(frameNumber: number): NativeFrameCacheKey {
  return createNativeFrameCacheKey({
    principalId: "synthetic-principal",
    sessionId: "synthetic-session",
    studyInstanceUID: SYNTHETIC_FIXTURE_STUDY_UID,
    seriesInstanceUID: SYNTHETIC_FIXTURE_SERIES_A_UID,
    sopInstanceUID: SYNTHETIC_FIXTURE_INSTANCE_A_UID,
    frameNumber,
    representation: "native-frame-v1",
    transferSyntaxUID: NATIVE_FRAME_TRANSFER_SYNTAX_UID,
    sourceVersion: SYNTHETIC_FIXTURE_SOURCE_VERSION,
  });
}

function descriptor(
  frameNumber: number,
  tier: "ram" | "opfs",
  overrides: Partial<NativeFrameDualWindowDescriptor> = {},
): NativeFrameDualWindowDescriptor {
  return {
    key: makeKey(frameNumber),
    tier,
    entryRef: `${tier}-${frameNumber}`,
    nativeBytes: FRAME_SIZE,
    fileBytes: tier === "ram" ? FRAME_SIZE : OPFS_FILE_BYTES,
    lastAccessOrdinal: frameNumber,
    ...overrides,
  };
}

function pendingWrite(
  frameNumber: number,
  overrides: Partial<NativeFrameDualWindowPendingWrite> = {},
): NativeFrameDualWindowPendingWrite {
  return {
    key: makeKey(frameNumber),
    tier: "opfs",
    entryRef: `write-${frameNumber}`,
    nativeBytes: FRAME_SIZE,
    fileBytes: OPFS_FILE_BYTES,
    temporaryFileBytes: OPFS_FILE_BYTES,
    state: "writing",
    ...overrides,
  };
}

function pendingDelete(
  frameNumber: number,
  tier: "ram" | "opfs",
  overrides: Partial<NativeFrameDualWindowPendingDelete> = {},
): NativeFrameDualWindowPendingDelete {
  return {
    key: makeKey(frameNumber),
    tier,
    entryRef: `delete-${tier}-${frameNumber}`,
    nativeBytes: FRAME_SIZE,
    fileBytes: tier === "ram" ? FRAME_SIZE : OPFS_FILE_BYTES,
    state: "deleting",
    ...overrides,
  };
}

function incoming(
  frameNumber: number,
  tier: "ram" | "opfs",
  overrides: Partial<NativeFrameDualWindowIncoming> = {},
): NativeFrameDualWindowIncoming {
  return {
    key: makeKey(frameNumber),
    tier,
    nativeBytes: FRAME_SIZE,
    fileBytes: tier === "ram" ? FRAME_SIZE : OPFS_FILE_BYTES,
    temporaryFileBytes: tier === "ram" ? 0 : OPFS_FILE_BYTES,
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<NativeFrameDualWindowPolicyInput> = {},
): NativeFrameDualWindowPolicyInput {
  return {
    selectedKey: makeKey(1),
    numberOfFrames: 8,
    ramEpoch: 1,
    opfsEpoch: 1,
    ramRevision: 1,
    opfsRevision: 1,
    opfsExternalFileBytes: 0,
    descriptors: [],
    pendingWrites: [],
    pendingDeletes: [],
    incoming: [],
    ...overrides,
  };
}

function okPlan(input: NativeFrameDualWindowPolicyInput): NativeFrameDualWindowOkPlan {
  const plan = planNativeFrameDualWindowPolicy(input);
  assert.equal(plan.status, "ok");
  if (plan.status !== "ok") {
    throw new Error(`unexpected plan status: ${plan.status}`);
  }
  return plan;
}

function frames(
  values: readonly { readonly key: NativeFrameCacheKey }[],
): number[] {
  return values.map((value) => value.key.frameNumber);
}

function sorted(values: readonly number[]): number[] {
  return values.slice().sort((left, right) => left - right);
}

test("trace 1,2,3 evicts frame 1 from RAM but keeps it in OPFS", () => {
  const plan = okPlan(
    makeInput({
      selectedKey: makeKey(3),
      descriptors: [
        descriptor(1, "ram"),
        descriptor(2, "ram"),
        descriptor(3, "ram"),
        descriptor(1, "opfs"),
        descriptor(2, "opfs"),
        descriptor(3, "opfs"),
      ],
    }),
  );
  assert.deepEqual(frames(plan.ramEvictions), [1]);
  assert.deepEqual(plan.opfsPlannedDeletions, []);
  assert.deepEqual(sorted(plan.opfsResidentFrames), [1, 2, 3]);
  assert.deepEqual(plan.opfsIneligibleFrames, []);
  assert.equal(plan.currentRamRetained, true);
  assert.equal(plan.currentOpfsRetained, true);
});

test("returning to frame 1 is eligible for OPFS reuse after RAM eviction", () => {
  const plan = okPlan(
    makeInput({
      selectedKey: makeKey(1),
      descriptors: [
        descriptor(2, "ram"),
        descriptor(3, "ram"),
        descriptor(1, "opfs"),
        descriptor(2, "opfs"),
        descriptor(3, "opfs"),
      ],
    }),
  );
  assert.ok(plan.opfsResidentFrames.includes(1));
  assert.equal(plan.opfsIneligibleFrames.includes(1), false);
  assert.ok(plan.ramMissingFrames.includes(1));
  assert.equal(plan.currentOpfsRetained, true);
});

test("advancing to frame 8 plans OPFS deletion for frames 1–4", () => {
  const plan = okPlan(
    makeInput({
      selectedKey: makeKey(8),
      descriptors: [
        descriptor(1, "ram"),
        descriptor(2, "ram"),
        descriptor(3, "ram"),
        descriptor(4, "ram"),
        descriptor(5, "ram"),
        descriptor(6, "ram"),
        descriptor(7, "ram"),
        descriptor(8, "ram"),
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((frame) =>
          descriptor(frame, "opfs"),
        ),
      ],
    }),
  );
  assert.deepEqual(frames(plan.opfsPlannedDeletions), [1, 2, 3, 4]);
  assert.deepEqual(plan.opfsIneligibleFrames, [1, 2, 3, 4]);
  assert.equal(plan.opfsPublications.length, 0);
  assert.deepEqual(plan.opfsMissingFrames, []);
  assert.equal(plan.currentOpfsRetained, true);
});

test("replans correctly after a planned OPFS deletion is confirmed", () => {
  const before = okPlan(
    makeInput({
      selectedKey: makeKey(8),
      descriptors: [1, 2, 3, 4, 5, 6, 7, 8].map((frame) =>
        descriptor(frame, "opfs"),
      ),
    }),
  );
  assert.deepEqual(frames(before.opfsPlannedDeletions), [1, 2, 3, 4]);

  const after = okPlan(
    makeInput({
      selectedKey: makeKey(8),
      descriptors: [5, 6, 7, 8].map((frame) => descriptor(frame, "opfs")),
    }),
  );
  assert.deepEqual(after.opfsPlannedDeletions, []);
  assert.deepEqual(after.opfsIneligibleFrames, []);
  assert.deepEqual(sorted(after.opfsResidentFrames), [5, 6, 7, 8]);
  assert.deepEqual(after.opfsMissingFrames, []);
  assert.equal(after.currentOpfsRetained, true);
});

test("clamps windows at both ends and handles reverse/jump selection", () => {
  const start = okPlan(
    makeInput({
      selectedKey: makeKey(1),
      descriptors: [descriptor(1, "ram"), descriptor(2, "ram")],
    }),
  );
  assert.deepEqual(start.desiredRamFrames, [1, 2]);
  assert.deepEqual(start.desiredOpfsFrames, [1, 2, 3, 4]);

  const end = okPlan(
    makeInput({
      selectedKey: makeKey(8),
      descriptors: [descriptor(7, "ram"), descriptor(8, "ram")],
    }),
  );
  assert.deepEqual(end.desiredRamFrames, [7, 8]);
  assert.deepEqual(end.desiredOpfsFrames, [5, 6, 7, 8]);

  const reverse = okPlan(
    makeInput({
      selectedKey: makeKey(2),
      descriptors: [descriptor(1, "ram"), descriptor(2, "ram")],
    }),
  );
  assert.deepEqual(reverse.desiredRamFrames, [1, 2, 3]);

  const jump = okPlan(
    makeInput({
      selectedKey: makeKey(6),
      descriptors: [descriptor(5, "ram"), descriptor(6, "ram")],
    }),
  );
  assert.deepEqual(jump.desiredRamFrames, [5, 6, 7]);
  assert.deepEqual(jump.desiredOpfsFrames, [3, 4, 5, 6, 7, 8]);
});

test("outside-RAM removal does not delete a still-valid OPFS entry", () => {
  const plan = okPlan(
    makeInput({
      selectedKey: makeKey(3),
      descriptors: [
        descriptor(1, "ram"),
        descriptor(2, "ram"),
        descriptor(3, "ram"),
        descriptor(1, "opfs"),
      ],
    }),
  );
  assert.deepEqual(frames(plan.ramEvictions), [1]);
  assert.equal(
    plan.opfsPlannedDeletions.some(
      (deletion) => deletion.key.frameNumber === 1,
    ),
    false,
  );
});

test("outside-OPFS deletion does not evict valid RAM", () => {
  const plan = okPlan(
    makeInput({
      selectedKey: makeKey(8),
      descriptors: [
        descriptor(7, "ram"),
        descriptor(8, "ram"),
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((frame) =>
          descriptor(frame, "opfs"),
        ),
      ],
    }),
  );
  assert.deepEqual(frames(plan.ramEvictions), []);
  assert.deepEqual(frames(plan.opfsPlannedDeletions), [1, 2, 3, 4]);
  assert.deepEqual(sorted(plan.ramResidentFrames), [7, 8]);
});

test("pressure evicts outside-window first, then farthest, then older access", () => {
  const plan = okPlan(
    makeInput({
      selectedKey: makeKey(7),
      limits: {
        ...DEFAULT_NATIVE_FRAME_DUAL_WINDOW_LIMITS,
        opfs: {
          maxNativeBytes: 64 * 1024,
          maxEntryNativeBytes: 8 * 1024,
          maxEntries: 3,
        },
      },
      descriptors: [
        descriptor(4, "opfs", { lastAccessOrdinal: 1 }),
        descriptor(5, "opfs", { lastAccessOrdinal: 2 }),
        descriptor(6, "opfs", { lastAccessOrdinal: 3 }),
        descriptor(7, "opfs", { lastAccessOrdinal: 4 }),
        descriptor(8, "opfs", { lastAccessOrdinal: 1 }),
      ],
    }),
  );
  assert.deepEqual(frames(plan.opfsPlannedDeletions), [4, 5]);
  assert.equal(plan.currentOpfsRetained, true);
});

test("stable entryRef tie-break is deterministic under pressure", () => {
  const plan = okPlan(
    makeInput({
      selectedKey: makeKey(6),
      limits: {
        ...DEFAULT_NATIVE_FRAME_DUAL_WINDOW_LIMITS,
        opfs: {
          maxNativeBytes: 64 * 1024,
          maxEntryNativeBytes: 8 * 1024,
          maxEntries: 2,
        },
      },
      descriptors: [
        descriptor(5, "opfs", { entryRef: "a", lastAccessOrdinal: 1 }),
        descriptor(6, "opfs", { entryRef: "b", lastAccessOrdinal: 2 }),
        descriptor(7, "opfs", { entryRef: "c", lastAccessOrdinal: 1 }),
      ],
    }),
  );
  assert.deepEqual(frames(plan.opfsPlannedDeletions), [5]);
});

test("replacement does not double-charge native bytes but counts its file peak", () => {
  const plan = okPlan(
    makeInput({
      selectedKey: makeKey(5),
      descriptors: [descriptor(5, "opfs")],
      incoming: [incoming(5, "opfs")],
    }),
  );
  assert.equal(plan.opfsPublications.length, 1);
  assert.equal(plan.opfsPublications[0]?.replacement, true);
  assert.equal(plan.projectedOpfsNativeBytes, FRAME_SIZE);
  assert.equal(plan.projectedOpfsCommittedFileBytes, OPFS_FILE_BYTES);
  assert.equal(
    plan.projectedOpfsRootFileBytes,
    OPFS_FILE_BYTES + OPFS_FILE_BYTES + OPFS_FILE_BYTES,
  );
});

test("rejects a replacement when the old and new file peak exceeds the root cap", () => {
  const plan = okPlan(
    makeInput({
      selectedKey: makeKey(5),
      limits: {
        ...DEFAULT_NATIVE_FRAME_DUAL_WINDOW_LIMITS,
        maxOpfsRootFileBytes: 20 * 1024,
      },
      descriptors: [descriptor(5, "opfs")],
      incoming: [incoming(5, "opfs")],
    }),
  );
  assert.equal(plan.opfsPublications.length, 0);
  assert.equal(plan.incomingRejected[0]?.reason, "root-cap");
  assert.equal(plan.opfsResidentFrames.includes(5), true);
});

test("pending writes are reserved but never reported as resident", () => {
  const plan = okPlan(
    makeInput({
      selectedKey: makeKey(5),
      pendingWrites: [pendingWrite(5)],
      incoming: [incoming(6, "opfs")],
    }),
  );
  assert.equal(plan.opfsResidentFrames.length, 0);
  assert.ok(plan.opfsPendingWriteNativeBytes > 0);
  assert.ok(plan.opfsPendingWriteFileBytes > 0);
  assert.equal(plan.opfsPublications.length, 1);
});

test("pending deletes count until confirmation and remain ineligible", () => {
  const plan = okPlan(
    makeInput({
      selectedKey: makeKey(3),
      pendingDeletes: [pendingDelete(1, "opfs")],
    }),
  );
  assert.deepEqual(plan.opfsIneligibleFrames, [1]);
  assert.ok(plan.opfsPendingDeleteNativeBytes > 0);
  assert.ok(plan.opfsPendingDeleteFileBytes > 0);
  assert.equal(plan.opfsResidentFrames.length, 0);
  assert.ok(plan.opfsMissingFrames.includes(1));
});

test("current-frame oversize is rejected without false publication", () => {
  const plan = okPlan(
    makeInput({
      selectedKey: makeKey(4),
      incoming: [
        incoming(4, "opfs", {
          nativeBytes: FRAME_SIZE * 2,
          fileBytes: FRAME_SIZE * 2 + 80,
        }),
      ],
    }),
  );
  assert.equal(plan.opfsPublications.length, 0);
  assert.equal(plan.incomingRejected[0]?.reason, "entry-oversize");
  assert.equal(plan.currentOpfsRetained, false);
});

test("missing desired neighbours remain absent and do not create publications", () => {
  const plan = okPlan(
    makeInput({
      selectedKey: makeKey(4),
      descriptors: [],
    }),
  );
  assert.deepEqual(plan.ramMissingFrames, [3, 4, 5]);
  assert.deepEqual(plan.opfsMissingFrames, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(plan.ramAdmissions.length, 0);
  assert.equal(plan.opfsPublications.length, 0);
});

test("rejects wrong context, duplicates, out-of-range frames, and stale revisions", () => {
  const wrongContext = planNativeFrameDualWindowPolicy(
    makeInput({
      selectedKey: makeKey(3),
      descriptors: [
        descriptor(2, "ram", {
          key: createNativeFrameCacheKey({
            ...makeKey(2),
            seriesInstanceUID: "1.2.3.4.5",
          }),
        }),
      ],
    }),
  );
  assert.equal(wrongContext.status, "invalid");
  assert.equal(wrongContext.reason, "wrong-context");

  const duplicate = planNativeFrameDualWindowPolicy(
    makeInput({
      selectedKey: makeKey(3),
      descriptors: [descriptor(2, "ram"), descriptor(2, "ram")],
    }),
  );
  assert.equal(duplicate.status, "invalid");
  assert.equal(duplicate.reason, "duplicate-descriptor");

  const outOfRange = planNativeFrameDualWindowPolicy(
    makeInput({ selectedKey: makeKey(9) }),
  );
  assert.equal(outOfRange.status, "invalid");
  assert.equal(outOfRange.reason, "invalid-selected-key");

  const stalePlan = planNativeFrameDualWindowPolicy(
    makeInput({ ramRevision: 2, expectedRamRevision: 1 }),
  );
  assert.equal(stalePlan.status, "stale");
  assert.equal(stalePlan.reason, "ram-revision-mismatch");
});

test("wrong representation/syntax and duplicate incoming are rejected before pressure", () => {
  const wrongRepresentation = planNativeFrameDualWindowPolicy(
    makeInput({
      selectedKey: makeKey(3),
      descriptors: [
        descriptor(2, "opfs", {
          key: {
            ...makeKey(2),
            representation: "wrapped-single-frame-v1",
          } as unknown as NativeFrameCacheKey,
        }),
      ],
    }),
  );
  assert.equal(wrongRepresentation.status, "invalid");

  const wrongSyntax = planNativeFrameDualWindowPolicy(
    makeInput({
      selectedKey: makeKey(3),
      descriptors: [
        descriptor(2, "opfs", {
          key: createNativeFrameCacheKey({
            ...makeKey(2),
            transferSyntaxUID: "1.2.840.10008.1.2",
          }),
        }),
      ],
    }),
  );
  assert.equal(wrongSyntax.status, "invalid");
  assert.equal(wrongSyntax.reason, "wrong-context");

  const duplicateIncoming = planNativeFrameDualWindowPolicy(
    makeInput({
      selectedKey: makeKey(3),
      incoming: [incoming(3, "ram"), incoming(3, "ram")],
    }),
  );
  assert.equal(duplicateIncoming.status, "invalid");
  assert.equal(duplicateIncoming.reason, "duplicate-incoming");
});

test("external root bytes and root-cap blocking are explicit", () => {
  const plan = okPlan(
    makeInput({
      selectedKey: makeKey(3),
      opfsExternalFileBytes: 128 * 1024 + 1,
      incoming: [incoming(3, "opfs")],
    }),
  );
  assert.equal(plan.incomingRejected[0]?.reason, "root-cap");
  assert.equal(plan.rootCapBlocked, true);
});

test("pure evaluation leaves input unchanged and is deterministic", () => {
  const input = makeInput({
    selectedKey: makeKey(4),
    descriptors: [descriptor(3, "ram"), descriptor(3, "opfs")],
    pendingWrites: [pendingWrite(4)],
  });
  const before = JSON.stringify(input);
  const first = planNativeFrameDualWindowPolicy(input);
  const second = planNativeFrameDualWindowPolicy(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(first, second);
});
