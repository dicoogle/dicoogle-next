import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  NATIVE_FRAME_FIXTURE_DIGESTS,
  getNativeFrameFixtureDigest,
} from "../src/services/nativeFrameFixtureDigests";
import {
  SYNTHETIC_FIXTURE_INSTANCE_A_UID,
  SYNTHETIC_FIXTURE_SERIES_A_UID,
  SYNTHETIC_FIXTURE_STUDY_UID,
} from "../src/services/nativeFrameFixture";

const MANIFEST = "../backend/dicoogle-next/target/synthetic-dicom-fixtures/synthetic-study-v1/manifest.json";

test("fixture digest table has the accepted 11 unique frames", () => {
  assert.equal(NATIVE_FRAME_FIXTURE_DIGESTS.length, 11);
  const keys = new Set<string>();
  for (const entry of NATIVE_FRAME_FIXTURE_DIGESTS) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    const key = [
      entry.studyInstanceUID,
      entry.seriesInstanceUID,
      entry.sopInstanceUID,
      entry.frameNumber,
    ].join("|");
    assert.equal(keys.has(key), false, `duplicate fixture key ${key}`);
    keys.add(key);
  }
});

test("fixture digest lookup returns the table value only for fixture frames", () => {
  const locator = {
    studyInstanceUID: SYNTHETIC_FIXTURE_STUDY_UID,
    seriesInstanceUID: SYNTHETIC_FIXTURE_SERIES_A_UID,
    sopInstanceUID: SYNTHETIC_FIXTURE_INSTANCE_A_UID,
  };
  assert.equal(
    getNativeFrameFixtureDigest(locator, 1),
    NATIVE_FRAME_FIXTURE_DIGESTS[0].sha256,
  );
  assert.equal(getNativeFrameFixtureDigest(locator, 9), null);
  assert.equal(
    getNativeFrameFixtureDigest(
      { ...locator, sopInstanceUID: "1.2.3.4.5" },
      1,
    ),
    null,
  );
});

test("fixture digest table matches the generated manifest", (t) => {
  if (!existsSync(MANIFEST)) {
    t.skip("not run: generated synthetic manifest is absent");
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
    series: Array<{
      instances: Array<{
        sopInstanceUID: string;
        frameSha256: string[];
      }>;
      seriesInstanceUID: string;
    }>;
    studyInstanceUID: string;
  };
  const expected = new Map<string, string>();
  for (const series of manifest.series) {
    for (const instance of series.instances) {
      instance.frameSha256.forEach((digest, index) => {
        expected.set(
          [
            manifest.studyInstanceUID,
            series.seriesInstanceUID,
            instance.sopInstanceUID,
            index + 1,
          ].join("|"),
          digest,
        );
      });
    }
  }
  assert.equal(expected.size, 11);
  const actual = new Map(
    NATIVE_FRAME_FIXTURE_DIGESTS.map((entry) => [
      [
        entry.studyInstanceUID,
        entry.seriesInstanceUID,
        entry.sopInstanceUID,
        entry.frameNumber,
      ].join("|"),
      entry.sha256,
    ]),
  );
  assert.deepEqual(actual, expected);
});
