package pt.ua.dicooglenext.sdk.storage;

public record StorageIngestFailureEvent(
    String callingAet,
    String calledAet,
    String storageScheme,
    String studyInstanceUid,
    String seriesInstanceUid,
    String sopInstanceUid,
    String sopClassUid,
    int dimseStatus,
    String reason) {}
