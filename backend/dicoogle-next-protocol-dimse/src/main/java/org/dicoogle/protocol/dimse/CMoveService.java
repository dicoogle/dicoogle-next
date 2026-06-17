package org.dicoogle.protocol.dimse;

import io.micrometer.core.instrument.MeterRegistry;
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
import org.dicoogle.core.query.QueryRouter;
import org.dicoogle.protocol.legacyproxy.LegacyProxyService;
import org.dicoogle.protocol.legacyproxy.config.LegacyProxyProperties;
import org.dicoogle.sdk.query.DimseAccessPolicy;
import org.dicoogle.sdk.query.QueryMoveService;
import org.dicoogle.sdk.query.QueryRetrieveLevel;
import org.dicoogle.sdk.query.QueryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CMoveService {

  static final String STUDY_ROOT_MOVE_UID = "1.2.840.10008.5.1.4.1.2.2.2";
  private static final Logger LOGGER = LoggerFactory.getLogger(CMoveService.class);

  private final QueryRouter router;
  private final List<DimseAccessPolicy<QueryMoveService.MoveRequest>> accessPolicies;
  private final Set<String> supportedLevels;
  private final int maxResults;
  private final List<String> dimProviders;
  private final Map<String, DimseCMoveProperties.Destination> destinations;
  private final MeterRegistry meterRegistry;
  private final LegacyProxyService legacyProxyService;
  private final LegacyProxyProperties legacyProxyProperties;

  public CMoveService(
      QueryRouter router,
      List<DimseAccessPolicy<QueryMoveService.MoveRequest>> accessPolicies,
      DimseCFindProperties cfindProperties,
      DimseCMoveProperties properties,
      DimseProperties dimseProperties,
      MeterRegistry meterRegistry,
      LegacyProxyService legacyProxyService,
      LegacyProxyProperties legacyProxyProperties) {
    this.router = router;
    this.legacyProxyProperties = legacyProxyProperties;
    this.accessPolicies = List.copyOf(accessPolicies);
    this.supportedLevels =
        cfindProperties.getSupportedQueryLevels().stream()
            .map(level -> level.toUpperCase(Locale.ROOT))
            .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    this.maxResults = properties.getMaxResults();
    this.dimProviders = dimseProperties.getDimProviders();
    this.destinations = Map.copyOf(properties.getDestinations());
    this.meterRegistry = meterRegistry;
    this.legacyProxyService = legacyProxyService;
  }

  public List<QueryMoveService.MoveCandidate> resolve(
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

    validateIdentifierByLevel(keys, normalizedLevel);

    if (!hasDestination(moveDestinationAet)) {
      throw new DicomServiceException(
          Status.MoveDestinationUnknown, "Unknown move destination: " + moveDestinationAet);
    }

    QueryRetrieveLevel level;
    try {
      level = QueryRetrieveLevel.valueOf(normalizedLevel);
    } catch (IllegalArgumentException ex) {
      throw new DicomServiceException(
          Status.IdentifierDoesNotMatchSOPClass, "Invalid QueryRetrieveLevel");
    }

    boolean hasMovePlugin = router.movePluginCount() > 0;
    boolean useLegacy =
        legacyProxyProperties != null
            && legacyProxyProperties.shouldUseLegacyForQueryIndex(hasMovePlugin);

    if (useLegacy) {
      if (legacyProxyService == null) {
        throw new DicomServiceException(
            Status.UnableToProcess, "No DIMSE move plugin is configured");
      }
      return fallbackToLegacy(keys, level, normalizedLevel);
    }

    if (!hasMovePlugin) {
      throw new DicomServiceException(Status.UnableToProcess, "No DIMSE move plugin is configured");
    }

    QueryMoveService.MoveRequest request =
        new QueryMoveService.MoveRequest(
            QueryService.InformationModel.STUDY_ROOT,
            level,
            callingAet,
            calledAet,
            moveDestinationAet,
            associationSerialNo,
            new Attributes(keys),
            cancelRequested == null ? () -> false : cancelRequested);

    for (DimseAccessPolicy<QueryMoveService.MoveRequest> policy : accessPolicies) {
      DimseAccessPolicy.Decision decision = policy.evaluate(request);
      if (!decision.allowed()) {
        throw new DicomServiceException(Status.UnableToProcess, decision.reason());
      }
    }

    // Resolve via router — parallel dispatch to all DIM providers, dedup
    List<QueryMoveService.MoveCandidate> merged = router.resolve(request, dimProviders);
    if (merged.size() > maxResults) {
      merged = merged.subList(0, maxResults);
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

  private void validateIdentifierByLevel(Attributes keys, String level)
      throws DicomServiceException {
    String studyUid = keys.getString(Tag.StudyInstanceUID, null);
    String seriesUid = keys.getString(Tag.SeriesInstanceUID, null);
    String sopUid = keys.getString(Tag.SOPInstanceUID, null);

    if ("STUDY".equals(level) && !hasText(studyUid)) {
      throw new DicomServiceException(
          Status.IdentifierDoesNotMatchSOPClass,
          "StudyInstanceUID is required for QueryRetrieveLevel=STUDY");
    }
    if ("SERIES".equals(level) && (!hasText(studyUid) || !hasText(seriesUid))) {
      throw new DicomServiceException(
          Status.IdentifierDoesNotMatchSOPClass,
          "StudyInstanceUID and SeriesInstanceUID are required for QueryRetrieveLevel=SERIES");
    }
    if ("IMAGE".equals(level) && (!hasText(studyUid) || !hasText(seriesUid) || !hasText(sopUid))) {
      throw new DicomServiceException(
          Status.IdentifierDoesNotMatchSOPClass,
          "StudyInstanceUID, SeriesInstanceUID and SOPInstanceUID are required for QueryRetrieveLevel=IMAGE");
    }
  }

  private boolean hasText(String value) {
    return value != null && !value.isBlank();
  }

  @SuppressWarnings("unchecked")
  private List<QueryMoveService.MoveCandidate> fallbackToLegacy(
      Attributes keys, QueryRetrieveLevel level, String normalizedLevel)
      throws DicomServiceException {
    LOGGER.info("C-MOVE no local move plugin, falling back to legacy: level={}", normalizedLevel);

    String query = buildFreetextQuery(keys);
    String[] fields = buildLegacyReturnFields(keys);

    Map<?, ?> response = legacyProxyService.searchQuery(query, fields, maxResults);
    if (response == null) {
      LOGGER.warn("C-MOVE legacy fallback returned null");
      return List.of();
    }

    List<?> resultList = (List<?>) response.get("results");
    if (resultList == null || resultList.isEmpty()) {
      LOGGER.info("C-MOVE legacy fallback returned 0 matches");
      return List.of();
    }

    List<QueryMoveService.MoveCandidate> candidates = new ArrayList<>();
    for (Object obj : resultList) {
      Map<?, ?> entry = (Map<?, ?>) obj;
      Map<?, ?> fieldsMap = (Map<?, ?>) entry.get("fields");
      if (fieldsMap == null) {
        continue;
      }

      String sopClassUid = null;
      String sopInstanceUid = null;

      for (Map.Entry<?, ?> f : fieldsMap.entrySet()) {
        String keyword = (String) f.getKey();
        if ("SOPClassUID".equals(keyword) || "sopClassUid".equals(keyword)) {
          sopClassUid = String.valueOf(f.getValue());
        } else if ("SOPInstanceUID".equals(keyword) || "sopInstanceUid".equals(keyword)) {
          sopInstanceUid = String.valueOf(f.getValue());
        }
      }

      if (sopInstanceUid == null || sopInstanceUid.isBlank()) {
        continue;
      }
      if (sopClassUid == null || sopClassUid.isBlank()) {
        sopClassUid = "*";
      }

      String legacyUri = (String) entry.get("uri");
      java.net.URI location;
      if (legacyUri != null && !legacyUri.isBlank()) {
        location = java.net.URI.create("legacy://" + legacyUri);
      } else {
        location = java.net.URI.create("legacy://" + sopInstanceUid);
      }
      candidates.add(new QueryMoveService.MoveCandidate(sopClassUid, sopInstanceUid, location));

      if (candidates.size() >= maxResults) {
        break;
      }
    }

    LOGGER.info("C-MOVE legacy fallback returned {} candidates", candidates.size());
    return candidates;
  }

  private String buildFreetextQuery(Attributes keys) {
    StringBuilder query = new StringBuilder();
    for (int tag : keys.tags()) {
      if (tag == Tag.QueryRetrieveLevel) {
        continue;
      }
      String value = keys.getString(tag, null);
      if (value != null && !value.isBlank()) {
        if (!query.isEmpty()) {
          query.append(' ');
        }
        query.append(value);
      }
    }
    return query.isEmpty() ? "*" : query.toString();
  }

  private String[] buildLegacyReturnFields(Attributes keys) {
    List<String> fields = new ArrayList<>();
    for (int tag : keys.tags()) {
      if (tag == Tag.QueryRetrieveLevel) {
        continue;
      }
      String value = keys.getString(tag, null);
      if (value == null || value.isBlank()) {
        String keyword = org.dcm4che3.data.ElementDictionary.keywordOf(tag, null);
        if (keyword != null) {
          fields.add(keyword);
        }
      }
    }
    if (fields.isEmpty()) {
      return new String[] {
        "SOPInstanceUID", "SOPClassUID", "StudyInstanceUID", "SeriesInstanceUID"
      };
    }
    return fields.toArray(new String[0]);
  }
}
