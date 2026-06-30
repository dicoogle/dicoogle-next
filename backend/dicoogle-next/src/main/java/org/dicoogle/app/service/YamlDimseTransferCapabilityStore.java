package org.dicoogle.app.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.dicoogle.app.config.DimseTransferCapabilityConfigProperties;
import org.dicoogle.protocol.dimse.DimseCStoreProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    prefix = "app.dimse.cstore.config",
    name = "source",
    havingValue = "yaml",
    matchIfMissing = true)
public class YamlDimseTransferCapabilityStore implements DimseTransferCapabilityStore {

  private static final ObjectMapper MAPPER = new YAMLMapper();

  private final DimseTransferCapabilityConfigProperties properties;
  private final DimseCStoreProperties cstoreProperties;

  private volatile long version = 0;

  public YamlDimseTransferCapabilityStore(
      DimseTransferCapabilityConfigProperties properties, DimseCStoreProperties cstoreProperties) {
    this.properties = properties;
    this.cstoreProperties = cstoreProperties;
  }

  @Override
  public StoredCapabilities load() {
    Path path = filePath();
    if (Files.exists(path)) {
      try {
        byte[] bytes = Files.readAllBytes(path);
        List<DimseCStoreProperties.AcceptedTransferCapability> capabilities =
            new ArrayList<>(
                List.of(
                    MAPPER.readValue(
                        bytes, DimseCStoreProperties.AcceptedTransferCapability[].class)));
        return new StoredCapabilities(
            version, "yaml", "file", Instant.now().toString(), capabilities);
      } catch (IOException e) {
        // fall through to bootstrap
      }
    }
    return bootstrap();
  }

  @Override
  public StoredCapabilities save(
      List<DimseCStoreProperties.AcceptedTransferCapability> capabilities,
      Long expectedVersion,
      String updatedBy) {
    if (expectedVersion != null && expectedVersion.longValue() != version) {
      throw new IllegalStateException("Version conflict while updating transfer capabilities");
    }

    version++;
    String actor = updatedBy == null || updatedBy.isBlank() ? "api" : updatedBy;

    Path path = filePath();
    Path parent = path.getParent();
    try {
      if (parent != null) {
        Files.createDirectories(parent);
      }
      Path tmp = parent.resolve(path.getFileName() + ".tmp");
      MAPPER.writeValue(tmp.toFile(), capabilities);
      Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    } catch (IOException e) {
      throw new IllegalStateException("Failed to write transfer capabilities to " + path, e);
    }

    return new StoredCapabilities(
        version, "yaml", actor, Instant.now().toString(), List.copyOf(capabilities));
  }

  private StoredCapabilities bootstrap() {
    List<DimseCStoreProperties.AcceptedTransferCapability> capabilities =
        List.copyOf(cstoreProperties.getAcceptedTransferCapabilities());
    save(capabilities, null, "bootstrap");
    return new StoredCapabilities(
        version, "yaml", "bootstrap", Instant.now().toString(), capabilities);
  }

  private Path filePath() {
    return Path.of(properties.getFilePath());
  }
}
