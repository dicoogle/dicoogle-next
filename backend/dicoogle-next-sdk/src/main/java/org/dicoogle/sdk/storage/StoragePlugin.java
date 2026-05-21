package org.dicoogle.sdk.storage;

import org.dicoogle.sdk.DicooglePlugin;

/**
 * Base interface for all storage plugins.
 *
 * <p>Storage plugins are responsible for persisting and retrieving DICOM instances. A plugin
 * declares the URI scheme it handles via {@link #scheme()}; the framework uses this to route
 * storage and retrieval operations to the correct backend.
 *
 * <p>Depending on their capabilities, storage plugins implement one or both of the following
 * sub-interfaces:
 *
 * <ul>
 *   <li>{@link ReadableStoragePlugin} — can open stored instances for reading.
 *   <li>{@link WritableStoragePlugin} — can accept and persist new instances.
 * </ul>
 */
public interface StoragePlugin extends DicooglePlugin {

  /**
   * Returns the URI scheme handled by this storage backend (e.g. {@code "file"}, {@code "s3"}).
   *
   * <p>The framework uses this value to match URIs returned from {@link
   * WritableStoragePlugin#store} back to the plugin that can read them.
   *
   * @return the URI scheme; never {@code null} or blank
   */
  String scheme();
}
