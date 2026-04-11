package org.dicoogle.protocol.dimse;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.net.Status;
import org.dcm4che3.net.service.DicomServiceException;
import org.dicoogle.sdk.query.DimseFindServicePlugin;

public class CFindService {

  private static final String STUDY_ROOT_MODEL_UID = "1.2.840.10008.5.1.4.1.2.2.1";
  private static final Pattern KEYWORD_PATTERN = Pattern.compile("[A-Za-z0-9_.-]+:[^\\s]+");

  private final List<DimseFindServicePlugin> plugins;
  private final Set<String> supportedLevels;

  public CFindService(List<DimseFindServicePlugin> plugins, DimseCFindProperties properties) {
    this.plugins = List.copyOf(plugins);
    this.supportedLevels =
        properties.getSupportedQueryLevels().stream()
            .map(level -> level.toUpperCase(Locale.ROOT))
            .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
  }

  public List<Attributes> find(
      String affectedSopClassUid,
      Attributes keys,
      String callingAet,
      String calledAet,
      int associationSerialNo)
      throws DicomServiceException {
    if (!STUDY_ROOT_MODEL_UID.equals(affectedSopClassUid)) {
      throw new DicomServiceException(
          Status.SOPclassNotSupported, "Only Study Root C-FIND is supported");
    }

    String queryLevel = keys.getString(Tag.QueryRetrieveLevel);
    if (queryLevel == null || queryLevel.isBlank()) {
      throw new DicomServiceException(
          Status.IdentifierDoesNotMatchSOPClass, "Missing QueryRetrieveLevel");
    }

    String normalizedLevel = queryLevel.trim().toUpperCase(Locale.ROOT);
    if (!supportedLevels.contains(normalizedLevel)) {
      throw new DicomServiceException(
          Status.UnableToProcess, "Unsupported QueryRetrieveLevel: " + normalizedLevel);
    }

    DimseFindServicePlugin.QueryRetrieveLevel level;
    try {
      level = DimseFindServicePlugin.QueryRetrieveLevel.valueOf(normalizedLevel);
    } catch (IllegalArgumentException ex) {
      throw new DicomServiceException(Status.UnableToProcess, "Invalid QueryRetrieveLevel");
    }

    if (plugins.isEmpty()) {
      throw new DicomServiceException(
          Status.UnableToProcess, "No DIMSE query plugin is configured");
    }

    String freeText = extractFreeText(keys);
    Map<String, String> keywordFilters = extractKeywordFilters(keys);
    DimseFindServicePlugin.FindRequest request =
        new DimseFindServicePlugin.FindRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            level,
            callingAet,
            calledAet,
            associationSerialNo,
            keys,
            freeText,
            keywordFilters);

    for (DimseFindServicePlugin plugin : plugins) {
      try {
        List<Attributes> matches = plugin.find(request);
        if (matches != null) {
          return matches;
        }
      } catch (IOException ex) {
        throw new DicomServiceException(Status.UnableToProcess, ex.getMessage());
      }
    }

    return List.of();
  }

  private String extractFreeText(Attributes keys) {
    String direct = keys.getString(Tag.PatientName);
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

  private Map<String, String> extractKeywordFilters(Attributes keys) {
    String raw = keys.getString(Tag.PatientName);
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
}
