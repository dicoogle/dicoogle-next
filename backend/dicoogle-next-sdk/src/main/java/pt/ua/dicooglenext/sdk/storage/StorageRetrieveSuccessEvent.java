package org.dicoogle.sdk.storage;

import java.net.URI;

public record StorageRetrieveSuccessEvent(
    String studyInstanceUid,
    String seriesInstanceUid,
    String sopInstanceUid,
    String storageScheme,
    URI location,
    long bytesServed) {}
