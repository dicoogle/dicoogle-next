package org.dicoogle.protocol.dimse;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.regex.Pattern;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.ElementDictionary;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dcm4che3.net.QueryOption;
import org.dcm4che3.net.Status;
import org.dcm4che3.net.service.DicomServiceException;
import org.dicoogle.core.query.QueryRouter;
import org.dicoogle.protocol.legacyproxy.LegacyProxyService;
import org.dicoogle.protocol.legacyproxy.config.LegacyProxyProperties;
import org.dicoogle.sdk.query.DimseAccessPolicy;
import org.dicoogle.sdk.query.QueryRetrieveLevel;
import org.dicoogle.sdk.query.QueryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CFindService {

  private static final String STUDY_ROOT_MODEL_UID = "1.2.840.10008.5.1.4.1.2.2.1";
  private static final Pattern KEYWORD_PATTERN = Pattern.compile("[A-Za-z0-9_.-]+:[^\\s]+");
  private static final Logger LOGGER = LoggerFactory.getLogger(CFindService.class);

  private final QueryRouter router;
  private final List<DimseAccessPolicy<QueryService.QueryRequest>> accessPolicies;
  private final Set<String> supportedLevels;
  private final int maxResults;
  private final List<String> dimProviders;
  private final MeterRegistry meterRegistry;
  private final LegacyProxyService legacyProxyService;
  private final LegacyProxyProperties legacyProxyProperties;

  public CFindService(
      QueryRouter router,
      List<DimseAccessPolicy<QueryService.QueryRequest>> accessPolicies,
      DimseCFindProperties properties,
      DimseProperties dimseProperties,
      MeterRegistry meterRegistry,
      LegacyProxyService legacyProxyService,
      LegacyProxyProperties legacyProxyProperties) {
    this.router = router;
    this.legacyProxyProperties = legacyProxyProperties;
    this.accessPolicies = List.copyOf(accessPolicies);
    this.supportedLevels =
        properties.getSupportedQueryLevels().stream()
            .map(level -> level.toUpperCase(Locale.ROOT))
            .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    this.maxResults = properties.getMaxResults();
    this.dimProviders = dimseProperties.getDimProviders();
    this.meterRegistry = meterRegistry;
    this.legacyProxyService = legacyProxyService;
  }

  public List<Attributes> find(
      String affectedSopClassUid,
      Attributes keys,
      String callingAet,
      String calledAet,
      int associationSerialNo,
      java.util.Set<QueryOption> queryOptions,
      BooleanSupplier cancelRequested)
      throws DicomServiceException {
    long startNs = System.nanoTime();
    increment("dicoogle.cfind.requests", null);

    if (!STUDY_ROOT_MODEL_UID.equals(affectedSopClassUid)) {
      increment("dicoogle.cfind.failure", "unsupported-sop-class");
      throw new DicomServiceException(
          Status.SOPclassNotSupported, "Only Study Root C-FIND is supported");
    }

    String queryLevel = keys.getString(Tag.QueryRetrieveLevel);
    if (queryLevel == null || queryLevel.isBlank()) {
      increment("dicoogle.cfind.failure", "missing-query-level");
      throw new DicomServiceException(
          Status.IdentifierDoesNotMatchSOPClass, "Missing QueryRetrieveLevel");
    }

    String normalizedLevel = queryLevel.trim().toUpperCase(Locale.ROOT);
    if (!supportedLevels.contains(normalizedLevel)) {
      increment("dicoogle.cfind.failure", "unsupported-query-level");
      throw new DicomServiceException(
          Status.IdentifierDoesNotMatchSOPClass,
          "Unsupported QueryRetrieveLevel: " + normalizedLevel);
    }

    QueryRetrieveLevel level;
    try {
      level = QueryRetrieveLevel.valueOf(normalizedLevel);
    } catch (IllegalArgumentException ex) {
      increment("dicoogle.cfind.failure", "invalid-query-level");
      throw new DicomServiceException(
          Status.IdentifierDoesNotMatchSOPClass, "Invalid QueryRetrieveLevel");
    }

    validateIdentifier(keys, queryOptions);

    boolean hasQueryPlugin = router.queryPluginCount() > 0;
    boolean useLegacy =
        legacyProxyProperties != null
            && legacyProxyProperties.shouldUseLegacyForQueryIndex(hasQueryPlugin);

    if (useLegacy) {
      if (legacyProxyService == null) {
        increment("dicoogle.cfind.failure", "no-query-plugin");
        throw new DicomServiceException(
            Status.UnableToProcess, "No DIMSE query plugin is configured");
      }
      return fallbackToLegacy(keys, level, maxResults, startNs, normalizedLevel);
    }

    if (!hasQueryPlugin) {
      increment("dicoogle.cfind.failure", "no-query-plugin");
      throw new DicomServiceException(
          Status.UnableToProcess, "No DIMSE query plugin is configured");
    }

    String rawPatientName = keys.getString(Tag.PatientName, null);
    String freeText = extractFreeText(rawPatientName);
    Map<String, String> keywordFilters = extractKeywordFilters(rawPatientName);

    Attributes normalizedKeys = new Attributes(keys);
    if (freeText == null || freeText.isBlank()) {
      normalizedKeys.setNull(Tag.PatientName, org.dcm4che3.data.VR.PN);
    } else {
      normalizedKeys.setString(Tag.PatientName, org.dcm4che3.data.VR.PN, freeText);
    }

    QueryService.QueryRequest request =
        new QueryService.QueryRequest(
            QueryService.InformationModel.STUDY_ROOT,
            level,
            callingAet,
            calledAet,
            associationSerialNo,
            normalizedKeys,
            freeText,
            keywordFilters,
            queryOptions.contains(QueryOption.FUZZY),
            queryOptions.contains(QueryOption.DATETIME),
            cancelRequested == null ? () -> false : cancelRequested,
            null);

    for (DimseAccessPolicy<QueryService.QueryRequest> policy : accessPolicies) {
      DimseAccessPolicy.Decision decision = policy.evaluate(request);
      if (!decision.allowed()) {
        increment("dicoogle.cfind.failure", "policy-denied");
        throw new DicomServiceException(Status.UnableToProcess, decision.reason());
      }
    }

    LOGGER.info(
        "C-FIND request association={} aet={} level={} keys={} freeText={} keywordFilters={}",
        associationSerialNo,
        callingAet,
        normalizedLevel,
        requestedKeyTags(normalizedKeys),
        freeText,
        keywordFilters.keySet());

    // Query via router — parallel dispatch to all DIM providers
    List<QueryService.QueryResult> all = router.query(request, dimProviders);
    if (all.isEmpty()) {
      increment("dicoogle.cfind.success", null);
      recordLatency("success", normalizedLevel, startNs);
      return List.of();
    }

    List<Attributes> limited =
        all.size() <= maxResults
            ? all.stream().map(QueryService.QueryResult::attributes).toList()
            : all.subList(0, maxResults).stream()
                .map(QueryService.QueryResult::attributes)
                .toList();

    increment("dicoogle.cfind.success", null);
    meterRegistry
        .counter("dicoogle.cfind.matches", "level", normalizedLevel)
        .increment(limited.size());
    recordLatency("success", normalizedLevel, startNs);
    return limited;
  }

  private String requestedKeyTags(Attributes keys) {
    StringBuilder out = new StringBuilder();
    for (int tag : keys.tags()) {
      String value = keys.getString(tag, null);
      boolean hasValue = value != null && !value.isBlank();
      if (!out.isEmpty()) {
        out.append(',');
      }
      out.append(String.format("%08X%s", tag, hasValue ? "=*" : ""));
    }
    return out.toString();
  }

  private String extractFreeText(String direct) {
    if (direct == null || direct.isBlank()) {
      return null;
    }

    StringBuilder out = new StringBuilder();
    for (String token : direct.trim().split("\\s+")) {
      if (!KEYWORD_PATTERN.matcher(token).matches()) {
        if (!out.isEmpty()) {
          out.append(' ');
        }
        out.append(token);
      }
    }
    return out.isEmpty() ? null : out.toString();
  }

  private Map<String, String> extractKeywordFilters(String raw) {
    if (raw == null || raw.isBlank()) {
      return Map.of();
    }

    Map<String, String> out = new LinkedHashMap<>();
    for (String token : raw.trim().split("\\s+")) {
      if (KEYWORD_PATTERN.matcher(token).matches()) {
        int index = token.indexOf(':');
        if (index > 0 && index < token.length() - 1) {
          out.put(token.substring(0, index), token.substring(index + 1));
        }
      }
    }
    return out;
  }

  private void increment(String meterName, String reason) {
    if (reason == null) {
      meterRegistry.counter(meterName).increment();
    } else {
      meterRegistry.counter(meterName, "reason", reason).increment();
    }
  }

  private void validateIdentifier(Attributes keys, Set<QueryOption> queryOptions)
      throws DicomServiceException {
    for (int tag : keys.tags()) {
      if (tag == Tag.QueryRetrieveLevel) {
        continue;
      }

      String value = keys.getString(tag, null);
      if (value == null || value.isBlank()) {
        continue;
      }

      VR vr = keys.getVR(tag);
      if (vr == VR.DT && containsRange(value) && !queryOptions.contains(QueryOption.DATETIME)) {
        increment("dicoogle.cfind.failure", "datetime-negotiation-required");
        throw new DicomServiceException(
            Status.IdentifierDoesNotMatchSOPClass,
            "DT range matching requires DATETIME query negotiation");
      }

      if ((vr == VR.DA || vr == VR.TM || vr == VR.DT) && hasInvalidRangeSyntax(value)) {
        increment("dicoogle.cfind.failure", "invalid-range-syntax");
        throw new DicomServiceException(
            Status.IdentifierDoesNotMatchSOPClass,
            String.format("Invalid range syntax for query key: %08X", tag));
      }
    }
  }

  private boolean containsRange(String value) {
    return value.indexOf('-') >= 0;
  }

  private boolean hasInvalidRangeSyntax(String value) {
    int firstDash = value.indexOf('-');
    if (firstDash < 0) {
      return false;
    }
    if (value.indexOf('-', firstDash + 1) >= 0) {
      return true;
    }
    String start = value.substring(0, firstDash).trim();
    String end = value.substring(firstDash + 1).trim();
    return start.isEmpty() && end.isEmpty();
  }

  private void recordLatency(String outcome, String level, long startNs) {
    Timer.builder("dicoogle.cfind.latency")
        .tag("outcome", outcome)
        .tag("level", level)
        .register(meterRegistry)
        .record(System.nanoTime() - startNs, TimeUnit.NANOSECONDS);
  }

  @SuppressWarnings("unchecked")
  private List<Attributes> fallbackToLegacy(
      Attributes keys,
      QueryRetrieveLevel level,
      int maxResults,
      long startNs,
      String normalizedLevel) {
    LOGGER.info("C-FIND no local query plugin, falling back to legacy: level={}", normalizedLevel);

    String query = buildFreetextQuery(keys);
    String[] fields = buildReturnFields(keys);

    Map<?, ?> response = legacyProxyService.searchQuery(query, fields, maxResults, 0);
    if (response == null) {
      LOGGER.warn("C-FIND legacy fallback returned null");
      increment("dicoogle.cfind.failure", "legacy-null");
      recordLatency("failure", normalizedLevel, startNs);
      return List.of();
    }

    List<?> resultList = (List<?>) response.get("results");
    if (resultList == null || resultList.isEmpty()) {
      increment("dicoogle.cfind.success", null);
      recordLatency("success", normalizedLevel, startNs);
      return List.of();
    }

    List<Attributes> results = new ArrayList<>();
    for (Object obj : resultList) {
      Map<?, ?> entry = (Map<?, ?>) obj;
      Map<?, ?> fieldsMap = (Map<?, ?>) entry.get("fields");
      Attributes attrs = new Attributes();
      attrs.setString(Tag.QueryRetrieveLevel, VR.CS, level.name());
      if (fieldsMap != null) {
        for (Map.Entry<?, ?> f : fieldsMap.entrySet()) {
          String keyword = (String) f.getKey();
          int tag = ElementDictionary.tagForKeyword(keyword, null);
          if (tag != -1 && f.getValue() != null) {
            VR vr = ElementDictionary.vrOf(tag, null);
            if (vr == null || vr == VR.UN || vr == VR.SQ) {
              vr = VR.LO;
            }
            attrs.setString(tag, vr, String.valueOf(f.getValue()));
          }
        }
      }
      filterByLevel(attrs, level);
      results.add(attrs);
    }

    List<Attributes> limited =
        results.size() <= maxResults ? results : results.subList(0, maxResults);
    increment("dicoogle.cfind.success", null);
    meterRegistry
        .counter("dicoogle.cfind.matches", "level", normalizedLevel)
        .increment(limited.size());
    LOGGER.info("C-FIND legacy fallback returned {} matches", limited.size());
    recordLatency("success", normalizedLevel, startNs);
    return limited;
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

  private String[] buildReturnFields(Attributes keys) {
    List<String> fields = new ArrayList<>();
    for (int tag : keys.tags()) {
      if (tag == Tag.QueryRetrieveLevel) {
        continue;
      }
      String value = keys.getString(tag, null);
      if (value == null || value.isBlank()) {
        String keyword = ElementDictionary.keywordOf(tag, null);
        if (keyword != null) {
          fields.add(keyword);
        }
      }
    }
    if (fields.isEmpty()) {
      return new String[] {
        "SOPInstanceUID",
        "StudyInstanceUID",
        "SeriesInstanceUID",
        "PatientID",
        "PatientName",
        "PatientSex",
        "Modality",
        "StudyDate",
        "StudyID",
        "StudyDescription",
        "SeriesNumber",
        "SeriesDescription",
        "InstitutionName",
        "InstanceNumber"
      };
    }
    return fields.toArray(new String[0]);
  }

  private void filterByLevel(Attributes attrs, QueryRetrieveLevel level) {
    if (level == QueryRetrieveLevel.STUDY) {
      attrs.setNull(Tag.SeriesInstanceUID, VR.UI);
      attrs.setNull(Tag.SOPInstanceUID, VR.UI);
    } else if (level == QueryRetrieveLevel.SERIES) {
      attrs.setNull(Tag.SOPInstanceUID, VR.UI);
    }
  }
}
