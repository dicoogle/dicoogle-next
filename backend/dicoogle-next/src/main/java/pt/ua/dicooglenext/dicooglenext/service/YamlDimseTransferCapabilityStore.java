package org.dicoogle.app.service;

import java.time.Instant;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.dicoogle.protocol.dimse.DimseCStoreProperties;

@Component
@ConditionalOnProperty(
    prefix = "app.dimse.cstore.config",
    name = "source",
    havingValue = "yaml",
    matchIfMissing = true)
public class YamlDimseTransferCapabilityStore implements DimseTransferCapabilityStore {

  private final DimseCStoreProperties properties;

  public YamlDimseTransferCapabilityStore(DimseCStoreProperties properties) {
    this.properties = properties;
  }

  @Override
  public StoredCapabilities load() {
    return new StoredCapabilities(
        0,
        "yaml",
        "bootstrap",
        Instant.now().toString(),
        List.copyOf(properties.getAcceptedTransferCapabilities()));
  }

  @Override
  public StoredCapabilities save(
      List<DimseCStoreProperties.AcceptedTransferCapability> capabilities,
      Long expectedVersion,
      String updatedBy) {
    properties.setAcceptedTransferCapabilities(capabilities);
    return new StoredCapabilities(
        0,
        "yaml",
        updatedBy == null || updatedBy.isBlank() ? "api" : updatedBy,
        Instant.now().toString(),
        List.copyOf(properties.getAcceptedTransferCapabilities()));
  }
}
