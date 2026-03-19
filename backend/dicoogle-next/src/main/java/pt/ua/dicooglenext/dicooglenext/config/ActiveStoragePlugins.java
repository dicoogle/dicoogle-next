package pt.ua.dicooglenext.dicooglenext.config;

import java.util.List;
import pt.ua.dicooglenext.sdk.storage.StoragePlugin;

public record ActiveStoragePlugins(List<StoragePlugin> plugins) {

  public ActiveStoragePlugins {
    plugins = List.copyOf(plugins);
  }
}
