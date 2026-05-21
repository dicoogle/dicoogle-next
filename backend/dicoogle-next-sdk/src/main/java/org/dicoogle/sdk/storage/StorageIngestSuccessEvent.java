package org.dicoogle.sdk.storage;

import java.net.URI;

/**
 * Describes a DICOM instance that has been successfully stored via C-STORE (or equivalent).
 *
 * <p>This event is delivered to all registered {@link
 * org.dicoogle.sdk.query.StorageIngestEventListener} plugins after the storage backend confirms a
 * successful write. The included DICOM hierarchy identifiers and storage URI are sufficient for an
 * index plugin to record the mapping without re-reading the file.
 *
 * @param associationSerialNo a monotonically increasing identifier for the DIMSE association on
 *     which the C-STORE was received; zero for non-DIMSE ingests
 * @param callingAet the AE title of the SCU that sent the instance
 * @param calledAet the AE title of the SCP that received it
 * @param storageScheme the URI scheme of the backend that stored the instance (e.g. {@code "file"},
 *     {@code "s3"})
 * @param patientId the value of Patient ID (0010,0020) from the stored dataset
 * @param studyInstanceUid the Study Instance UID (0020,000D)
 * @param seriesInstanceUid the Series Instance UID (0020,000E)
 * @param sopInstanceUid the SOP Instance UID (0008,0018)
 * @param sopClassUid the SOP Class UID (0008,0016)
 * @param location the storage URI at which the instance can be retrieved
 */
public record StorageIngestSuccessEvent(
    int associationSerialNo,
    String callingAet,
    String calledAet,
    String storageScheme,
    String patientId,
    String studyInstanceUid,
    String seriesInstanceUid,
    String sopInstanceUid,
    String sopClassUid,
    URI location) {}
