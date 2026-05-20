package org.dicoogle.protocol.dimse;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.io.IOException;
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
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dcm4che3.net.QueryOption;
import org.dcm4che3.net.Status;
import org.dcm4che3.net.service.DicomServiceException;
import org.dicoogle.sdk.query.DimseAccessPolicy;
import org.dicoogle.sdk.query.QueryRetrieveLevel;
import org.dicoogle.sdk.query.QueryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CFindService {

  private static final String STUDY_ROOT_MODEL_UID = "1.2.840.10008.5.1.4.1.2.2.1";
  private static final Pattern KEYWORD_PATTERN = Pattern.compile("[A-Za-z0-9_.-]+:[^\\s]+");
  private static final Logger LOGGER = LoggerFactory.getLogger(CFindService.class);

  private final List<QueryService> plugins;
  private final List<DimseAccessPolicy<QueryService.QueryRequest>> accessPolicies;
  private final Set<String> supportedLevels;
  private final int maxResults;
  private final MeterRegistry meterRegistry;

  public CFindService(
      List<QueryService> plugins,
      List<DimseAccessPolicy<QueryService.QueryRequest>> accessPolicies,
      DimseCFindProperties properties,
      MeterRegistry meterRegistry) {
    this.plugins = List.copyOf(plugins);
    this.accessPolicies = List.copyOf(accessPolicies);
    this.supportedLevels =
        properties.getSupportedQueryLevels().stream()
            .map(level -> level.toUpperCase(Locale.ROOT))
            .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    this.maxResults = properties.getMaxResults();
    this.meterRegistry = meterRegistry;
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

    if (plugins.isEmpty()) {
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
            cancelRequested == null ? () -> false : cancelRequested);

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

    for (QueryService plugin : plugins) {
      try {
        List<Attributes> matches = plugin.query(request);
        if (matches != null) {
          List<Attributes> limited =
              matches.size() <= maxResults ? matches : matches.subList(0, maxResults);
          increment("dicoogle.cfind.success", null);
          meterRegistry
              .counter("dicoogle.cfind.matches", "level", normalizedLevel)
              .increment(limited.size());
          recordLatency("success", normalizedLevel, startNs);
          return limited;
        }
      } catch (IOException ex) {
        increment("dicoogle.cfind.failure", "plugin-io");
        recordLatency("failure", normalizedLevel, startNs);
        throw new DicomServiceException(Status.UnableToProcess, ex.getMessage());
      }
    }

    increment("dicoogle.cfind.success", null);
    recordLatency("success", normalizedLevel, startNs);
    return List.of();
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
}
