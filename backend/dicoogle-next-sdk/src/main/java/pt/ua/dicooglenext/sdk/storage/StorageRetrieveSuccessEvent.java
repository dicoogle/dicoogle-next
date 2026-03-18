package pt.ua.dicooglenext.sdk.storage;

import java.net.URI;

public record StorageRetrieveSuccessEvent(
    String studyInstanceUid,
    String seriesInstanceUid,
    String sopInstanceUid,
    String storageScheme,
    URI location,
    long bytesServed) {}
