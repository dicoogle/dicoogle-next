package org.dicoogle.app.config;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.dicoogle.sdk.storage.StoragePlugin;
import org.dicoogle.sdk.storage.WritableStoragePlugin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;

public class PluginStartupValidator implements ApplicationRunner {

  private static final Logger LOGGER = LoggerFactory.getLogger(PluginStartupValidator.class);

  private final List<StoragePlugin> storagePlugins;
  private final PluginRuntimeProperties runtimeProperties;

  public PluginStartupValidator(
      List<StoragePlugin> storagePlugins, PluginRuntimeProperties runtimeProperties) {
    this.storagePlugins = List.copyOf(storagePlugins);
    this.runtimeProperties = runtimeProperties;
  }

  @Override
  public void run(ApplicationArguments args) {
    Map<String, Long> byScheme =
        storagePlugins.stream()
            .collect(Collectors.groupingBy(StoragePlugin::scheme, Collectors.counting()));

    byScheme.forEach(
        (scheme, count) ->
            LOGGER.info("Storage plugins loaded: scheme={}, count={}", scheme, count));

    String requiredScheme = runtimeProperties.getStartupValidation().getWritableScheme();
    boolean hasWritable =
        storagePlugins.stream()
            .anyMatch(
                plugin ->
                    plugin instanceof WritableStoragePlugin
                        && plugin.scheme().equalsIgnoreCase(requiredScheme));

    if (runtimeProperties.getStartupValidation().isRequireWritableProvider() && !hasWritable) {
      throw new IllegalStateException(
          "Startup validation failed: required writable storage provider for scheme '%s' not found"
              .formatted(requiredScheme));
    }

    if (!hasWritable) {
      LOGGER.warn(
          "No writable storage provider for scheme '{}' was found. C-STORE writes will be refused until one is enabled.",
          requiredScheme);
    }
  }
}
