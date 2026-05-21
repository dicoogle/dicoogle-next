package org.dicoogle.sdk.storage;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;

/**
 * A storage plugin that supports reading stored DICOM instances.
 *
 * <p>Implementations open an {@link InputStream} over the raw bytes at the given storage URI.
 * Callers are responsible for closing the stream once they are done with it.
 */
public interface ReadableStoragePlugin extends StoragePlugin {

  /**
   * Opens the instance at the given storage URI for reading.
   *
   * <p>The returned stream is unbuffered; callers should wrap it in a
   * {@link java.io.BufferedInputStream} if random or repeated reads are required.
   *
   * @param location the storage URI previously returned by
   *                 {@link WritableStoragePlugin#store} or by an index locator; must use
   *                 the scheme declared by {@link StoragePlugin#scheme()}
   * @return an open {@link InputStream} positioned at the start of the stored data;
   *         never {@code null}
   * @throws IOException if the instance cannot be found or a read error occurs
   */
  InputStream openForRead(URI location) throws IOException;
}
