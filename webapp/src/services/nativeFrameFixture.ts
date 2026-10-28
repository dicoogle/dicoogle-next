import type { NativeFrameLocator } from "./nativeFrameContract";

export const SYNTHETIC_FIXTURE_SOURCE_VERSION = "synthetic-study-v1";
export const SYNTHETIC_FIXTURE_STUDY_UID = "1.2.826.0.1.3680043.2.1125.100.1";
export const SYNTHETIC_FIXTURE_SERIES_A_UID =
  "1.2.826.0.1.3680043.2.1125.100.1.1";
export const SYNTHETIC_FIXTURE_INSTANCE_A_UID =
  "1.2.826.0.1.3680043.2.1125.100.1.1.1";
export const SYNTHETIC_FIXTURE_SERIES_B_UID =
  "1.2.826.0.1.3680043.2.1125.100.1.2";
export const SYNTHETIC_FIXTURE_INSTANCE_B_1_UID =
  "1.2.826.0.1.3680043.2.1125.100.1.2.1";
export const SYNTHETIC_FIXTURE_INSTANCE_B_2_UID =
  "1.2.826.0.1.3680043.2.1125.100.1.2.2";
export const SYNTHETIC_FIXTURE_INSTANCE_B_3_UID =
  "1.2.826.0.1.3680043.2.1125.100.1.2.3";

const FIXTURE_INSTANCES = new Set([
  fixtureIdentity(
    SYNTHETIC_FIXTURE_STUDY_UID,
    SYNTHETIC_FIXTURE_SERIES_A_UID,
    SYNTHETIC_FIXTURE_INSTANCE_A_UID,
  ),
  fixtureIdentity(
    SYNTHETIC_FIXTURE_STUDY_UID,
    SYNTHETIC_FIXTURE_SERIES_B_UID,
    SYNTHETIC_FIXTURE_INSTANCE_B_1_UID,
  ),
  fixtureIdentity(
    SYNTHETIC_FIXTURE_STUDY_UID,
    SYNTHETIC_FIXTURE_SERIES_B_UID,
    SYNTHETIC_FIXTURE_INSTANCE_B_2_UID,
  ),
  fixtureIdentity(
    SYNTHETIC_FIXTURE_STUDY_UID,
    SYNTHETIC_FIXTURE_SERIES_B_UID,
    SYNTHETIC_FIXTURE_INSTANCE_B_3_UID,
  ),
]);

export function resolveNativeFrameSourceVersion(
  locator: NativeFrameLocator,
): string | null {
  if (!locator || typeof locator !== "object") {
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
  return FIXTURE_INSTANCES.has(
    fixtureIdentity(studyInstanceUID, seriesInstanceUID, sopInstanceUID),
  )
    ? SYNTHETIC_FIXTURE_SOURCE_VERSION
    : null;
}

function fixtureIdentity(
  studyInstanceUID: string,
  seriesInstanceUID: string,
  sopInstanceUID: string,
): string {
  return `${studyInstanceUID}\u0000${seriesInstanceUID}\u0000${sopInstanceUID}`;
}
