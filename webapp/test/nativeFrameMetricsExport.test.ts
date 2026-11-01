import assert from "node:assert/strict";
import { test } from "node:test";
import type { NativeFrameLocator } from "../src/services/nativeFrameContract";
import {
  buildNativeFrameMetricsExport,
  type NativeFrameMetricsSnapshot,
} from "../src/services/nativeFrameMetricsExport";
import { NATIVE_FRAME_PREFETCH_RULE } from "../src/services/nativeFramePrefetch";
import type { NativeFrameSessionMetrics } from "../src/services/nativeFrameSession";
import {
  SYNTHETIC_FIXTURE_INSTANCE_A_UID,
  SYNTHETIC_FIXTURE_SERIES_A_UID,
  SYNTHETIC_FIXTURE_STUDY_UID,
} from "../src/services/nativeFrameFixture";

const locator: NativeFrameLocator = {
  studyInstanceUID: SYNTHETIC_FIXTURE_STUDY_UID,
  seriesInstanceUID: SYNTHETIC_FIXTURE_SERIES_A_UID,
  sopInstanceUID: SYNTHETIC_FIXTURE_INSTANCE_A_UID,
};

function sessionMetrics(): NativeFrameSessionMetrics {
  return {
    mode: "p3",
    modeEpoch: 1,
    acceptedSelections: 1,
    frameBodyRequests: 1,
    demandFrameBodyRequests: 1,
    prefetchFrameBodyRequests: 0,
    metadataRequests: 1,
    pendingFrameRequests: 0,
    errors: 0,
    lastSource: "opfs",
    requestedFrame: 2,
    displayedFrame: 2,
    pendingFrame: null,
    errorFrame: null,
    window: { startFrame: 1, endFrame: 3, behind: 1, ahead: 1, epoch: 1 },
    cache: null,
    prefetch: {
      enabled: false,
      rule: NATIVE_FRAME_PREFETCH_RULE,
      queuedFrames: 0,
      cancelled: false,
      released: false,
    },
    opfs: null,
  };
}

function frameMetrics(): NativeFrameMetricsSnapshot {
  return {
    frameNumber: 2,
    source: "ram",
    opfsSource: "opfs",
    opfsCache: "hit",
    promotedToRam: true,
    nativeCache: "miss",
    selectionToFrameResponseMs: 4,
    selectionToFrameCommittedMs: 5,
  };
}

test("viewer metrics export includes lastSource from the session", () => {
  const payload = buildNativeFrameMetricsExport({
    locator,
    sourceTransferSyntaxUID: null,
    frameMetrics: frameMetrics(),
    sessionMetrics: sessionMetrics(),
    residencyView: null,
  });
  assert.equal(payload.lastSource, "opfs");
  assert.equal(payload.source, "ram");
  assert.equal(payload.opfsSource, "opfs");
  assert.equal(payload.promotedToRam, true);
  const text = JSON.stringify(payload);
  assert.equal(text.includes(SYNTHETIC_FIXTURE_STUDY_UID), false);
  assert.equal(text.includes(SYNTHETIC_FIXTURE_SERIES_A_UID), false);
  assert.equal(text.includes(SYNTHETIC_FIXTURE_INSTANCE_A_UID), false);
});

test("viewer metrics export keeps lastSource when no selection result is present", () => {
  const payload = buildNativeFrameMetricsExport({
    locator,
    sourceTransferSyntaxUID: null,
    frameMetrics: null,
    sessionMetrics: sessionMetrics(),
    residencyView: null,
  });
  assert.equal(payload.lastSource, "opfs");
  assert.equal(payload.source, "opfs");
  assert.equal(payload.opfsSource, null);
});
