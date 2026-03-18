package pt.ua.dicooglenext.dicooglenext.config;

import java.nio.file.Path;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import pt.ua.dicooglenext.core.plugins.PluginRegistry;
import pt.ua.dicooglenext.core.storage.StorageRouter;
import pt.ua.dicooglenext.sdk.storage.StoragePlugin;
import pt.ua.dicooglenext.storage.filero.FileReadOnlyStoragePlugin;

@Configuration
public class PluginRuntimeConfig {

  @Bean
  FileReadOnlyStoragePlugin fileReadOnlyStoragePlugin(
      @Value("${app.storage.file-ro.root-dir:./data/storage}") String rootDir) {
    return new FileReadOnlyStoragePlugin(Path.of(rootDir));
  }

  @Bean
  PluginRegistry pluginRegistry(List<StoragePlugin> storagePlugins) {
    PluginRegistry registry = new PluginRegistry();
    storagePlugins.forEach(registry::register);
    return registry;
  }

  @Bean
  StorageRouter storageRouter(List<StoragePlugin> storagePlugins) {
    return new StorageRouter(storagePlugins);
  }
}
