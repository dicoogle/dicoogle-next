import type { NativeFrameLocator } from "./nativeFrameContract";
import {
  SYNTHETIC_FIXTURE_INSTANCE_A_UID,
  SYNTHETIC_FIXTURE_INSTANCE_B_1_UID,
  SYNTHETIC_FIXTURE_INSTANCE_B_2_UID,
  SYNTHETIC_FIXTURE_INSTANCE_B_3_UID,
  SYNTHETIC_FIXTURE_SERIES_A_UID,
  SYNTHETIC_FIXTURE_SERIES_B_UID,
  SYNTHETIC_FIXTURE_SOURCE_VERSION,
  SYNTHETIC_FIXTURE_STUDY_UID,
} from "./nativeFrameFixture";

export interface NativeFrameFixtureDigestEntry {
  readonly studyInstanceUID: string;
  readonly seriesInstanceUID: string;
  readonly sopInstanceUID: string;
  readonly frameNumber: number;
  readonly sourceVersion: typeof SYNTHETIC_FIXTURE_SOURCE_VERSION;
  readonly sha256: string;
}

const MULTIFRAME_DIGESTS = [
  "1a1b348ccf3aa87d4951fd611b25afd90169723d9b557b5530e2c4faf770837a",
  "02e9789437b639403179e4f4b41fa940bccd2ee841ee4985945b607bd82854c1",
  "df2eba81cc1bc60614904aa1ae225e210cf7f620a1c57f54ed39fd0fcd174958",
  "627fca74dc79db994c75796a3749b0e377e2c536e074dc3e1d09984d5ae57f64",
  "043963cf9832185f459196163d4b31318e7a7777a5625568e3c32dec858d406f",
  "f0ccfddff49d0ad0f78c43e9011248e86a1b9efa7a36abe932f4ec15a4625bea",
  "ef5b4a7e8773312e237466931374011c1063d2c6de2f89b8eeaa79ccfb2dd09b",
  "ef167c38d449b70017ca4407132795e826213bb1d5210c1717c85d35ba2e06bf",
] as const;

const COMPANION_DIGESTS = [
  "94ba5d80b590e465adfbdb756ace2e89ffa3acb21613698a07b69349d98038f6",
  "45e2735d9fb4b3eb4b5980a2893b3f5a93d2873f5b8e387b6f3103f873d04c99",
  "0d9d7b3a16d36b66c6aea33b92814020c32917d8104dc93ea2399056aa0a1772",
] as const;

function entry(
  seriesInstanceUID: string,
  sopInstanceUID: string,
  frameNumber: number,
  sha256: string,
): NativeFrameFixtureDigestEntry {
  return Object.freeze({
    studyInstanceUID: SYNTHETIC_FIXTURE_STUDY_UID,
    seriesInstanceUID,
    sopInstanceUID,
    frameNumber,
    sourceVersion: SYNTHETIC_FIXTURE_SOURCE_VERSION,
    sha256,
  });
}

export const NATIVE_FRAME_FIXTURE_DIGESTS: readonly NativeFrameFixtureDigestEntry[] =
  Object.freeze([
    ...MULTIFRAME_DIGESTS.map((digest, index) =>
      entry(
        SYNTHETIC_FIXTURE_SERIES_A_UID,
        SYNTHETIC_FIXTURE_INSTANCE_A_UID,
        index + 1,
        digest,
      ),
    ),
    entry(
      SYNTHETIC_FIXTURE_SERIES_B_UID,
      SYNTHETIC_FIXTURE_INSTANCE_B_1_UID,
      1,
      COMPANION_DIGESTS[0],
    ),
    entry(
      SYNTHETIC_FIXTURE_SERIES_B_UID,
      SYNTHETIC_FIXTURE_INSTANCE_B_2_UID,
      1,
      COMPANION_DIGESTS[1],
    ),
    entry(
      SYNTHETIC_FIXTURE_SERIES_B_UID,
      SYNTHETIC_FIXTURE_INSTANCE_B_3_UID,
      1,
      COMPANION_DIGESTS[2],
    ),
  ]);

const DIGEST_INDEX = new Map(
  NATIVE_FRAME_FIXTURE_DIGESTS.map((item) => [fixtureKey(item), item.sha256]),
);

export function getNativeFrameFixtureDigest(
  locator: NativeFrameLocator,
  frameNumber: number,
): string | null {
  if (
    !locator ||
    typeof locator !== "object" ||
    !Number.isSafeInteger(frameNumber) ||
    frameNumber < 1
  ) {
    return null;
  }
  const { studyInstanceUID, seriesInstanceUID, sopInstanceUID } = locator;
  if (
    typeof studyInstanceUID !== "string" ||
    typeof seriesInstanceUID !== "string" ||
    typeof sopInstanceUID !== "string"
  ) {
    return null;
  }
  return (
    DIGEST_INDEX.get(
      fixtureKey({
        studyInstanceUID,
        seriesInstanceUID,
        sopInstanceUID,
        frameNumber,
      }),
    ) ?? null
  );
}

function fixtureKey(value: {
  readonly studyInstanceUID: string;
  readonly seriesInstanceUID: string;
  readonly sopInstanceUID: string;
  readonly frameNumber: number;
}): string {
  return [
    SYNTHETIC_FIXTURE_SOURCE_VERSION,
    value.studyInstanceUID,
    value.seriesInstanceUID,
    value.sopInstanceUID,
    String(value.frameNumber),
  ].join("\u0000");
}
