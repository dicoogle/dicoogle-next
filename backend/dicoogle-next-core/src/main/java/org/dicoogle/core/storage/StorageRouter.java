package org.dicoogle.core.storage;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.dicoogle.core.PluginNotFoundException;
import org.dicoogle.sdk.storage.ListableStoragePlugin;
import org.dicoogle.sdk.storage.ReadableStoragePlugin;
import org.dicoogle.sdk.storage.StoragePlugin;
import org.dicoogle.sdk.storage.WritableStoragePlugin;

/**
 * Central registry for storage provider access.
 *
 * <p>This offers methods to request a storage interface for reading or writing, like the legacy
 * {@code DicooglePlatformInterface.getStorageForSchema(String)}. A URI scheme is used to identify
 * the intended storage plugin.
 *
 * <p>The methods {@code require*} are guaranteed to return a (non-null) storage plugin, throwing an
 * exception of {@link PluginNotFoundException} if a plugin with the requested capabilities could
 * not be fulfilled.
 */
public class StorageRouter {

  private final List<StoragePlugin> plugins;

  public StorageRouter(Collection<StoragePlugin> plugins) {
    this.plugins = List.copyOf(plugins);
  }

  /**
   * Requests a readable storage plugin for the given URI scheme.
   *
   * @param scheme the URI scheme
   * @throws StoragePluginNotFoundException if no storage plugin matching the scheme is available
   */
  public ReadableStoragePlugin requireReadable(String scheme) {
    return plugins.stream()
        .filter(ReadableStoragePlugin.class::isInstance)
        .map(ReadableStoragePlugin.class::cast)
        .filter(plugin -> plugin.scheme().equalsIgnoreCase(scheme))
        .findFirst()
        .orElseThrow(() -> new StoragePluginNotFoundException(scheme));
  }

  /**
   * Requests a listable storage plugin for the given URI scheme.
   *
   * @param scheme the URI scheme
   * @return {@code Optional.empty} if no storage plugin matching the scheme is installed or neither
   *     of them offer directory listing
   */
  public Optional<ListableStoragePlugin> findListable(String scheme) {
    return plugins.stream()
        .filter(ListableStoragePlugin.class::isInstance)
        .map(ListableStoragePlugin.class::cast)
        .filter(plugin -> plugin.scheme().equalsIgnoreCase(scheme))
        .findFirst();
  }

  /**
   * Requests a writable storage plugin for the given URI scheme.
   *
   * @param scheme the URI scheme
   * @throws StoragePluginNotFoundException if no storage plugin matching the scheme is available
   * @throws NoWritableStoragePluginException if none of the matching storage plugins are writable
   */
  public WritableStoragePlugin requireWritable(String scheme) {
    boolean hasReadable =
        plugins.stream().anyMatch(plugin -> plugin.scheme().equalsIgnoreCase(scheme));

    return plugins.stream()
        .filter(WritableStoragePlugin.class::isInstance)
        .map(WritableStoragePlugin.class::cast)
        .filter(plugin -> plugin.scheme().equalsIgnoreCase(scheme))
        .findFirst()
        .orElseThrow(
            () ->
                hasReadable
                    ? new NoWritableStoragePluginException(scheme)
                    : new StoragePluginNotFoundException(scheme));
  }
}
