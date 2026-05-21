package org.dicoogle.sdk.storage;

import java.net.URI;

/**
 * Describes a DICOM instance that has been successfully retrieved and streamed to a client.
 *
 * <p>This event is published after a C-MOVE sub-operation (or DICOMWeb WADO-RS transfer) has
 * completed successfully. Listeners may use it for audit logging, transfer metrics, or usage-based
 * accounting.
 *
 * @param studyInstanceUid the Study Instance UID (0020,000D) of the retrieved instance
 * @param seriesInstanceUid the Series Instance UID (0020,000E)
 * @param sopInstanceUid the SOP Instance UID (0008,0018)
 * @param storageScheme the URI scheme of the backend from which the instance was read
 * @param location the storage URI that was opened for retrieval
 * @param bytesServed the total number of bytes transferred to the client
 */
public record StorageRetrieveSuccessEvent(
    String studyInstanceUid,
    String seriesInstanceUid,
    String sopInstanceUid,
    String storageScheme,
    URI location,
    long bytesServed) {}
