package org.dicoogle.sdk.storage;

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
