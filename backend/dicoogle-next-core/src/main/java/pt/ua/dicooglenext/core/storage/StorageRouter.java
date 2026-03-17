package pt.ua.dicooglenext.core.storage;

import java.util.Collection;
import java.util.List;
import pt.ua.dicooglenext.sdk.storage.StoragePlugin;

public class StorageRouter {

  private final List<StoragePlugin> plugins;

  public StorageRouter(Collection<StoragePlugin> plugins) {
    this.plugins = List.copyOf(plugins);
  }

  public StoragePlugin requireReadable(String scheme) {
    return plugins.stream()
        .filter(plugin -> plugin.canRead() && plugin.scheme().equalsIgnoreCase(scheme))
        .findFirst()
        .orElseThrow(() -> new StoragePluginNotFoundException(scheme));
  }

  public StoragePlugin requireWritable(String scheme) {
    boolean hasReadable =
        plugins.stream().anyMatch(plugin -> plugin.scheme().equalsIgnoreCase(scheme));

    return plugins.stream()
        .filter(plugin -> plugin.canWrite() && plugin.scheme().equalsIgnoreCase(scheme))
        .findFirst()
        .orElseThrow(
            () ->
                hasReadable
                    ? new NoWritableStoragePluginException(scheme)
                    : new StoragePluginNotFoundException(scheme));
  }
}
