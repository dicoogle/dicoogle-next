package org.dicoogle.sdk.storage;

/**
 * Describes a retrieval attempt that failed before the instance could be fully transferred.
 *
 * <p>This event is published when a C-MOVE sub-operation (or DICOMWeb WADO-RS transfer) cannot be
 * completed. The HTTP status code field follows the DICOMWeb convention even for DIMSE retrievals,
 * where it is mapped from the DIMSE status code by the protocol layer.
 *
 * @param studyInstanceUid the Study Instance UID (0020,000D), if available
 * @param seriesInstanceUid the Series Instance UID (0020,000E), if available
 * @param sopInstanceUid the SOP Instance UID (0008,0018), if available
 * @param storageScheme the URI scheme of the backend that was attempted
 * @param httpStatus the HTTP-equivalent status code (e.g. {@code 404} for not found, {@code 500}
 *     for internal error)
 * @param reason a human-readable description of the failure cause
 */
public record StorageRetrieveFailureEvent(
    String studyInstanceUid,
    String seriesInstanceUid,
    String sopInstanceUid,
    String storageScheme,
    int httpStatus,
    String reason) {}
