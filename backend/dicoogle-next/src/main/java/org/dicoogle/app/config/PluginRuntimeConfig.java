package org.dicoogle.app.config;

import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.dicoogle.core.plugins.PluginRegistry;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.query.QueryIndexPlugin;
import org.dicoogle.sdk.storage.StoragePlugin;
import org.dicoogle.storage.filero.FileReadOnlyStoragePlugin;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(PluginRuntimeProperties.class)
public class PluginRuntimeConfig {

  @Bean
  FileReadOnlyStoragePlugin fileReadOnlyStoragePlugin(
      @Value("${app.storage.file-ro.root-dir:./data/storage}") String rootDir) {
    return new FileReadOnlyStoragePlugin(Path.of(rootDir));
  }

  @Bean
  ActiveStoragePlugins activeStoragePlugins(
      List<StoragePlugin> storagePlugins, PluginRuntimeProperties runtimeProperties) {
    Set<String> enabledSchemes =
        runtimeProperties.getStorage().getEnabledSchemes().stream()
            .map(s -> s.toLowerCase(Locale.ROOT))
            .collect(java.util.stream.Collectors.toSet());
    Set<String> disabledSchemes =
        runtimeProperties.getStorage().getDisabledSchemes().stream()
            .map(s -> s.toLowerCase(Locale.ROOT))
            .collect(java.util.stream.Collectors.toSet());

    List<StoragePlugin> active =
        storagePlugins.stream()
            .filter(
                plugin ->
                    enabledSchemes.isEmpty()
                        || enabledSchemes.contains(plugin.scheme().toLowerCase(Locale.ROOT)))
            .filter(plugin -> !disabledSchemes.contains(plugin.scheme().toLowerCase(Locale.ROOT)))
            .toList();

    if (active.isEmpty()) {
      throw new IllegalStateException(
          "No active storage plugins remain after enable/disable filtering");
    }

    return new ActiveStoragePlugins(active);
  }

  @Bean
  PluginRegistry pluginRegistry(
      ActiveStoragePlugins activeStoragePlugins, List<QueryIndexPlugin> queryIndexPlugins) {
    PluginRegistry registry = new PluginRegistry();
    activeStoragePlugins.plugins().forEach(registry::register);
    queryIndexPlugins.forEach(registry::register);
    return registry;
  }

  @Bean
  StorageRouter storageRouter(ActiveStoragePlugins activeStoragePlugins) {
    return new StorageRouter(activeStoragePlugins.plugins());
  }

  @Bean(name = "primaryStorageScheme")
  String primaryStorageScheme(PluginRuntimeProperties runtimeProperties) {
    return runtimeProperties.getStorage().getPrimaryScheme();
  }

  @Bean
  PluginStartupValidator pluginStartupValidator(
      ActiveStoragePlugins activeStoragePlugins, PluginRuntimeProperties runtimeProperties) {
    return new PluginStartupValidator(activeStoragePlugins.plugins(), runtimeProperties);
  }

  @Bean(name = "pluginRuntimeHealth")
  PluginRuntimeHealthIndicator pluginRuntimeHealthIndicator(
      ActiveStoragePlugins activeStoragePlugins, PluginRuntimeProperties runtimeProperties) {
    return new PluginRuntimeHealthIndicator(activeStoragePlugins.plugins(), runtimeProperties);
  }
}
