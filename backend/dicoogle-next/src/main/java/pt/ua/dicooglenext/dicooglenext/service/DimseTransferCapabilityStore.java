package pt.ua.dicooglenext.dicooglenext.service;

import java.util.List;
import pt.ua.dicooglenext.protocol.dimse.DimseCStoreProperties;

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
