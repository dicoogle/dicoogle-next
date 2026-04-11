package org.dicoogle.app.config;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.dicoogle.sdk.storage.ReadableStoragePlugin;
import org.dicoogle.sdk.storage.StoragePlugin;
import org.dicoogle.sdk.storage.WritableStoragePlugin;

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
    long readableCount = storagePlugins.stream().filter(ReadableStoragePlugin.class::isInstance).count();
    long writableCount = storagePlugins.stream().filter(WritableStoragePlugin.class::isInstance).count();

    String requiredScheme = runtimeProperties.getStartupValidation().getWritableScheme();
    boolean hasWritableForRequiredScheme =
        storagePlugins.stream()
            .anyMatch(
                plugin ->
                    plugin instanceof WritableStoragePlugin
                        && plugin.scheme().equalsIgnoreCase(requiredScheme));

    Map<String, Object> details = new LinkedHashMap<>();
    details.put("storagePlugins.total", storagePlugins.size());
    details.put("storagePlugins.readable", readableCount);
    details.put("storagePlugins.writable", writableCount);
    details.put("requiredWritableScheme", requiredScheme);
    details.put("hasWritableForRequiredScheme", hasWritableForRequiredScheme);

    if (runtimeProperties.getStartupValidation().isRequireWritableProvider()
        && !hasWritableForRequiredScheme) {
      return Health.down().withDetails(details).build();
    }

    return Health.up().withDetails(details).build();
  }
}
