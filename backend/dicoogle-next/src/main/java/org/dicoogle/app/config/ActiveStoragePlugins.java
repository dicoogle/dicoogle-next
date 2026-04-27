package org.dicoogle.app.config;

import java.util.List;
import org.dicoogle.sdk.storage.StoragePlugin;

public record ActiveStoragePlugins(List<StoragePlugin> plugins) {

  public ActiveStoragePlugins {
    plugins = List.copyOf(plugins);
  }
}
