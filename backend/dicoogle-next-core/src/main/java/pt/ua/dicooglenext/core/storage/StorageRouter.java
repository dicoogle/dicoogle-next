package pt.ua.dicooglenext.core.storage;

import java.util.Collection;
import java.util.List;
import pt.ua.dicooglenext.sdk.storage.ReadableStoragePlugin;
import pt.ua.dicooglenext.sdk.storage.StoragePlugin;
import pt.ua.dicooglenext.sdk.storage.WritableStoragePlugin;

public class StorageRouter {

  private final List<StoragePlugin> plugins;

  public StorageRouter(Collection<StoragePlugin> plugins) {
    this.plugins = List.copyOf(plugins);
  }

  public ReadableStoragePlugin requireReadable(String scheme) {
    return plugins.stream()
        .filter(ReadableStoragePlugin.class::isInstance)
        .map(ReadableStoragePlugin.class::cast)
        .filter(plugin -> plugin.scheme().equalsIgnoreCase(scheme))
        .findFirst()
        .orElseThrow(() -> new StoragePluginNotFoundException(scheme));
  }

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
