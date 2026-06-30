package org.dicoogle.sdk.storage;

import java.net.URI;

/**
 * Describes a DICOM instance that has been successfully persisted by a {@link
 * WritableStoragePlugin}.
 *
 * @param location the storage URI at which the object can later be retrieved via {@link
 *     ReadableStoragePlugin#openForRead(URI)}; never {@code null}
 * @param contentLength the number of bytes written, or {@code -1} if the length is unknown
 * @param contentType the MIME type of the stored data (e.g. {@code "application/dicom"}); may be
 *     {@code null} if the backend does not track content type
 */
public record StoredObject(URI location, long contentLength, String contentType) {}
