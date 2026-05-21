package org.dicoogle.sdk.query;

/**
 * The DICOM Query/Retrieve hierarchy level at which a query or move operation is scoped.
 *
 * <p>Corresponds to the {@code QueryRetrieveLevel} (0008,0052) attribute defined in PS 3.4 C.3.3 /
 * C.4.1.
 *
 * <ul>
 *   <li>{@link #STUDY} — results are aggregated at the study level; one result per matching study.
 *   <li>{@link #SERIES} — results are aggregated at the series level within a study.
 *   <li>{@link #IMAGE} — results are at the individual SOP instance (image) level.
 * </ul>
 */
public enum QueryRetrieveLevel {
  /** One result per matching study. */
  STUDY,
  /** One result per matching series within a study. */
  SERIES,
  /** One result per matching SOP instance (image). */
  IMAGE
}
