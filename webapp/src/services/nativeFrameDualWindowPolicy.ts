import {
  createNativeFrameCacheKey,
  type NativeFrameCacheKey,
} from "./nativeRamCache";
import {
  createNativeRamWindow,
  NativeRamWindowPolicyError,
  type NativeRamWindow,
  type NativeRamWindowPolicyConfig,
} from "./nativeRamWindowPolicy";

export interface NativeFrameDualWindowConfig {
  readonly ram: NativeRamWindowPolicyConfig;
  readonly opfs: NativeRamWindowPolicyConfig;
}

export interface NativeFrameDualWindowTierLimits {
  readonly maxNativeBytes: number;
  readonly maxEntryNativeBytes: number;
  readonly maxEntries: number;
}

export interface NativeFrameDualWindowLimits {
  readonly ram: NativeFrameDualWindowTierLimits;
  readonly opfs: NativeFrameDualWindowTierLimits;
  readonly maxOpfsRootFileBytes: number;
}

export interface NativeFrameDualWindowDescriptor {
  readonly key: NativeFrameCacheKey;
  readonly tier: "ram" | "opfs";
  readonly entryRef: string;
  readonly nativeBytes: number;
  readonly fileBytes: number;
  readonly lastAccessOrdinal: number;
}

export interface NativeFrameDualWindowPendingWrite {
  readonly key: NativeFrameCacheKey;
  readonly tier: "opfs";
  readonly entryRef?: string;
  readonly nativeBytes: number;
  readonly fileBytes: number;
  readonly temporaryFileBytes: number;
  readonly state: "queued" | "writing" | "publishing";
}

export interface NativeFrameDualWindowPendingDelete {
  readonly key: NativeFrameCacheKey;
  readonly tier: "ram" | "opfs";
  readonly entryRef: string;
  readonly nativeBytes: number;
  readonly fileBytes: number;
  readonly state: "planned" | "deleting";
}

export interface NativeFrameDualWindowIncoming {
  readonly key: NativeFrameCacheKey;
  readonly tier: "ram" | "opfs";
  readonly nativeBytes: number;
  readonly fileBytes: number;
  readonly temporaryFileBytes: number;
}

export interface NativeFrameDualWindowPolicyInput {
  readonly selectedKey: NativeFrameCacheKey;
  readonly numberOfFrames: number;
  readonly ramEpoch: number;
  readonly opfsEpoch: number;
  readonly ramRevision: number;
  readonly opfsRevision: number;
  readonly expectedRamRevision?: number;
  readonly expectedOpfsRevision?: number;
  readonly opfsExternalFileBytes: number;
  readonly descriptors: readonly NativeFrameDualWindowDescriptor[];
  readonly pendingWrites: readonly NativeFrameDualWindowPendingWrite[];
  readonly pendingDeletes: readonly NativeFrameDualWindowPendingDelete[];
  readonly incoming?: readonly NativeFrameDualWindowIncoming[];
  readonly config?: NativeFrameDualWindowConfig;
  readonly limits?: NativeFrameDualWindowLimits;
}

export interface NativeFrameDualWindowEviction {
  readonly key: NativeFrameCacheKey;
  readonly entryRef: string;
  readonly nativeBytes: number;
  readonly reason: "outside-window" | "pressure";
}

export interface NativeFrameDualWindowDeletion {
  readonly key: NativeFrameCacheKey;
  readonly entryRef: string;
  readonly nativeBytes: number;
  readonly fileBytes: number;
  readonly phase: "planned";
  readonly reason: "outside-window" | "pressure";
}

export interface NativeFrameDualWindowAdmission {
  readonly key: NativeFrameCacheKey;
  readonly nativeBytes: number;
  readonly replacement: boolean;
}

export interface NativeFrameDualWindowPublication {
  readonly key: NativeFrameCacheKey;
  readonly nativeBytes: number;
  readonly fileBytes: number;
  readonly temporaryFileBytes: number;
  readonly replacement: boolean;
}

export interface NativeFrameDualWindowIncomingRejection {
  readonly tier: "ram" | "opfs";
  readonly frameNumber: number;
  readonly reason: string;
}

export interface NativeFrameDualWindowOkPlan {
  readonly status: "ok";
  readonly selectedFrame: number;
  readonly inputRevision: string;
  readonly ramWindow: NativeRamWindow;
  readonly opfsWindow: NativeRamWindow;
  readonly desiredRamFrames: readonly number[];
  readonly desiredOpfsFrames: readonly number[];
  readonly ramResidentFrames: readonly number[];
  readonly opfsResidentFrames: readonly number[];
  readonly ramMissingFrames: readonly number[];
  readonly opfsMissingFrames: readonly number[];
  readonly ramEvictions: readonly NativeFrameDualWindowEviction[];
  readonly opfsPlannedDeletions: readonly NativeFrameDualWindowDeletion[];
  readonly opfsIneligibleFrames: readonly number[];
  readonly ramAdmissions: readonly NativeFrameDualWindowAdmission[];
  readonly opfsPublications: readonly NativeFrameDualWindowPublication[];
  readonly incomingRejected: readonly NativeFrameDualWindowIncomingRejection[];
  readonly currentRamRetained: boolean;
  readonly currentOpfsRetained: boolean;
  readonly projectedRamEntries: number;
  readonly projectedRamNativeBytes: number;
  readonly projectedOpfsEntries: number;
  readonly projectedOpfsNativeBytes: number;
  readonly projectedOpfsCommittedFileBytes: number;
  readonly projectedOpfsRootFileBytes: number;
  readonly opfsExternalFileBytes: number;
  readonly opfsPendingDeleteNativeBytes: number;
  readonly opfsPendingDeleteFileBytes: number;
  readonly opfsPendingWriteNativeBytes: number;
  readonly opfsPendingWriteFileBytes: number;
  readonly rootCapBlocked: boolean;
  readonly ramLimits: NativeFrameDualWindowTierLimits;
  readonly opfsLimits: NativeFrameDualWindowTierLimits;
}

export interface NativeFrameDualWindowRejectedPlan {
  readonly status: "invalid" | "stale";
  readonly reason: string;
}

export type NativeFrameDualWindowPlan =
  | NativeFrameDualWindowOkPlan
  | NativeFrameDualWindowRejectedPlan;

export const DEFAULT_NATIVE_FRAME_DUAL_WINDOW_CONFIG: Readonly<NativeFrameDualWindowConfig> =
  Object.freeze({
    ram: Object.freeze({ behind: 1, ahead: 1 }),
    opfs: Object.freeze({ behind: 3, ahead: 3 }),
  });

export const DEFAULT_NATIVE_FRAME_DUAL_WINDOW_LIMITS: Readonly<NativeFrameDualWindowLimits> =
  Object.freeze({
    ram: Object.freeze({
      maxNativeBytes: 32 * 1024,
      maxEntryNativeBytes: 8 * 1024,
      maxEntries: 5,
    }),
    opfs: Object.freeze({
      maxNativeBytes: 64 * 1024,
      maxEntryNativeBytes: 8 * 1024,
      maxEntries: 8,
    }),
    maxOpfsRootFileBytes: 128 * 1024,
  });

interface Candidate {
  readonly descriptor: NativeFrameDualWindowDescriptor;
  readonly frameNumber: number;
  readonly insideWindow: boolean;
}

function invalid(reason: string): NativeFrameDualWindowRejectedPlan {
  return Object.freeze({ status: "invalid", reason });
}

function stale(reason: string): NativeFrameDualWindowRejectedPlan {
  return Object.freeze({ status: "stale", reason });
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateConfig(
  config: NativeFrameDualWindowConfig,
): string | null {
  for (const value of [config.ram, config.opfs]) {
    if (
      !value ||
      !isNonNegativeInteger(value.behind) ||
      !isNonNegativeInteger(value.ahead)
    ) {
      return "invalid-window-config";
    }
  }
  return null;
}

function validateLimits(limits: NativeFrameDualWindowLimits): string | null {
  for (const tier of [limits.ram, limits.opfs]) {
    if (
      !tier ||
      !isPositiveInteger(tier.maxNativeBytes) ||
      !isPositiveInteger(tier.maxEntryNativeBytes) ||
      !isPositiveInteger(tier.maxEntries) ||
      tier.maxEntryNativeBytes > tier.maxNativeBytes
    ) {
      return "invalid-limits";
    }
  }
  if (!isPositiveInteger(limits.maxOpfsRootFileBytes)) {
    return "invalid-limits";
  }
  return null;
}

function keyId(key: NativeFrameCacheKey): string {
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

function sameScope(
  selected: NativeFrameCacheKey,
  other: NativeFrameCacheKey,
): boolean {
  return (
    selected.principalId === other.principalId &&
    selected.sessionId === other.sessionId &&
    selected.studyInstanceUID === other.studyInstanceUID &&
    selected.seriesInstanceUID === other.seriesInstanceUID &&
    selected.sopInstanceUID === other.sopInstanceUID &&
    selected.sourceVersion === other.sourceVersion &&
    selected.representation === other.representation &&
    selected.transferSyntaxUID === other.transferSyntaxUID
  );
}

function normalizeKey(
  input: NativeFrameCacheKey,
  numberOfFrames: number,
): NativeFrameCacheKey | null {
  try {
    const key = createNativeFrameCacheKey(input);
    if (key.frameNumber > numberOfFrames) {
      return null;
    }
    return key;
  } catch {
    return null;
  }
}

function validateBytes(
  nativeBytes: number,
  fileBytes: number,
  temporaryFileBytes: number,
  tier: "ram" | "opfs",
): string | null {
  if (
    !isPositiveInteger(nativeBytes) ||
    !isNonNegativeInteger(fileBytes) ||
    !isNonNegativeInteger(temporaryFileBytes)
  ) {
    return "invalid-bytes";
  }
  if (tier === "ram" && fileBytes !== nativeBytes) {
    return "invalid-bytes";
  }
  if (tier === "opfs" && fileBytes < nativeBytes) {
    return "invalid-bytes";
  }
  return null;
}

function validateEntryRef(entryRef: string): boolean {
  return (
    typeof entryRef === "string" &&
    entryRef.length > 0 &&
    entryRef.length <= 128
  );
}

function compareCandidates(
  left: Candidate,
  right: Candidate,
  selectedFrame: number,
): number {
  if (left.insideWindow !== right.insideWindow) {
    return left.insideWindow ? 1 : -1;
  }
  const leftDistance = Math.abs(left.frameNumber - selectedFrame);
  const rightDistance = Math.abs(right.frameNumber - selectedFrame);
  if (leftDistance !== rightDistance) {
    return rightDistance - leftDistance;
  }
  const leftAccess = left.descriptor.lastAccessOrdinal;
  const rightAccess = right.descriptor.lastAccessOrdinal;
  if (leftAccess !== rightAccess) {
    return leftAccess - rightAccess;
  }
  return left.descriptor.entryRef.localeCompare(right.descriptor.entryRef);
}

function sumNative(candidates: readonly Candidate[]): number {
  return candidates.reduce(
    (total, candidate) => total + candidate.descriptor.nativeBytes,
    0,
  );
}

function sumFiles(candidates: readonly Candidate[]): number {
  return candidates.reduce(
    (total, candidate) => total + candidate.descriptor.fileBytes,
    0,
  );
}

interface TierPlan {
  readonly retained: readonly Candidate[];
  readonly deletions: readonly NativeFrameDualWindowDeletion[];
}

function planTier(
  candidates: readonly Candidate[],
  desiredFrames: ReadonlySet<number>,
  selectedFrame: number,
  limits: NativeFrameDualWindowTierLimits,
  baseNativeBytes: number,
  baseEntries: number,
  baseFileBytes: number,
  maxRootFileBytes: number | null,
): TierPlan {
  const outside: Candidate[] = [];
  const inside: Candidate[] = [];
  for (const candidate of candidates) {
    const normalized: Candidate = {
      ...candidate,
      insideWindow: desiredFrames.has(candidate.frameNumber),
    };
    (normalized.insideWindow ? inside : outside).push(normalized);
  }
  outside.sort((left, right) =>
    compareCandidates(left, right, selectedFrame),
  );
  const deletions: NativeFrameDualWindowDeletion[] = outside.map(
    (candidate) => ({
      key: candidate.descriptor.key,
      entryRef: candidate.descriptor.entryRef,
      nativeBytes: candidate.descriptor.nativeBytes,
      fileBytes: candidate.descriptor.fileBytes,
      phase: "planned",
      reason: "outside-window",
    }),
  );
  const retained = inside.slice();
  while (
    retained.length + baseEntries > limits.maxEntries ||
    sumNative(retained) + baseNativeBytes > limits.maxNativeBytes ||
    (maxRootFileBytes !== null &&
      sumFiles(retained) + baseFileBytes > maxRootFileBytes)
  ) {
    if (retained.length === 0) {
      break;
    }
    retained.sort((left, right) =>
      compareCandidates(left, right, selectedFrame),
    );
    const evicted = retained.shift();
    if (!evicted) {
      break;
    }
    deletions.push({
      key: evicted.descriptor.key,
      entryRef: evicted.descriptor.entryRef,
      nativeBytes: evicted.descriptor.nativeBytes,
      fileBytes: evicted.descriptor.fileBytes,
      phase: "planned",
      reason: "pressure",
    });
  }
  return {
    retained: Object.freeze(retained),
    deletions: Object.freeze(deletions),
  };
}

export function planNativeFrameDualWindowPolicy(
  input: NativeFrameDualWindowPolicyInput,
): NativeFrameDualWindowPlan {
  if (!input || typeof input !== "object") {
    return invalid("invalid-input");
  }
  if (
    !isPositiveInteger(input.numberOfFrames) ||
    !isPositiveInteger(input.ramEpoch) ||
    !isPositiveInteger(input.opfsEpoch) ||
    !isNonNegativeInteger(input.ramRevision) ||
    !isNonNegativeInteger(input.opfsRevision) ||
    !isNonNegativeInteger(input.opfsExternalFileBytes)
  ) {
    return invalid("invalid-input");
  }
  if (
    input.expectedRamRevision !== undefined &&
    input.expectedRamRevision !== input.ramRevision
  ) {
    return stale("ram-revision-mismatch");
  }
  if (
    input.expectedOpfsRevision !== undefined &&
    input.expectedOpfsRevision !== input.opfsRevision
  ) {
    return stale("opfs-revision-mismatch");
  }

  const selectedKey = normalizeKey(input.selectedKey, input.numberOfFrames);
  if (!selectedKey) {
    return invalid("invalid-selected-key");
  }
  const config = input.config ?? DEFAULT_NATIVE_FRAME_DUAL_WINDOW_CONFIG;
  const limits = input.limits ?? DEFAULT_NATIVE_FRAME_DUAL_WINDOW_LIMITS;
  const configError = validateConfig(config);
  if (configError) {
    return invalid(configError);
  }
  const limitsError = validateLimits(limits);
  if (limitsError) {
    return invalid(limitsError);
  }

  let ramWindow: NativeRamWindow;
  let opfsWindow: NativeRamWindow;
  try {
    ramWindow = createNativeRamWindow({
      selectedKey,
      numberOfFrames: input.numberOfFrames,
      epoch: input.ramEpoch,
      config: config.ram,
    });
    opfsWindow = createNativeRamWindow({
      selectedKey,
      numberOfFrames: input.numberOfFrames,
      epoch: input.opfsEpoch,
      config: config.opfs,
    });
  } catch (error) {
    if (error instanceof NativeRamWindowPolicyError) {
      return invalid(error.code);
    }
    return invalid("invalid-window");
  }

  const ramDesired = new Set(ramWindow.frames);
  const opfsDesired = new Set(opfsWindow.frames);
  const ramCandidates: Candidate[] = [];
  const opfsCandidates: Candidate[] = [];
  const descriptorKeys = new Set<string>();
  const pendingWriteKeys = new Set<string>();
  const pendingDeleteKeys = new Set<string>();
  const incomingKeys = new Set<string>();

  for (const descriptor of input.descriptors) {
    if (
      !descriptor ||
      (descriptor.tier !== "ram" && descriptor.tier !== "opfs") ||
      !validateEntryRef(descriptor.entryRef) ||
      !isNonNegativeInteger(descriptor.lastAccessOrdinal)
    ) {
      return invalid("invalid-descriptor");
    }
    const key = normalizeKey(descriptor.key, input.numberOfFrames);
    if (!key || !sameScope(selectedKey, key)) {
      return invalid("wrong-context");
    }
    const byteError = validateBytes(
      descriptor.nativeBytes,
      descriptor.fileBytes,
      0,
      descriptor.tier,
    );
    if (byteError) {
      return invalid(byteError);
    }
    const identity = `${descriptor.tier}\u0000${keyId(key)}`;
    if (descriptorKeys.has(identity)) {
      return invalid("duplicate-descriptor");
    }
    descriptorKeys.add(identity);
    const candidate: Candidate = {
      descriptor: { ...descriptor, key },
      frameNumber: key.frameNumber,
      insideWindow:
        descriptor.tier === "ram"
          ? ramDesired.has(key.frameNumber)
          : opfsDesired.has(key.frameNumber),
    };
    (descriptor.tier === "ram" ? ramCandidates : opfsCandidates).push(
      candidate,
    );
  }

  for (const write of input.pendingWrites) {
    if (
      !write ||
      write.tier !== "opfs" ||
      !["queued", "writing", "publishing"].includes(write.state)
    ) {
      return invalid("invalid-pending-write");
    }
    const key = normalizeKey(write.key, input.numberOfFrames);
    if (!key || !sameScope(selectedKey, key)) {
      return invalid("wrong-context");
    }
    const byteError = validateBytes(
      write.nativeBytes,
      write.fileBytes,
      write.temporaryFileBytes,
      "opfs",
    );
    if (byteError) {
      return invalid(byteError);
    }
    const identity = keyId(key);
    if (pendingWriteKeys.has(identity)) {
      return invalid("duplicate-pending-write");
    }
    pendingWriteKeys.add(identity);
  }

  for (const deletion of input.pendingDeletes) {
    if (
      !deletion ||
      (deletion.tier !== "ram" && deletion.tier !== "opfs") ||
      !["planned", "deleting"].includes(deletion.state) ||
      !validateEntryRef(deletion.entryRef)
    ) {
      return invalid("invalid-pending-delete");
    }
    const key = normalizeKey(deletion.key, input.numberOfFrames);
    if (!key || !sameScope(selectedKey, key)) {
      return invalid("wrong-context");
    }
    const byteError = validateBytes(
      deletion.nativeBytes,
      deletion.fileBytes,
      0,
      deletion.tier,
    );
    if (byteError) {
      return invalid(byteError);
    }
    const identity = `${deletion.tier}\u0000${keyId(key)}`;
    if (descriptorKeys.has(identity)) {
      return invalid("duplicate-descriptor-pending-delete");
    }
    if (
      deletion.tier === "opfs" &&
      pendingWriteKeys.has(keyId(key))
    ) {
      return invalid("duplicate-pending-write-delete");
    }
    if (pendingDeleteKeys.has(identity)) {
      return invalid("duplicate-pending-delete");
    }
    pendingDeleteKeys.add(identity);
  }

  for (const item of input.incoming ?? []) {
    if (!item || (item.tier !== "ram" && item.tier !== "opfs")) {
      return invalid("invalid-incoming");
    }
    const key = normalizeKey(item.key, input.numberOfFrames);
    if (!key || !sameScope(selectedKey, key)) {
      return invalid("wrong-context");
    }
    const byteError = validateBytes(
      item.nativeBytes,
      item.fileBytes,
      item.temporaryFileBytes,
      item.tier,
    );
    if (byteError) {
      return invalid(byteError);
    }
    const identity = `${item.tier}\u0000${keyId(key)}`;
    if (incomingKeys.has(identity)) {
      return invalid("duplicate-incoming");
    }
    incomingKeys.add(identity);
    if (
      item.tier === "opfs" &&
      pendingWriteKeys.has(keyId(key))
    ) {
      return invalid("duplicate-incoming-pending-write");
    }
    if (
      (item.tier === "ram" || item.tier === "opfs") &&
      pendingDeleteKeys.has(`${item.tier}\u0000${keyId(key)}`)
    ) {
      return invalid("duplicate-incoming-pending-delete");
    }
  }

  const ramPendingDeletes = input.pendingDeletes.filter(
    (deletion) => deletion.tier === "ram",
  );
  const opfsPendingDeletes = input.pendingDeletes.filter(
    (deletion) => deletion.tier === "opfs",
  );
  const opfsPendingWrites = input.pendingWrites;
  const opfsPendingDeleteNativeBytes = opfsPendingDeletes.reduce(
    (total, deletion) => total + deletion.nativeBytes,
    0,
  );
  const opfsPendingDeleteFileBytes = opfsPendingDeletes.reduce(
    (total, deletion) => total + deletion.fileBytes,
    0,
  );
  const opfsPendingWriteNativeBytes = opfsPendingWrites.reduce(
    (total, write) => total + write.nativeBytes,
    0,
  );
  const opfsPendingWriteFileBytes = opfsPendingWrites.reduce(
    (total, write) => total + write.fileBytes + write.temporaryFileBytes,
    0,
  );

  const ramPlan = planTier(
    ramCandidates,
    ramDesired,
    selectedKey.frameNumber,
    limits.ram,
    ramPendingDeletes.reduce(
      (total, deletion) => total + deletion.nativeBytes,
      0,
    ),
    ramPendingDeletes.length,
    0,
    null,
  );
  const opfsPlan = planTier(
    opfsCandidates,
    opfsDesired,
    selectedKey.frameNumber,
    limits.opfs,
    opfsPendingDeleteNativeBytes + opfsPendingWriteNativeBytes,
    opfsPendingDeletes.length + opfsPendingWrites.length,
    opfsPendingDeleteFileBytes +
      opfsPendingWriteFileBytes +
      input.opfsExternalFileBytes,
    limits.maxOpfsRootFileBytes,
  );

  const ramRetained = ramPlan.retained;
  const opfsRetained = opfsPlan.retained;
  const opfsPendingDeleteFrames = opfsPendingDeletes.map(
    (deletion) => deletion.key.frameNumber,
  );
  const ramRetainedBytes = sumNative(ramRetained);
  const opfsRetainedBytes = sumNative(opfsRetained);
  const opfsRetainedFileBytes = sumFiles(opfsRetained);
  const opfsPlannedDeleteFrames = opfsPlan.deletions.map(
    (deletion) => deletion.key.frameNumber,
  );
  const opfsIneligibleFrames = Array.from(
    new Set([...opfsPendingDeleteFrames, ...opfsPlannedDeleteFrames]),
  ).sort((left, right) => left - right);

  const ramAdmissions: NativeFrameDualWindowAdmission[] = [];
  const opfsPublications: NativeFrameDualWindowPublication[] = [];
  const incomingRejected: NativeFrameDualWindowIncomingRejection[] = [];
  let ramEntries = ramRetained.length + ramPendingDeletes.length;
  let ramNativeBytes =
    ramRetainedBytes +
    ramPendingDeletes.reduce(
      (total, deletion) => total + deletion.nativeBytes,
      0,
    );
  let opfsEntries =
    opfsRetained.length +
    opfsPendingDeletes.length +
    opfsPendingWrites.length;
  let opfsNativeBytes =
    opfsRetainedBytes +
    opfsPendingDeleteNativeBytes +
    opfsPendingWriteNativeBytes;
  let opfsCommittedFileBytes = opfsRetainedFileBytes;
  let opfsPeakRootFileBytes =
    input.opfsExternalFileBytes +
    sumFiles(opfsCandidates) +
    opfsPendingDeleteFileBytes +
    opfsPendingWriteFileBytes;

  for (const item of input.incoming ?? []) {
    const key = item.key;
    if (item.tier === "ram") {
      if (!ramDesired.has(key.frameNumber)) {
        incomingRejected.push({
          tier: "ram",
          frameNumber: key.frameNumber,
          reason: "outside-window",
        });
        continue;
      }
      if (item.nativeBytes > limits.ram.maxEntryNativeBytes) {
        incomingRejected.push({
          tier: "ram",
          frameNumber: key.frameNumber,
          reason: "entry-oversize",
        });
        continue;
      }
      const replacement = ramRetained.some(
        (candidate) => keyId(candidate.descriptor.key) === keyId(key),
      );
      const oldBytes = replacement
        ? ramRetained.find(
            (candidate) => keyId(candidate.descriptor.key) === keyId(key),
          )?.descriptor.nativeBytes ?? 0
        : 0;
      const projectedEntries =
        ramEntries + (replacement ? 0 : 1);
      const projectedBytes =
        ramNativeBytes - oldBytes + item.nativeBytes;
      if (
        projectedEntries > limits.ram.maxEntries ||
        projectedBytes > limits.ram.maxNativeBytes
      ) {
        incomingRejected.push({
          tier: "ram",
          frameNumber: key.frameNumber,
          reason: "capacity",
        });
        continue;
      }
      ramAdmissions.push({
        key,
        nativeBytes: item.nativeBytes,
        replacement,
      });
      ramEntries = projectedEntries;
      ramNativeBytes = projectedBytes;
      continue;
    }

    if (!opfsDesired.has(key.frameNumber)) {
      incomingRejected.push({
        tier: "opfs",
        frameNumber: key.frameNumber,
        reason: "outside-window",
      });
      continue;
    }
    if (item.nativeBytes > limits.opfs.maxEntryNativeBytes) {
      incomingRejected.push({
        tier: "opfs",
        frameNumber: key.frameNumber,
        reason: "entry-oversize",
      });
      continue;
    }
    const replacementCandidate = opfsCandidates.find(
      (candidate) => keyId(candidate.descriptor.key) === keyId(key),
    );
    const replacement = !!replacementCandidate;
    const oldNative = replacementCandidate?.descriptor.nativeBytes ?? 0;
    const oldFile = replacementCandidate?.descriptor.fileBytes ?? 0;
    const projectedEntries =
      opfsEntries + (replacement ? 0 : 1);
    const projectedNative =
      opfsNativeBytes - oldNative + item.nativeBytes;
    const rootPeak =
      opfsPeakRootFileBytes +
      item.fileBytes +
      item.temporaryFileBytes;
    if (
      projectedEntries > limits.opfs.maxEntries ||
      projectedNative > limits.opfs.maxNativeBytes
    ) {
      incomingRejected.push({
        tier: "opfs",
        frameNumber: key.frameNumber,
        reason: "capacity",
      });
      continue;
    }
    if (rootPeak > limits.maxOpfsRootFileBytes) {
      incomingRejected.push({
        tier: "opfs",
        frameNumber: key.frameNumber,
        reason: "root-cap",
      });
      continue;
    }
    opfsPublications.push({
      key,
      nativeBytes: item.nativeBytes,
      fileBytes: item.fileBytes,
      temporaryFileBytes: item.temporaryFileBytes,
      replacement,
    });
    opfsEntries = projectedEntries;
    opfsNativeBytes = projectedNative;
    opfsCommittedFileBytes =
      opfsCommittedFileBytes - oldFile + item.fileBytes;
    opfsPeakRootFileBytes = rootPeak;
  }

  const ramAdmittedFrames = new Set(
    ramAdmissions.map((admission) => admission.key.frameNumber),
  );
  const opfsAdmittedFrames = new Set(
    opfsPublications.map((publication) => publication.key.frameNumber),
  );
  const ramRetainedFrames = ramRetained.map(
    (candidate) => candidate.frameNumber,
  );
  const opfsRetainedFrames = opfsRetained.map(
    (candidate) => candidate.frameNumber,
  );
  const ramMissingFrames = ramWindow.frames.filter(
    (frame) =>
      !ramRetainedFrames.includes(frame) &&
      !ramAdmittedFrames.has(frame),
  );
  const opfsMissingFrames = opfsWindow.frames.filter(
    (frame) =>
      !opfsRetainedFrames.includes(frame) &&
      !opfsAdmittedFrames.has(frame),
  );
  const currentRamRetained =
    ramRetainedFrames.includes(selectedKey.frameNumber) ||
    ramAdmittedFrames.has(selectedKey.frameNumber);
  const currentOpfsRetained =
    opfsRetainedFrames.includes(selectedKey.frameNumber) ||
    opfsAdmittedFrames.has(selectedKey.frameNumber);
  const rootCapBlocked =
    input.opfsExternalFileBytes +
      opfsPendingDeleteFileBytes +
      opfsPendingWriteFileBytes >
    limits.maxOpfsRootFileBytes;

  return Object.freeze({
    status: "ok",
    selectedFrame: selectedKey.frameNumber,
    inputRevision: `${input.ramRevision}:${input.opfsRevision}:${input.ramEpoch}:${input.opfsEpoch}`,
    ramWindow,
    opfsWindow,
    desiredRamFrames: ramWindow.frames,
    desiredOpfsFrames: opfsWindow.frames,
    ramResidentFrames: Object.freeze(
      ramCandidates.map((candidate) => candidate.frameNumber).sort((a, b) => a - b),
    ),
    opfsResidentFrames: Object.freeze(
      opfsCandidates.map((candidate) => candidate.frameNumber).sort((a, b) => a - b),
    ),
    ramMissingFrames: Object.freeze(
      ramMissingFrames.slice().sort((a, b) => a - b),
    ),
    opfsMissingFrames: Object.freeze(
      opfsMissingFrames.slice().sort((a, b) => a - b),
    ),
    ramEvictions: Object.freeze(
      ramPlan.deletions.map((deletion) => ({
        key: deletion.key,
        entryRef: deletion.entryRef,
        nativeBytes: deletion.nativeBytes,
        reason: deletion.reason,
      })),
    ),
    opfsPlannedDeletions: opfsPlan.deletions,
    opfsIneligibleFrames: Object.freeze(opfsIneligibleFrames),
    ramAdmissions: Object.freeze(ramAdmissions),
    opfsPublications: Object.freeze(opfsPublications),
    incomingRejected: Object.freeze(incomingRejected),
    currentRamRetained,
    currentOpfsRetained,
    projectedRamEntries: ramEntries,
    projectedRamNativeBytes: ramNativeBytes,
    projectedOpfsEntries: opfsEntries,
    projectedOpfsNativeBytes: opfsNativeBytes,
    projectedOpfsCommittedFileBytes: opfsCommittedFileBytes,
    projectedOpfsRootFileBytes: opfsPeakRootFileBytes,
    opfsExternalFileBytes: input.opfsExternalFileBytes,
    opfsPendingDeleteNativeBytes,
    opfsPendingDeleteFileBytes,
    opfsPendingWriteNativeBytes,
    opfsPendingWriteFileBytes,
    rootCapBlocked,
    ramLimits: limits.ram,
    opfsLimits: limits.opfs,
  });
}
