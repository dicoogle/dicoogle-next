package org.dicoogle.protocol.dimse;

import io.micrometer.core.instrument.MeterRegistry;
import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.BooleanSupplier;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.net.Status;
import org.dcm4che3.net.service.DicomServiceException;
import org.dicoogle.sdk.query.DimseFindServicePlugin;
import org.dicoogle.sdk.query.DimseMoveAccessPolicy;
import org.dicoogle.sdk.query.DimseMoveServicePlugin;

public class CMoveService {

  static final String STUDY_ROOT_MOVE_UID = "1.2.840.10008.5.1.4.1.2.2.2";

  private final List<DimseMoveServicePlugin> plugins;
  private final List<DimseMoveAccessPolicy> accessPolicies;
  private final Set<String> supportedLevels;
  private final int maxResults;
  private final Map<String, DimseCMoveProperties.Destination> destinations;
  private final MeterRegistry meterRegistry;

  public CMoveService(
      List<DimseMoveServicePlugin> plugins,
      List<DimseMoveAccessPolicy> accessPolicies,
      DimseCFindProperties cfindProperties,
      DimseCMoveProperties properties,
      MeterRegistry meterRegistry) {
    this.plugins = List.copyOf(plugins);
    this.accessPolicies = List.copyOf(accessPolicies);
    this.supportedLevels =
        cfindProperties.getSupportedQueryLevels().stream()
            .map(level -> level.toUpperCase(Locale.ROOT))
            .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    this.maxResults = properties.getMaxResults();
    this.destinations = Map.copyOf(properties.getDestinations());
    this.meterRegistry = meterRegistry;
  }

  public List<DimseMoveServicePlugin.MoveCandidate> resolve(
      String affectedSopClassUid,
      Attributes keys,
      String moveDestinationAet,
      String callingAet,
      String calledAet,
      int associationSerialNo,
      BooleanSupplier cancelRequested)
      throws DicomServiceException {
    meterRegistry.counter("dicoogle.cmove.requests").increment();

    if (!STUDY_ROOT_MOVE_UID.equals(affectedSopClassUid)) {
      throw new DicomServiceException(
          Status.SOPclassNotSupported, "Only Study Root C-MOVE is supported");
    }

    String queryLevel = keys.getString(Tag.QueryRetrieveLevel);
    if (queryLevel == null || queryLevel.isBlank()) {
      throw new DicomServiceException(
          Status.IdentifierDoesNotMatchSOPClass, "Missing QueryRetrieveLevel");
    }

    String normalizedLevel = queryLevel.trim().toUpperCase(Locale.ROOT);
    if (!supportedLevels.contains(normalizedLevel)) {
      throw new DicomServiceException(
          Status.IdentifierDoesNotMatchSOPClass,
          "Unsupported QueryRetrieveLevel: " + normalizedLevel);
    }

    if (!hasDestination(moveDestinationAet)) {
      throw new DicomServiceException(
          Status.MoveDestinationUnknown, "Unknown move destination: " + moveDestinationAet);
    }

    if (plugins.isEmpty()) {
      throw new DicomServiceException(Status.UnableToProcess, "No DIMSE move plugin is configured");
    }

    DimseFindServicePlugin.QueryRetrieveLevel level;
    try {
      level = DimseFindServicePlugin.QueryRetrieveLevel.valueOf(normalizedLevel);
    } catch (IllegalArgumentException ex) {
      throw new DicomServiceException(
          Status.IdentifierDoesNotMatchSOPClass, "Invalid QueryRetrieveLevel");
    }

    DimseMoveServicePlugin.MoveRequest request =
        new DimseMoveServicePlugin.MoveRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            level,
            callingAet,
            calledAet,
            moveDestinationAet,
            associationSerialNo,
            new Attributes(keys),
            cancelRequested == null ? () -> false : cancelRequested);

    for (DimseMoveAccessPolicy policy : accessPolicies) {
      DimseMoveAccessPolicy.Decision decision = policy.evaluate(request);
      if (!decision.allowed()) {
        throw new DicomServiceException(Status.UnableToProcess, decision.reason());
      }
    }

    List<DimseMoveServicePlugin.MoveCandidate> merged = new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    for (DimseMoveServicePlugin plugin : plugins) {
      List<DimseMoveServicePlugin.MoveCandidate> candidates;
      try {
        candidates = plugin.resolve(request);
      } catch (IOException ex) {
        throw new DicomServiceException(Status.UnableToProcess, ex.getMessage());
      }
      if (candidates == null || candidates.isEmpty()) {
        continue;
      }
      for (DimseMoveServicePlugin.MoveCandidate candidate : candidates) {
        if (candidate == null || candidate.location() == null) {
          continue;
        }
        if (!isValidCandidate(candidate)) {
          continue;
        }
        if (!seen.add(unique(candidate))) {
          continue;
        }
        merged.add(candidate);
        if (merged.size() >= maxResults) {
          return merged;
        }
      }
    }
    return merged;
  }

  public DimseCMoveProperties.Destination destination(String moveDestinationAet)
      throws DicomServiceException {
    if (moveDestinationAet == null || moveDestinationAet.isBlank()) {
      throw new DicomServiceException(
          Status.MoveDestinationUnknown, "Move Destination is required");
    }
    DimseCMoveProperties.Destination destination = destinations.get(moveDestinationAet);
    if (destination == null || destination.getHost() == null || destination.getHost().isBlank()) {
      throw new DicomServiceException(
          Status.MoveDestinationUnknown, "Unknown move destination: " + moveDestinationAet);
    }
    if (destination.getPort() <= 0) {
      throw new DicomServiceException(
          Status.MoveDestinationUnknown,
          "Invalid destination port for move destination: " + moveDestinationAet);
    }
    return destination;
  }

  private boolean hasDestination(String moveDestinationAet) {
    if (moveDestinationAet == null || moveDestinationAet.isBlank()) {
      return false;
    }
    return destinations.containsKey(moveDestinationAet);
  }

  private boolean isValidCandidate(DimseMoveServicePlugin.MoveCandidate candidate) {
    return hasText(candidate.sopClassUid())
        && hasText(candidate.sopInstanceUid())
        && hasText(candidate.location().getScheme());
  }

  private boolean hasText(String value) {
    return value != null && !value.isBlank();
  }

  private String unique(DimseMoveServicePlugin.MoveCandidate candidate) {
    URI location = candidate.location();
    return candidate.sopClassUid() + "|" + candidate.sopInstanceUid() + "|" + location;
  }
}
