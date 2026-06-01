package org.dicoogle.app.settings;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    prefix = "app.runtime-settings",
    name = "store",
    havingValue = "yaml",
    matchIfMissing = true)
public class YamlSettingsStore implements SettingsStore {

  private static final Logger log = LoggerFactory.getLogger(YamlSettingsStore.class);
  private static final ObjectMapper MAPPER = new ObjectMapper(new YAMLFactory());

  private final Path path;

  public YamlSettingsStore(RuntimeSettingsProperties properties) {
    String configured = properties.getPath();
    this.path =
        configured == null || configured.isBlank()
            ? Paths.get("./data/runtime-settings.yml")
            : Paths.get(configured);
  }

  @Override
  public RuntimeSettings load() {
    if (!Files.exists(path)) {
      return null;
    }
    try {
      return MAPPER.readValue(path.toFile(), RuntimeSettings.class);
    } catch (IOException ex) {
      log.warn("Failed to read runtime settings from {}", path, ex);
      return new RuntimeSettings();
    }
  }

  @Override
  public void save(RuntimeSettings settings) {
    try {
      Files.createDirectories(path.getParent());
      MAPPER.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), settings);
    } catch (IOException ex) {
      throw new IllegalStateException("Failed to write runtime settings to " + path, ex);
    }
  }
}
