package org.dicoogle.sdk.storage;

/**
 * Describes a C-STORE (or equivalent) operation that failed before or during storage.
 *
 * <p>This event is delivered to all registered {@link org.dicoogle.sdk.query.StorageIngestEventListener}
 * plugins when a storage write could not be completed. The DICOM hierarchy identifiers included in
 * this event reflect whatever information was available at the point of failure; some fields may be
 * empty if the failure occurred early in processing.
 *
 * @param associationSerialNo a monotonically increasing identifier for the DIMSE association
 * @param callingAet          the AE title of the SCU that sent the instance
 * @param calledAet           the AE title of the SCP that received it
 * @param storageScheme       the URI scheme of the backend that was attempted
 * @param studyInstanceUid    the Study Instance UID (0020,000D), if available
 * @param seriesInstanceUid   the Series Instance UID (0020,000E), if available
 * @param sopInstanceUid      the SOP Instance UID (0008,0018), if available
 * @param sopClassUid         the SOP Class UID (0008,0016), if available
 * @param dimseStatus         the DIMSE status code returned (e.g. {@code 0xA700} for out-of-resources)
 * @param reason              a human-readable description of the failure cause
 */
public record StorageIngestFailureEvent(
    int associationSerialNo,
    String callingAet,
    String calledAet,
    String storageScheme,
    String studyInstanceUid,
    String seriesInstanceUid,
    String sopInstanceUid,
    String sopClassUid,
    int dimseStatus,
    String reason) {}
