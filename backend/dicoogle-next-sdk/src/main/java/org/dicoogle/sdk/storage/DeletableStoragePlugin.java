package org.dicoogle.sdk.storage;

import java.io.IOException;
import java.net.URI;

/**
 * A storage plugin that can permanently delete what it stores.
 *
 * <p>The framework routes a delete to the plugin whose {@link StoragePlugin#scheme()} matches the
 * URI's scheme, so object stores (e.g. Azure Blob, S3) can support removal the same way the
 * filesystem does. Plugins that cannot or must not delete simply do not implement this interface.
 */
public interface DeletableStoragePlugin extends StoragePlugin {

  /**
   * Permanently deletes the object at the given location. If the location is a directory (or a
   * folder-like prefix), everything below it is deleted as well.
   *
   * @param location the URI to delete; must use the scheme declared by {@link
   *     StoragePlugin#scheme()}
   * @return the number of objects deleted; {@code 0} if nothing was there
   * @throws IOException if the location is not handled by this plugin or the deletion fails
   */
  int delete(URI location) throws IOException;
}
