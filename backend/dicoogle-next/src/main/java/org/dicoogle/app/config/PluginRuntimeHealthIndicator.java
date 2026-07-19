package org.dicoogle.app.config;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.dicoogle.sdk.storage.StoragePlugin;
import org.dicoogle.sdk.storage.WritableStoragePlugin;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;

public class PluginRuntimeHealthIndicator implements HealthIndicator {

  private final List<StoragePlugin> storagePlugins;
  private final PluginRuntimeProperties runtimeProperties;

  public PluginRuntimeHealthIndicator(
      List<StoragePlugin> storagePlugins, PluginRuntimeProperties runtimeProperties) {
    this.storagePlugins = List.copyOf(storagePlugins);
    this.runtimeProperties = runtimeProperties;
  }

  @Override
  public Health health() {
    String requiredScheme = runtimeProperties.getStartupValidation().getWritableScheme();
    boolean hasWritableForRequiredScheme =
        storagePlugins.stream()
            .anyMatch(
                plugin ->
                    plugin instanceof WritableStoragePlugin
                        && plugin.scheme().equalsIgnoreCase(requiredScheme));

    Map<String, Object> details = new LinkedHashMap<>();
    details.put("storagePlugins", storagePlugins.size());

    if (runtimeProperties.getStartupValidation().isRequireWritableProvider()
        && !hasWritableForRequiredScheme) {
      return Health.down().withDetails(details).build();
    }

    return Health.up().withDetails(details).build();
  }
}
