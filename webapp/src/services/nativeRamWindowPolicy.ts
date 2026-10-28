import {
  createNativeFrameCacheKey,
  type NativeFrameCacheKey,
  type NativeRamCacheEntry,
  type NativeRamCacheLimits,
} from "./nativeRamCache";

const ENTRY_ID_PATTERN = /^NRC-[1-9][0-9]*:E[1-9][0-9]*$/;

export interface NativeRamWindowPolicyConfig {
  readonly behind: number;
  readonly ahead: number;
}

export const DEFAULT_NATIVE_RAM_WINDOW_POLICY: Readonly<NativeRamWindowPolicyConfig> =
  Object.freeze({
    behind: 1,
    ahead: 1,
  });

export type NativeRamWindowPolicyErrorCode =
  | "invalid-config"
  | "invalid-window"
  | "invalid-limits"
  | "invalid-resident"
  | "invalid-completion"
  | "context-mismatch";

export class NativeRamWindowPolicyError extends Error {
  readonly code: NativeRamWindowPolicyErrorCode;

  constructor(code: NativeRamWindowPolicyErrorCode, message: string) {
    super(message);
    this.name = "NativeRamWindowPolicyError";
    this.code = code;
  }
}

export interface NativeRamWindowRequest {
  readonly selectedKey: NativeFrameCacheKey;
  readonly numberOfFrames: number;
  readonly epoch: number;
  readonly config?: NativeRamWindowPolicyConfig;
}

export interface NativeRamWindow {
  readonly selectedKey: NativeFrameCacheKey;
  readonly selectedFrame: number;
  readonly numberOfFrames: number;
  readonly behind: number;
  readonly ahead: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly frames: readonly number[];
  readonly epoch: number;
}

export interface NativeRamWindowResident {
  readonly key: NativeFrameCacheKey;
  readonly entry: NativeRamCacheEntry;
}

export interface NativeRamWindowCompletion {
  readonly key: NativeFrameCacheKey;
  readonly nativeBytes: number;
  readonly epoch: number;
}

export type NativeRamWindowEvictionReason = "outside-window" | "pressure";

export interface NativeRamWindowEviction {
  readonly key: NativeFrameCacheKey;
  readonly entryId: string;
  readonly frameNumber: number;
  readonly nativeBytes: number;
  readonly lastAccessOrdinal: number;
  readonly reason: NativeRamWindowEvictionReason;
}

export interface NativeRamWindowRetentionInput {
  readonly window: NativeRamWindow;
  readonly residents: readonly NativeRamWindowResident[];
  readonly limits: NativeRamCacheLimits;
}

export interface NativeRamWindowRetentionPlan {
  readonly window: NativeRamWindow;
  readonly desiredFrames: readonly number[];
  readonly residentFrames: readonly number[];
  readonly outsideWindowFrames: readonly number[];
  readonly missingFrames: readonly number[];
  readonly retainedFrames: readonly number[];
  readonly evictions: readonly NativeRamWindowEviction[];
  readonly projectedEntryCount: number;
  readonly projectedNativeBytes: number;
  readonly currentRetained: boolean;
  readonly limits: NativeRamCacheLimits;
}

export type NativeRamWindowAdmissionStatus =
  | "admitted"
  | "rejected"
  | "not-cacheable";

export type NativeRamWindowAdmissionReason =
  | "ok"
  | "wrong-context"
  | "stale-epoch"
  | "outside-window"
  | "oversize-entry"
  | "oversize-total";

export interface NativeRamWindowAdmission {
  readonly status: NativeRamWindowAdmissionStatus;
  readonly reason: NativeRamWindowAdmissionReason;
  readonly replacement: boolean;
}

export interface NativeRamWindowAdmissionInput {
  readonly window: NativeRamWindow;
  readonly residents: readonly NativeRamWindowResident[];
  readonly completion: NativeRamWindowCompletion;
  readonly limits: NativeRamCacheLimits;
}

export interface NativeRamWindowAdmissionPlan {
  readonly window: NativeRamWindow;
  readonly admission: NativeRamWindowAdmission;
  readonly desiredFrames: readonly number[];
  readonly residentFrames: readonly number[];
  readonly outsideWindowFrames: readonly number[];
  readonly missingFrames: readonly number[];
  readonly retainedFrames: readonly number[];
  readonly evictions: readonly NativeRamWindowEviction[];
  readonly projectedEntryCount: number;
  readonly projectedNativeBytes: number;
  readonly currentRetained: boolean;
  readonly incomingRetained: boolean;
  readonly limits: NativeRamCacheLimits;
}

interface ResidentCandidate {
  readonly key: NativeFrameCacheKey;
  readonly keyFingerprint: string;
  readonly entryId: string;
  readonly frameNumber: number;
  readonly nativeBytes: number;
  readonly lastAccessOrdinal: number;
}

interface IncomingCandidate {
  readonly key: NativeFrameCacheKey;
  readonly keyFingerprint: string;
  readonly entryId: string | null;
  readonly frameNumber: number;
  readonly nativeBytes: number;
  readonly lastAccessOrdinal: number;
}

interface Selection {
  readonly retained: readonly (ResidentCandidate | IncomingCandidate)[];
  readonly evicted: readonly ResidentCandidate[];
  readonly projectedNativeBytes: number;
}

export function createNativeRamWindow(
  request: NativeRamWindowRequest,
): NativeRamWindow {
  if (!request || typeof request !== "object") {
    throw new NativeRamWindowPolicyError(
      "invalid-window",
      "Native RAM window request is required",
    );
  }

  const selectedKey = normalizeKey(
    request.selectedKey,
    "invalid-window",
    "Native RAM window selected key is invalid",
  );
  assertPositiveInteger(
    request.numberOfFrames,
    "invalid-window",
    "Native RAM window frame count must be a positive integer",
  );
  assertPositiveInteger(
    request.epoch,
    "invalid-window",
    "Native RAM window epoch must be a positive integer",
  );
  if (selectedKey.frameNumber > request.numberOfFrames) {
    throw new NativeRamWindowPolicyError(
      "invalid-window",
      "Native RAM window selected frame is outside the instance",
    );
  }

  const config = normalizePolicyConfig(request.config);
  const startFrame =
    config.behind >= selectedKey.frameNumber
      ? 1
      : selectedKey.frameNumber - config.behind;
  const endFrame =
    config.ahead >= request.numberOfFrames - selectedKey.frameNumber
      ? request.numberOfFrames
      : selectedKey.frameNumber + config.ahead;
  const frames = Object.freeze(
    Array.from({ length: endFrame - startFrame + 1 }, (_, index) => {
      return startFrame + index;
    }),
  );

  return Object.freeze({
    selectedKey,
    selectedFrame: selectedKey.frameNumber,
    numberOfFrames: request.numberOfFrames,
    behind: config.behind,
    ahead: config.ahead,
    startFrame,
    endFrame,
    frames,
    epoch: request.epoch,
  });
}

export function planNativeRamWindowRetention(
  input: NativeRamWindowRetentionInput,
): NativeRamWindowRetentionPlan {
  const window = normalizeWindow(input.window);
  const limits = normalizeLimits(input.limits);
  const residents = normalizeResidents(input.residents, window, limits);
  const desiredSet = new Set(window.frames);
  const residentByFrame = new Map(
    residents.map((resident) => [resident.frameNumber, resident]),
  );
  const outside = residents
    .filter((resident) => !desiredSet.has(resident.frameNumber))
    .sort((left, right) => left.frameNumber - right.frameNumber);
  const inWindow = residents.filter((resident) =>
    desiredSet.has(resident.frameNumber),
  );
  const selection = selectRetained(
    inWindow,
    window.selectedFrame,
    limits,
  );
  const evictions = Object.freeze([
    ...outside.map((resident) => toEviction(resident, "outside-window")),
    ...selection.evicted.map((resident) => toEviction(resident, "pressure")),
  ]);
  const retainedFrames = freezeFrames(
    selection.retained.map((candidate) => candidate.frameNumber),
  );
  const residentFrames = freezeFrames(
    residents.map((resident) => resident.frameNumber),
  );
  const missingFrames = Object.freeze(
    window.frames.filter((frame) => !residentByFrame.has(frame)),
  );

  return Object.freeze({
    window,
    desiredFrames: window.frames,
    residentFrames,
    outsideWindowFrames: Object.freeze(outside.map((resident) => resident.frameNumber)),
    missingFrames,
    retainedFrames,
    evictions,
    projectedEntryCount: selection.retained.length,
    projectedNativeBytes: selection.projectedNativeBytes,
    currentRetained: retainedFrames.includes(window.selectedFrame),
    limits,
  });
}

export function planNativeRamWindowAdmission(
  input: NativeRamWindowAdmissionInput,
): NativeRamWindowAdmissionPlan {
  const window = normalizeWindow(input.window);
  const limits = normalizeLimits(input.limits);
  const residents = normalizeResidents(input.residents, window, limits);
  const completion = normalizeCompletion(input.completion);
  const replacement = residents.some((resident) =>
    sameKey(resident.key, completion.key),
  );
  const admission = evaluateAdmission(
    window,
    completion,
    limits,
    replacement,
  );
  const desiredSet = new Set(window.frames);
  const residentByFrame = new Map(
    residents.map((resident) => [resident.frameNumber, resident]),
  );
  const outside = residents
    .filter((resident) => !desiredSet.has(resident.frameNumber))
    .sort((left, right) => left.frameNumber - right.frameNumber);
  const missingFrames = Object.freeze(
    window.frames.filter((frame) => !residentByFrame.has(frame)),
  );
  const residentFrames = freezeFrames(
    residents.map((resident) => resident.frameNumber),
  );

  if (admission.status !== "admitted") {
    const retainedFrames = residentFrames;
    return Object.freeze({
      window,
      admission,
      desiredFrames: window.frames,
      residentFrames,
      outsideWindowFrames: Object.freeze(
        outside.map((resident) => resident.frameNumber),
      ),
      missingFrames,
      retainedFrames,
      evictions: Object.freeze([]),
      projectedEntryCount: residents.length,
      projectedNativeBytes: sumNativeBytes(residents),
      currentRetained: retainedFrames.includes(window.selectedFrame),
      incomingRetained: false,
      limits,
    });
  }

  const baseInWindow = residents.filter((resident) =>
    desiredSet.has(resident.frameNumber),
  );
  const replacementResident = baseInWindow.find((resident) =>
    sameKey(resident.key, completion.key),
  );
  const withoutReplaced = baseInWindow.filter(
    (resident) => !sameKey(resident.key, completion.key),
  );
  const incoming = toIncomingCandidate(completion, replacementResident);
  const withIncoming = selectRetained(
    [...withoutReplaced, incoming],
    window.selectedFrame,
    limits,
  );
  const incomingRetained = withIncoming.retained.some((candidate) =>
    sameKey(candidate.key, completion.key),
  );
  const selection = incomingRetained
    ? withIncoming
    : selectRetained(baseInWindow, window.selectedFrame, limits);
  const evictions = Object.freeze([
    ...outside.map((resident) => toEviction(resident, "outside-window")),
    ...selection.evicted.map((resident) => toEviction(resident, "pressure")),
  ]);
  const retainedFrames = freezeFrames(
    selection.retained.map((candidate) => candidate.frameNumber),
  );

  return Object.freeze({
    window,
    admission,
    desiredFrames: window.frames,
    residentFrames,
    outsideWindowFrames: Object.freeze(
      outside.map((resident) => resident.frameNumber),
    ),
    missingFrames,
    retainedFrames,
    evictions,
    projectedEntryCount: selection.retained.length,
    projectedNativeBytes: selection.projectedNativeBytes,
    currentRetained: retainedFrames.includes(window.selectedFrame),
    incomingRetained,
    limits,
  });
}

function normalizeWindow(input: NativeRamWindow): NativeRamWindow {
  if (!input || typeof input !== "object") {
    throw new NativeRamWindowPolicyError(
      "invalid-window",
      "Native RAM window is required",
    );
  }
  return createNativeRamWindow({
    selectedKey: input.selectedKey,
    numberOfFrames: input.numberOfFrames,
    epoch: input.epoch,
    config: {
      behind: input.behind,
      ahead: input.ahead,
    },
  });
}

function normalizePolicyConfig(
  input: NativeRamWindowPolicyConfig | undefined,
): NativeRamWindowPolicyConfig {
  const config = input ?? DEFAULT_NATIVE_RAM_WINDOW_POLICY;
  if (!config || typeof config !== "object") {
    throw new NativeRamWindowPolicyError(
      "invalid-config",
      "Native RAM window config is required",
    );
  }
  assertNonNegativeInteger(
    config.behind,
    "invalid-config",
    "Native RAM window behind count must be a non-negative integer",
  );
  assertNonNegativeInteger(
    config.ahead,
    "invalid-config",
    "Native RAM window ahead count must be a non-negative integer",
  );
  return Object.freeze({
    behind: config.behind,
    ahead: config.ahead,
  });
}

function normalizeLimits(input: NativeRamCacheLimits): NativeRamCacheLimits {
  if (!input || typeof input !== "object") {
    throw new NativeRamWindowPolicyError(
      "invalid-limits",
      "Native RAM window limits are required",
    );
  }
  assertPositiveInteger(
    input.maxTotalNativeBytes,
    "invalid-limits",
    "Native RAM window total byte limit must be a positive integer",
  );
  assertPositiveInteger(
    input.maxEntryNativeBytes,
    "invalid-limits",
    "Native RAM window entry byte limit must be a positive integer",
  );
  assertPositiveInteger(
    input.maxEntries,
    "invalid-limits",
    "Native RAM window entry limit must be a positive integer",
  );
  assertPositiveInteger(
    input.maxEventCount,
    "invalid-limits",
    "Native RAM window event limit must be a positive integer",
  );
  return Object.freeze({
    maxTotalNativeBytes: input.maxTotalNativeBytes,
    maxEntryNativeBytes: input.maxEntryNativeBytes,
    maxEntries: input.maxEntries,
    maxEventCount: input.maxEventCount,
  });
}

function normalizeResidents(
  input: readonly NativeRamWindowResident[],
  window: NativeRamWindow,
  limits: NativeRamCacheLimits,
): readonly ResidentCandidate[] {
  if (!Array.isArray(input)) {
    throw new NativeRamWindowPolicyError(
      "invalid-resident",
      "Native RAM window residents must be an array",
    );
  }
  const seen = new Set<string>();
  return Object.freeze(
    input.map((resident) => {
      const candidate = normalizeResident(resident, limits);
      if (!sameContext(candidate.key, window.selectedKey)) {
        throw new NativeRamWindowPolicyError(
          "context-mismatch",
          "Native RAM window resident does not match the selected instance",
        );
      }
      if (seen.has(candidate.keyFingerprint)) {
        throw new NativeRamWindowPolicyError(
          "invalid-resident",
          "Native RAM window residents contain a duplicate key",
        );
      }
      seen.add(candidate.keyFingerprint);
      return candidate;
    }),
  );
}

function normalizeResident(
  input: NativeRamWindowResident,
  limits: NativeRamCacheLimits,
): ResidentCandidate {
  if (!input || typeof input !== "object" || !input.entry) {
    throw new NativeRamWindowPolicyError(
      "invalid-resident",
      "Native RAM window resident descriptor is invalid",
    );
  }
  const key = normalizeKey(
    input.key,
    "invalid-resident",
    "Native RAM window resident key is invalid",
  );
  const entry = input.entry;
  if (
    typeof entry.entryId !== "string" ||
    !ENTRY_ID_PATTERN.test(entry.entryId) ||
    entry.frameNumber !== key.frameNumber ||
    !Number.isSafeInteger(entry.nativeBytes) ||
    entry.nativeBytes < 1 ||
    entry.nativeBytes > limits.maxEntryNativeBytes ||
    entry.nativeBytes > limits.maxTotalNativeBytes ||
    !Number.isSafeInteger(entry.lastAccessOrdinal) ||
    entry.lastAccessOrdinal < 0
  ) {
    throw new NativeRamWindowPolicyError(
      "invalid-resident",
      "Native RAM window resident entry is invalid",
    );
  }
  return Object.freeze({
    key,
    keyFingerprint: fingerprintOf(key),
    entryId: entry.entryId,
    frameNumber: key.frameNumber,
    nativeBytes: entry.nativeBytes,
    lastAccessOrdinal: entry.lastAccessOrdinal,
  });
}

function normalizeCompletion(
  input: NativeRamWindowCompletion,
): NativeRamWindowCompletion {
  if (!input || typeof input !== "object") {
    throw new NativeRamWindowPolicyError(
      "invalid-completion",
      "Native RAM window completion is invalid",
    );
  }
  const key = normalizeKey(
    input.key,
    "invalid-completion",
    "Native RAM window completion key is invalid",
  );
  assertPositiveInteger(
    input.nativeBytes,
    "invalid-completion",
    "Native RAM window completion size must be a positive integer",
  );
  assertPositiveInteger(
    input.epoch,
    "invalid-completion",
    "Native RAM window completion epoch must be a positive integer",
  );
  return Object.freeze({
    key,
    nativeBytes: input.nativeBytes,
    epoch: input.epoch,
  });
}

function evaluateAdmission(
  window: NativeRamWindow,
  completion: NativeRamWindowCompletion,
  limits: NativeRamCacheLimits,
  replacement: boolean,
): NativeRamWindowAdmission {
  if (!sameContext(completion.key, window.selectedKey)) {
    return Object.freeze({
      status: "rejected",
      reason: "wrong-context",
      replacement: false,
    });
  }
  if (completion.epoch !== window.epoch) {
    return Object.freeze({
      status: "rejected",
      reason: "stale-epoch",
      replacement,
    });
  }
  if (completion.key.frameNumber < window.startFrame ||
      completion.key.frameNumber > window.endFrame) {
    return Object.freeze({
      status: "rejected",
      reason: "outside-window",
      replacement,
    });
  }
  if (completion.nativeBytes > limits.maxEntryNativeBytes) {
    return Object.freeze({
      status: "not-cacheable",
      reason: "oversize-entry",
      replacement,
    });
  }
  if (completion.nativeBytes > limits.maxTotalNativeBytes) {
    return Object.freeze({
      status: "not-cacheable",
      reason: "oversize-total",
      replacement,
    });
  }
  return Object.freeze({
    status: "admitted",
    reason: "ok",
    replacement,
  });
}

function selectRetained(
  candidates: readonly (ResidentCandidate | IncomingCandidate)[],
  selectedFrame: number,
  limits: NativeRamCacheLimits,
): Selection {
  const retained = new Map(
    candidates.map((candidate) => [candidate.keyFingerprint, candidate]),
  );
  let projectedNativeBytes = candidates.reduce(
    (total, candidate) => total + candidate.nativeBytes,
    0,
  );
  const protectedFingerprint = candidates.find(
    (candidate) =>
      candidate.frameNumber === selectedFrame &&
      candidate.nativeBytes <= limits.maxEntryNativeBytes &&
      candidate.nativeBytes <= limits.maxTotalNativeBytes,
  )?.keyFingerprint;
  const evictionOrder = candidates
    .filter((candidate) => candidate.keyFingerprint !== protectedFingerprint)
    .sort((left, right) =>
      compareEvictionPriority(left, right, selectedFrame),
    );
  const evicted: ResidentCandidate[] = [];

  for (const victim of evictionOrder) {
    if (
      retained.size <= limits.maxEntries &&
      projectedNativeBytes <= limits.maxTotalNativeBytes
    ) {
      break;
    }
    if (!retained.has(victim.keyFingerprint)) {
      continue;
    }
    retained.delete(victim.keyFingerprint);
    projectedNativeBytes -= victim.nativeBytes;
    if (victim.entryId !== null) {
      evicted.push(victim as ResidentCandidate);
    }
  }

  return Object.freeze({
    retained: Object.freeze(
      Array.from(retained.values()).sort(
        (left, right) => left.frameNumber - right.frameNumber,
      ),
    ),
    evicted: Object.freeze(evicted),
    projectedNativeBytes,
  });
}

function compareEvictionPriority(
  left: ResidentCandidate | IncomingCandidate,
  right: ResidentCandidate | IncomingCandidate,
  selectedFrame: number,
): number {
  const distance =
    Math.abs(right.frameNumber - selectedFrame) -
    Math.abs(left.frameNumber - selectedFrame);
  if (distance !== 0) {
    return distance;
  }
  if (left.lastAccessOrdinal !== right.lastAccessOrdinal) {
    return left.lastAccessOrdinal - right.lastAccessOrdinal;
  }
  if (left.frameNumber !== right.frameNumber) {
    return left.frameNumber - right.frameNumber;
  }
  return (left.entryId ?? "").localeCompare(right.entryId ?? "");
}

function toIncomingCandidate(
  completion: NativeRamWindowCompletion,
  replacement: ResidentCandidate | undefined,
): IncomingCandidate {
  return Object.freeze({
    key: completion.key,
    keyFingerprint: fingerprintOf(completion.key),
    entryId: replacement?.entryId ?? null,
    frameNumber: completion.key.frameNumber,
    nativeBytes: completion.nativeBytes,
    lastAccessOrdinal: Number.MAX_SAFE_INTEGER,
  });
}

function toEviction(
  resident: ResidentCandidate,
  reason: NativeRamWindowEvictionReason,
): NativeRamWindowEviction {
  return Object.freeze({
    key: resident.key,
    entryId: resident.entryId,
    frameNumber: resident.frameNumber,
    nativeBytes: resident.nativeBytes,
    lastAccessOrdinal: resident.lastAccessOrdinal,
    reason,
  });
}

function normalizeKey(
  input: NativeFrameCacheKey,
  code: "invalid-window" | "invalid-resident" | "invalid-completion",
  message: string,
): NativeFrameCacheKey {
  try {
    return createNativeFrameCacheKey(input);
  } catch {
    throw new NativeRamWindowPolicyError(code, message);
  }
}

function sameContext(
  left: NativeFrameCacheKey,
  right: NativeFrameCacheKey,
): boolean {
  return (
    left.principalId === right.principalId &&
    left.sessionId === right.sessionId &&
    left.studyInstanceUID === right.studyInstanceUID &&
    left.sourceVersion === right.sourceVersion &&
    left.seriesInstanceUID === right.seriesInstanceUID &&
    left.sopInstanceUID === right.sopInstanceUID &&
    left.representation === right.representation &&
    left.transferSyntaxUID === right.transferSyntaxUID
  );
}

function sameKey(left: NativeFrameCacheKey, right: NativeFrameCacheKey): boolean {
  return left.frameNumber === right.frameNumber && sameContext(left, right);
}

function fingerprintOf(key: NativeFrameCacheKey): string {
  return JSON.stringify([
    key.principalId,
    key.sessionId,
    key.studyInstanceUID,
    key.sourceVersion,
    key.seriesInstanceUID,
    key.sopInstanceUID,
    key.frameNumber,
    key.representation,
    key.transferSyntaxUID,
  ]);
}

function freezeFrames(frames: readonly number[]): readonly number[] {
  return Object.freeze(
    [...frames].sort((left, right) => left - right),
  );
}

function sumNativeBytes(
  candidates: readonly (ResidentCandidate | IncomingCandidate)[],
): number {
  return candidates.reduce(
    (total, candidate) => total + candidate.nativeBytes,
    0,
  );
}

function assertPositiveInteger(
  value: number,
  code: "invalid-window" | "invalid-limits" | "invalid-completion",
  message: string,
): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new NativeRamWindowPolicyError(code, message);
  }
}

function assertNonNegativeInteger(
  value: number,
  code: "invalid-config",
  message: string,
): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new NativeRamWindowPolicyError(code, message);
  }
}
