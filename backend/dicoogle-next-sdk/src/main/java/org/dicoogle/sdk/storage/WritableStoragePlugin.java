package org.dicoogle.sdk.storage;

import java.io.IOException;
import java.io.InputStream;

/**
 * A storage plugin that supports persisting new DICOM instances.
 *
 * <p>Implementations consume a raw byte stream and return a {@link StoredObject} descriptor that
 * includes the storage URI assigned to the new instance. That URI can subsequently be passed to
 * {@link ReadableStoragePlugin#openForRead} to retrieve the same data.
 */
public interface WritableStoragePlugin extends StoragePlugin {

  /**
   * Stores the given data stream and returns a descriptor for the newly created object.
   *
   * <p>The implementation is responsible for reading the stream to completion and persisting its
   * contents. The caller must not reuse or close the stream after this method returns.
   *
   * @param data an {@link InputStream} containing the raw bytes to persist; must not be {@code
   *     null}
   * @param contentType the MIME type of the data (e.g. {@code "application/dicom"}); may be {@code
   *     null} if unknown, in which case implementations should default to {@code
   *     "application/octet-stream"}
   * @return a {@link StoredObject} describing the persisted object, including its URI; never {@code
   *     null}
   * @throws IOException if the data cannot be persisted
   */
  StoredObject store(InputStream data, String contentType) throws IOException;
}
