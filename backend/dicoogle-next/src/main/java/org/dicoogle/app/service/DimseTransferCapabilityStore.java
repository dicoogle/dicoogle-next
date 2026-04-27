package org.dicoogle.app.service;

import java.util.List;
import org.dicoogle.protocol.dimse.DimseCStoreProperties;

public interface DimseTransferCapabilityStore {

  record StoredCapabilities(
      long version,
      String source,
      String updatedBy,
      String updatedAt,
      List<DimseCStoreProperties.AcceptedTransferCapability> capabilities) {}

  StoredCapabilities load();

  StoredCapabilities save(
      List<DimseCStoreProperties.AcceptedTransferCapability> capabilities,
      Long expectedVersion,
      String updatedBy);
}
