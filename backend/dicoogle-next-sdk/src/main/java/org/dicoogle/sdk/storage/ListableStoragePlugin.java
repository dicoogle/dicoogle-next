package org.dicoogle.sdk.storage;

import java.io.IOException;
import java.net.URI;
import java.util.List;

/**
 * A storage plugin that supports listing and traversing a hierarchical directory structure.
 *
 * <p>This extension enables query-index plugins to recursively discover stored instances without
 * knowing the underlying filesystem layout. Implementations expose a tree of {@link URI}s rooted at
 * a storage path, allowing deep traversal for bulk indexing or synchronization.
 *
 * <p>Storage backends that are inherently flat (e.g. some object stores) may choose not to
 * implement this interface; in that case the framework falls back to single-file indexing.
 */
public interface ListableStoragePlugin extends ReadableStoragePlugin {

  /**
   * Returns the children of the given directory URI.
   *
   * <p>The returned list is unordered and may be empty if the directory has no children. If the URI
   * does not represent a directory, the result is undefined but should not throw.
   *
   * @param parent the directory URI to list; must use the scheme declared by {@link
   *     StoragePlugin#scheme()}
   * @return an unordered list of child URIs; never {@code null}
   * @throws IOException if a listing error occurs
   */
  List<URI> listChildren(URI parent) throws IOException;

  /**
   * Returns whether the given URI represents a directory (container of other objects).
   *
   * @param location the URI to test; must use the scheme declared by {@link StoragePlugin#scheme()}
   * @return {@code true} if the URI represents a directory, {@code false} otherwise or if unknown
   * @throws IOException if the check fails
   */
  boolean isDirectory(URI location) throws IOException;
}
