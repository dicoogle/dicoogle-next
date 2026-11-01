import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import {
  NativeFrameP3Status,
  type NativeFrameP3StatusProps,
} from "../src/features/search/components/NativeFrameP3Status";
import type { NativeFrameP3Metrics } from "../src/services/nativeFrameSession";

function metrics(
  overrides: Partial<NativeFrameP3Metrics> = {},
): NativeFrameP3Metrics {
  return {
    status: "enabled",
    source: "opfs",
    cache: "hit",
    promotedToRam: true,
    entries: 2,
    committedNativeBytes: 16384,
    committedFileBytes: 16544,
    pendingWrites: 0,
    pendingDeletes: 0,
    rootFileBytes: 16600,
    deletedBytes: 0,
    errors: { "publication-busy": 2 },
    storageError: null,
    frames: [1, 2],
    pendingWriteFrames: [],
    pendingDeleteFrames: [],
    errorFrames: [],
    ineligibleFrames: [],
    readingFrame: null,
    networkPendingFrame: null,
    ramWindow: { startFrame: 1, endFrame: 2 },
    opfsWindow: { startFrame: 1, endFrame: 4 },
    ...overrides,
  };
}

function render(overrides: Partial<NativeFrameP3StatusProps> = {}): string {
  return renderToStaticMarkup(
    React.createElement(NativeFrameP3Status, {
      metrics: metrics(),
      busy: false,
      onRetry: () => undefined,
      onRetryCleanup: () => undefined,
      ...overrides,
    }),
  );
}

test("P3 status always carries the plaintext synthetic warning", () => {
  const markup = render();
  assert.match(markup, /Plaintext OPFS/);
  assert.match(markup, /synthetic/i);
  assert.match(markup, /not encrypted/i);
  assert.doesNotMatch(markup, /shield/i);
  assert.doesNotMatch(markup, /<svg/i);
});

test("P3 status shows source, promotion, publication-busy and storage counters", () => {
  const markup = render();
  assert.match(markup, /source opfs/);
  assert.match(markup, /RAM promotion yes/);
  assert.match(markup, /publication busy 2/);
  assert.match(markup, /committed entries 2/);
  assert.match(markup, /pending writes 0/);
  assert.match(markup, /pending deletes 0/);
});

test("degraded P3 marks the disk tier unavailable and exposes retry", () => {
  const markup = render({
    metrics: metrics({
      status: "degraded",
      source: null,
      cache: "not-applicable",
      promotedToRam: false,
      entries: 0,
      storageError: "move-unavailable",
    }),
    busy: true,
  });
  assert.match(markup, /degraded/i);
  assert.match(markup, /RAM-only/);
  assert.match(markup, /unavailable\/unknown/);
  assert.match(markup, /Retry P3 storage/);
  assert.match(markup, /disabled/);
  assert.match(markup, /Move-unavailable/i);
});

test("cleanup-required P3 exposes cleanup retry and no false residency", () => {
  const markup = render({
    metrics: metrics({
      status: "cleanup-required",
      storageError: "write-in-flight",
      entries: 0,
    }),
  });
  assert.match(markup, /cleanup pending/i);
  assert.match(markup, /unavailable\/unknown/);
  assert.match(markup, /Plaintext frames may still be present on disk/);
  assert.match(markup, /until the retry succeeds/);
  assert.match(markup, /Retry cleanup/);
  assert.match(markup, /write-in-flight/);
});
