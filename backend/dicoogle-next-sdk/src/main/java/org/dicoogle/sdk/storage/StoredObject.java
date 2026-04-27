package org.dicoogle.sdk.storage;

import java.net.URI;

public record StoredObject(URI location, long contentLength, String contentType) {}
