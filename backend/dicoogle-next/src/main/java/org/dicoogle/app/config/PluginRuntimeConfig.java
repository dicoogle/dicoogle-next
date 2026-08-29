package org.dicoogle.app.config;

import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.dicoogle.app.service.QueryIndexMaintenanceService;
import org.dicoogle.core.plugins.PluginRegistry;
import org.dicoogle.core.query.QueryRouter;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.query.QueryIndexPlugin;
import org.dicoogle.sdk.query.QueryMoveService;
import org.dicoogle.sdk.query.QueryService;
import org.dicoogle.sdk.storage.StoragePlugin;
import org.dicoogle.storage.filero.FileReadOnlyStoragePlugin;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
@EnableConfigurationProperties(PluginRuntimeProperties.class)
public class PluginRuntimeConfig {

  private static final int DEFAULT_QUERY_THREAD_POOL = 4;
  private static final int DEFAULT_MAX_RESULTS = 1000;

  @Bean
  @Primary
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

  @Bean
  QueryRouter queryRouter(List<QueryService> queryServices, List<QueryMoveService> moveServices) {
    return new QueryRouter(
        queryServices, moveServices, DEFAULT_QUERY_THREAD_POOL, DEFAULT_MAX_RESULTS);
  }

  // The file-system watcher indexes files created outside of C-STORE (e.g. manual drops).
  // C-STORE already indexes via StorageIngestEventListener, so the watcher is disabled by
  // default to avoid double-indexing. Enable explicitly with app.storage.watcher.enabled=true
  // if you need to pick up files written outside the normal DICOM pipeline.
  @Bean(initMethod = "start", destroyMethod = "stop")
  @ConditionalOnProperty(prefix = "app.storage.watcher", name = "enabled", havingValue = "true")
  StorageWatcherService storageWatcherService(
      @Value("${app.storage.file-ro.root-dir:./data/storage}") String rootDir,
      QueryIndexMaintenanceService indexService) {
    return new StorageWatcherService(Path.of(rootDir).toAbsolutePath().normalize(), indexService);
  }
}
