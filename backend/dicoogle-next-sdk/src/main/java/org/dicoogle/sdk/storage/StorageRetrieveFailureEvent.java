package org.dicoogle.sdk.storage;

public record StorageRetrieveFailureEvent(
    String studyInstanceUid,
    String seriesInstanceUid,
    String sopInstanceUid,
    String storageScheme,
    int httpStatus,
    String reason) {}
