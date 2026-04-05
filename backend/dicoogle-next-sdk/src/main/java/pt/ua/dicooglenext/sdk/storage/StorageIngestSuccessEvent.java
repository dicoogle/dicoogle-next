package pt.ua.dicooglenext.sdk.storage;

import java.net.URI;

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
