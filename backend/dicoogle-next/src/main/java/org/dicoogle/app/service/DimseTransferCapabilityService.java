package org.dicoogle.app.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import org.dcm4che3.util.UIDUtils;
import org.dicoogle.app.config.DimseTransferCapabilityConfigProperties;
import org.dicoogle.app.dto.DimseTransferCapabilityDtos.TransferCapabilityItem;
import org.dicoogle.app.dto.DimseTransferCapabilityDtos.TransferCapabilityListResponse;
import org.dicoogle.protocol.dimse.DimseCStoreProperties;
import org.dicoogle.protocol.dimse.DimseCStoreServer;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DimseTransferCapabilityService {

  private final DimseTransferCapabilityStore store;
  private final DimseTransferCapabilityConfigProperties properties;
  private final ObjectProvider<DimseCStoreServer> serverProvider;

  private volatile long appliedVersion = -1;
  private volatile String lastAppliedAt = Instant.now().toString();

  public DimseTransferCapabilityService(
      DimseTransferCapabilityStore store,
      DimseTransferCapabilityConfigProperties properties,
      ObjectProvider<DimseCStoreServer> serverProvider) {
    this.store = store;
    this.properties = properties;
    this.serverProvider = serverProvider;

    refreshFromStore();
  }

  public TransferCapabilityListResponse getCurrent() {
    DimseTransferCapabilityStore.StoredCapabilities stored = store.load();
    return toResponse(stored);
  }

  public TransferCapabilityListResponse upsertOne(
      String sopClassUid, List<String> transferSyntaxUids, String actor) {
    validateUid(sopClassUid, "SOP Class UID");
    List<String> normalizedTs = normalizeTransferSyntaxes(transferSyntaxUids);

    DimseTransferCapabilityStore.StoredCapabilities current = store.load();
    List<DimseCStoreProperties.AcceptedTransferCapability> updated =
        new ArrayList<>(current.capabilities());

    boolean replaced = false;
    for (int i = 0; i < updated.size(); i++) {
      if (sopClassUid.equals(updated.get(i).getSopClassUid())) {
        updated.set(
            i, new DimseCStoreProperties.AcceptedTransferCapability(sopClassUid, normalizedTs));
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      updated.add(new DimseCStoreProperties.AcceptedTransferCapability(sopClassUid, normalizedTs));
    }

    DimseTransferCapabilityStore.StoredCapabilities saved =
        saveWithConflictMapping(normalizeCapabilities(updated), current.version(), actor);
    apply(saved);
    return toResponse(saved);
  }

  public TransferCapabilityListResponse deleteOne(String sopClassUid, String actor) {
    validateUid(sopClassUid, "SOP Class UID");

    DimseTransferCapabilityStore.StoredCapabilities current = store.load();
    List<DimseCStoreProperties.AcceptedTransferCapability> updated =
        current.capabilities().stream()
            .filter(capability -> !sopClassUid.equals(capability.getSopClassUid()))
            .toList();

    DimseTransferCapabilityStore.StoredCapabilities saved =
        saveWithConflictMapping(updated, current.version(), actor);
    apply(saved);
    return toResponse(saved);
  }

  public TransferCapabilityListResponse replaceAll(
      List<TransferCapabilityItem> items, Long expectedVersion, String actor) {
    if (items == null || items.isEmpty()) {
      throw new IllegalArgumentException("acceptedTransferCapabilities must not be empty");
    }

    List<DimseCStoreProperties.AcceptedTransferCapability> mapped =
        items.stream()
            .map(
                item ->
                    new DimseCStoreProperties.AcceptedTransferCapability(
                        item.sopClassUid(), normalizeTransferSyntaxes(item.transferSyntaxUids())))
            .toList();

    List<DimseCStoreProperties.AcceptedTransferCapability> normalized =
        normalizeCapabilities(mapped);
    DimseTransferCapabilityStore.StoredCapabilities saved =
        saveWithConflictMapping(normalized, expectedVersion, actor);
    apply(saved);
    return toResponse(saved);
  }

  public TransferCapabilityListResponse applyLegacyToggle(
      String sopClassUid, String option, boolean value, String actor) {
    if (!"enabled".equalsIgnoreCase(option)) {
      throw new IllegalArgumentException("option must be 'enabled'");
    }
    validateUid(sopClassUid, "SOP Class UID");

    DimseTransferCapabilityStore.StoredCapabilities current = store.load();
    List<DimseCStoreProperties.AcceptedTransferCapability> updated =
        new ArrayList<>(current.capabilities());

    boolean changed = false;
    if (value) {
      boolean exists =
          updated.stream().anyMatch(capability -> sopClassUid.equals(capability.getSopClassUid()));
      if (!exists) {
        updated.add(
            new DimseCStoreProperties.AcceptedTransferCapability(
                sopClassUid, List.of("1.2.840.10008.1.2")));
        changed = true;
      }
    } else {
      int before = updated.size();
      updated.removeIf(capability -> sopClassUid.equals(capability.getSopClassUid()));
      changed = before != updated.size();
    }

    if (!changed) {
      return toResponse(current);
    }

    DimseTransferCapabilityStore.StoredCapabilities saved =
        saveWithConflictMapping(normalizeCapabilities(updated), current.version(), actor);
    apply(saved);
    return toResponse(saved);
  }

  @Scheduled(fixedDelayString = "${app.dimse.cstore.config.sync-interval-ms:5000}")
  public void refreshFromStore() {
    if (properties.getSource() != DimseTransferCapabilityConfigProperties.Source.JDBC) {
      return;
    }

    DimseTransferCapabilityStore.StoredCapabilities stored = store.load();
    if (stored.version() > appliedVersion) {
      apply(stored);
    }
  }

  private void apply(DimseTransferCapabilityStore.StoredCapabilities stored) {
    DimseCStoreServer server = serverProvider.getIfAvailable();
    if (server != null) {
      server.applyAcceptedTransferCapabilities(stored.capabilities());
    }
    this.appliedVersion = stored.version();
    this.lastAppliedAt = Instant.now().toString();
  }

  private TransferCapabilityListResponse toResponse(
      DimseTransferCapabilityStore.StoredCapabilities stored) {
    List<TransferCapabilityItem> items =
        stored.capabilities().stream()
            .map(
                capability ->
                    new TransferCapabilityItem(
                        capability.getSopClassUid(),
                        List.copyOf(capability.getTransferSyntaxUids())))
            .toList();

    return new TransferCapabilityListResponse(
        stored.source(),
        stored.version(),
        stored.updatedBy(),
        stored.updatedAt(),
        properties.getJdbc().getNodeId(),
        items);
  }

  public long appliedVersion() {
    return appliedVersion;
  }

  public String lastAppliedAt() {
    return lastAppliedAt;
  }

  public String sourceName() {
    return properties.getSource().name().toLowerCase();
  }

  public void applyToServer() {
    DimseTransferCapabilityStore.StoredCapabilities stored = store.load();
    apply(stored);
  }

  private List<DimseCStoreProperties.AcceptedTransferCapability> normalizeCapabilities(
      List<DimseCStoreProperties.AcceptedTransferCapability> capabilities) {
    if (capabilities == null || capabilities.isEmpty()) {
      throw new IllegalArgumentException("acceptedTransferCapabilities must not be empty");
    }

    List<DimseCStoreProperties.AcceptedTransferCapability> result = new ArrayList<>();
    LinkedHashSet<String> seenSops = new LinkedHashSet<>();

    for (DimseCStoreProperties.AcceptedTransferCapability capability : capabilities) {
      String sopClassUid = capability.getSopClassUid();
      validateUid(sopClassUid, "SOP Class UID");
      if (!seenSops.add(sopClassUid)) {
        continue;
      }

      List<String> normalizedTs = normalizeTransferSyntaxes(capability.getTransferSyntaxUids());
      result.add(new DimseCStoreProperties.AcceptedTransferCapability(sopClassUid, normalizedTs));
    }

    result.sort(
        Comparator.comparing(DimseCStoreProperties.AcceptedTransferCapability::getSopClassUid));
    return result;
  }

  private List<String> normalizeTransferSyntaxes(List<String> transferSyntaxUids) {
    if (transferSyntaxUids == null || transferSyntaxUids.isEmpty()) {
      throw new IllegalArgumentException("transferSyntaxUids must not be empty");
    }

    LinkedHashSet<String> normalized = new LinkedHashSet<>();
    for (String tsUid : transferSyntaxUids) {
      String value = Objects.requireNonNull(tsUid, "transfer syntax UID cannot be null").trim();
      validateUid(value, "Transfer Syntax UID");
      normalized.add(value);
    }

    return List.copyOf(normalized);
  }

  private void validateUid(String uid, String label) {
    if (uid == null || uid.isBlank() || !UIDUtils.isValid(uid)) {
      throw new IllegalArgumentException(label + " is not a valid DICOM UID: " + uid);
    }
  }

  private DimseTransferCapabilityStore.StoredCapabilities saveWithConflictMapping(
      List<DimseCStoreProperties.AcceptedTransferCapability> capabilities,
      Long expectedVersion,
      String actor) {
    try {
      return store.save(capabilities, expectedVersion, actor);
    } catch (IllegalStateException ex) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, ex.getMessage(), ex);
    }
  }
}
