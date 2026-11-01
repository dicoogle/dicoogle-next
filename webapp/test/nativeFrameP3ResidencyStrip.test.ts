import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import {
  NativeFrameP3ResidencyStrip,
  type NativeFrameP3ResidencyStripProps,
} from "../src/features/search/components/NativeFrameP3ResidencyStrip";
import { NATIVE_FRAME_PREFETCH_RULE } from "../src/services/nativeFramePrefetch";
import type {
  NativeFrameP3Metrics,
  NativeFrameSessionCacheMetrics,
  NativeFrameSessionMetrics,
} from "../src/services/nativeFrameSession";
import {
  buildNativeFrameResidencyView,
  reduceNativeFrameResidency,
  type NativeFrameResidencyView,
} from "../src/services/nativeFrameResidency";

interface SnapshotOptions {
  readonly mode?: NativeFrameSessionMetrics["mode"];
  readonly cacheFrames?: readonly number[];
  readonly opfs?: Partial<NativeFrameP3Metrics> | null;
}

function cache(frames: readonly number[]): NativeFrameSessionCacheMetrics {
  return {
    cacheId: "synthetic-cache",
    revision: 1,
    eventSequence: 0,
    oldestEventSequence: null,
    droppedEventCount: 0,
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0,
    bypasses: 0,
    entryCount: frames.length,
    retainedNativeBytes: frames.length * 8192,
    frames,
    limits: {
      maxTotalNativeBytes: 32 * 1024,
      maxEntryNativeBytes: 8 * 1024,
      maxEntries: 5,
      maxEventCount: 64,
    },
  };
}

function opfsMetrics(
  overrides: Partial<NativeFrameP3Metrics> = {},
): NativeFrameP3Metrics {
  return {
    status: "enabled",
    source: "opfs",
    cache: "hit",
    promotedToRam: true,
    entries: 1,
    committedNativeBytes: 8192,
    committedFileBytes: 8272,
    pendingWrites: 0,
    pendingDeletes: 0,
    rootFileBytes: 8272,
    deletedBytes: 0,
    errors: {},
    storageError: null,
    frames: [1],
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

function snapshot(options: SnapshotOptions = {}): NativeFrameSessionMetrics {
  return {
    mode: options.mode ?? "p3",
    modeEpoch: 1,
    acceptedSelections: 1,
    frameBodyRequests: 1,
    demandFrameBodyRequests: 1,
    prefetchFrameBodyRequests: 0,
    metadataRequests: 1,
    pendingFrameRequests: 0,
    errors: 0,
    lastSource: "opfs",
    requestedFrame: 1,
    displayedFrame: 1,
    pendingFrame: null,
    errorFrame: null,
    window: { startFrame: 1, endFrame: 2, behind: 1, ahead: 1, epoch: 1 },
    cache: cache(options.cacheFrames ?? [1]),
    prefetch: {
      enabled: false,
      rule: NATIVE_FRAME_PREFETCH_RULE,
      queuedFrames: 0,
      cancelled: false,
      released: false,
    },
    opfs: options.opfs === null ? null : opfsMetrics(options.opfs),
  };
}

function makeView(options: SnapshotOptions = {}): NativeFrameResidencyView {
  const state = reduceNativeFrameResidency(
    null,
    snapshot(options),
    null,
  );
  return buildNativeFrameResidencyView(state, 8);
}

function render(
  view: NativeFrameResidencyView,
  overrides: Partial<NativeFrameP3ResidencyStripProps> = {},
): string {
  return renderToStaticMarkup(
    React.createElement(NativeFrameP3ResidencyStrip, {
      view,
      busy: false,
      onClearRam: () => undefined,
      onClearOpfs: () => undefined,
      onClearBoth: () => undefined,
      notice: null,
      error: null,
      ...overrides,
    }),
  );
}

function tileMarkup(markup: string, frameNumber: number): string {
  const match = markup.match(
    new RegExp(
      `<li[^>]*data-frame="${frameNumber}"[^>]*>[\\s\\S]*?</li>`,
    ),
  );
  assert.ok(match, `tile ${frameNumber}`);
  return match[0];
}

function tilesMarkup(markup: string): string {
  const match = markup.match(
    /<ul[^>]*aria-label="P3 residency tiles"[^>]*>[\s\S]*?<\/ul>/,
  );
  assert.ok(match, "tiles list");
  return match[0];
}

function buttonMarkup(markup: string, label: string): string {
  const match = markup.match(
    new RegExp(`<button[^>]*>${label}</button>`),
  );
  assert.ok(match, `${label} button`);
  return match[0];
}

test("P3 strip paints purple and BOTH from committed frames with independent badges", () => {
  const view = makeView({
    cacheFrames: [1],
    opfs: {
      frames: [1],
      pendingWriteFrames: [2],
      pendingDeleteFrames: [3],
      errorFrames: [4],
      ineligibleFrames: [5],
      readingFrame: 2,
      networkPendingFrame: 3,
    },
  });
  const markup = render(view);
  const frame1 = tileMarkup(markup, 1);
  assert.match(frame1, /data-residency="both"/);
  assert.match(frame1, /from-blue-700/);
  assert.match(frame1, /to-purple-700/);

  const frame2 = tileMarkup(markup, 2);
  assert.match(frame2, /data-residency="absent"/);
  assert.match(frame2, /data-pending-write="true"/);
  assert.doesNotMatch(frame2, /bg-purple-700|from-blue-700 to-purple-700/);
  assert.match(frame2, />S</);

  const frame3 = tileMarkup(markup, 3);
  assert.match(frame3, /data-pending-delete="true"/);
  assert.match(frame3, />X</);

  const frame4 = tileMarkup(markup, 4);
  assert.match(frame4, /data-error="true"/);
  assert.match(frame4, /ring-red-400/);

  const frame5 = tileMarkup(markup, 5);
  assert.match(frame5, /Ineligible/);

  assert.match(frame2, /OPFS read/);
  assert.match(frame3, /Network/);
  assert.match(frame1, />Wr</);
  assert.match(frame1, />Wo</);
  assert.match(frame1, />R</);
  assert.match(frame1, />D</);

  assert.match(markup, /OPFS committed \(purple\)/);
  assert.match(markup, /BOTH committed \(split blue\/purple\)/);
  assert.match(markup, /Pending write \(S\)/);
  assert.match(markup, /Pending delete \(X\)/);
  assert.match(markup, /Storage error \(red\)/);
  assert.match(markup, /RAM window \(Wr\)/);
  assert.match(markup, /OPFS window \(Wo\)/);
});

test("degraded and cleanup-required render the disk tier hatched and unavailable", () => {
  for (const status of ["degraded", "cleanup-required"] as const) {
    const view = makeView({
      cacheFrames: [1],
      opfs: {
        status,
        frames: [1],
        storageError: "move-unavailable",
      },
    });
    const markup = render(view);
    assert.match(markup, /data-opfs-state="unavailable"/);
    assert.match(markup, /unavailable\/unknown \(hatched\)/);
    assert.match(markup, /repeating-linear-gradient/);
    assert.match(markup, /OPFS unavailable\/unknown \(hatched\)/);
    assert.match(markup, /BOTH unavailable\/unknown \(hatched\)/);
    assert.doesNotMatch(tilesMarkup(markup), /bg-purple-700/);
    assert.doesNotMatch(tilesMarkup(markup), /from-blue-700 to-purple-700/);
    assert.match(tileMarkup(markup, 1), /data-residency="ram"/);
    assert.match(tileMarkup(markup, 1), /data-opfs-tier="unavailable"/);
    assert.match(tileMarkup(markup, 1), /repeating-linear-gradient/);
  }
});

test("Clear OPFS is disabled when busy or the disk tier is unavailable", () => {
  const enabled = makeView();
  let markup = render(enabled);
  assert.doesNotMatch(buttonMarkup(markup, "Clear OPFS"), /disabled=""/);
  assert.doesNotMatch(buttonMarkup(markup, "Clear Both"), /disabled=""/);

  markup = render(enabled, { busy: true });
  assert.match(buttonMarkup(markup, "Clear OPFS"), /disabled=""/);
  assert.match(buttonMarkup(markup, "Clear Both"), /disabled=""/);

  const degraded = makeView({
    opfs: { status: "degraded", frames: [], storageError: "move-unavailable" },
  });
  markup = render(degraded);
  assert.match(buttonMarkup(markup, "Clear OPFS"), /disabled=""/);
  assert.doesNotMatch(buttonMarkup(markup, "Clear Both"), /disabled=""/);

  const cleanup = makeView({
    opfs: { status: "cleanup-required", frames: [], storageError: "write-in-flight" },
  });
  markup = render(cleanup);
  assert.match(buttonMarkup(markup, "Clear OPFS"), /disabled=""/);
  assert.match(buttonMarkup(markup, "Clear Both"), /disabled=""/);
});

test("P3 Clear RAM is present and disabled only by busy or cleanup-required", () => {
  const enabled = makeView();
  let markup = render(enabled);
  assert.match(markup, /Clear RAM/);
  assert.doesNotMatch(buttonMarkup(markup, "Clear RAM"), /disabled=""/);
  assert.doesNotMatch(buttonMarkup(markup, "Clear OPFS"), /disabled=""/);

  markup = render(enabled, { busy: true });
  assert.match(buttonMarkup(markup, "Clear RAM"), /disabled=""/);

  const cleanup = makeView({
    opfs: {
      status: "cleanup-required",
      frames: [],
      storageError: "write-in-flight",
    },
  });
  markup = render(cleanup);
  assert.match(buttonMarkup(markup, "Clear RAM"), /disabled=""/);

  const degraded = makeView({
    opfs: { status: "degraded", frames: [], storageError: "move-unavailable" },
  });
  markup = render(degraded);
  assert.doesNotMatch(buttonMarkup(markup, "Clear RAM"), /disabled=""/);
});

test("P3 strip reports notice and partial state without claiming deletion", () => {
  const view = makeView();
  const partial = render(view, {
    notice:
      "Partial: RAM cleared; OPFS cleanup did not complete (delete-failed). Deletion not confirmed.",
  });
  assert.match(partial, /Partial: RAM cleared/);
  assert.match(partial, /Deletion not confirmed/);
  assert.match(partial, /text-amber-300/);

  const failure = render(view, {
    error: "OPFS cleanup failed (delete-failed); deletion not confirmed.",
  });
  assert.match(failure, /OPFS cleanup failed/);
  assert.match(failure, /role="alert"/);
});

test("P3 strip markup carries no aliases, UIDs, keys, or payloads", () => {
  const markup = render(
    makeView({
      cacheFrames: [1],
      opfs: {
        frames: [1],
        pendingWriteFrames: [2],
        pendingDeleteFrames: [3],
      },
    }),
  );
  assert.equal(markup.includes("alias-"), false);
  assert.equal(markup.includes("synthetic-cache"), false);
  assert.equal(markup.includes("study"), false);
  assert.equal(markup.includes("payload"), false);
});
