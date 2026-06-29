package org.dicoogle.protocol.dicomweb;

import jakarta.json.Json;
import jakarta.json.stream.JsonGenerator;
import java.io.StringWriter;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.ElementDictionary;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dcm4che3.json.JSONWriter;
import org.dicoogle.core.query.QueryRouter;
import org.dicoogle.sdk.query.QueryRetrieveLevel;
import org.dicoogle.sdk.query.QueryService;
import org.springframework.stereotype.Service;
import org.springframework.util.MultiValueMap;

@Service
public class DicomwebQidoService {

  private static final Pattern KEYWORD_PATTERN = Pattern.compile("[A-Za-z0-9_.-]+:[^\\s]+");
  private static final Set<String> RESERVED_PARAMS =
      Set.of("fuzzymatching", "limit", "offset", "includefield", "provider", "_rawquery");

  private final QueryRouter router;

  public DicomwebQidoService(QueryRouter router) {
    this.router = router;
  }

  public boolean hasQueryPlugins() {
    return router.queryPluginCount() > 0;
  }

  public String searchStudies(MultiValueMap<String, String> queryParams) {
    return searchStudies(queryParams, null);
  }

  public String searchStudies(MultiValueMap<String, String> queryParams, String provider) {
    return search(QueryRetrieveLevel.STUDY, null, null, queryParams, provider).dicomJson();
  }

  public SearchResultSet searchStudiesWithUris(
      MultiValueMap<String, String> queryParams, String provider) {
    return search(QueryRetrieveLevel.STUDY, null, null, queryParams, provider);
  }

  public String searchSeries(String studyInstanceUid, MultiValueMap<String, String> queryParams) {
    return search(QueryRetrieveLevel.SERIES, studyInstanceUid, null, queryParams, null).dicomJson();
  }

  public String searchInstances(
      String studyInstanceUid,
      String seriesInstanceUid,
      MultiValueMap<String, String> queryParams) {
    return search(QueryRetrieveLevel.IMAGE, studyInstanceUid, seriesInstanceUid, queryParams, null)
        .dicomJson();
  }

  private SearchResultSet search(
      QueryRetrieveLevel level,
      String pathStudyUid,
      String pathSeriesUid,
      MultiValueMap<String, String> queryParams,
      String provider) {
    ParsedQuery query = parseQuery(level, pathStudyUid, pathSeriesUid, queryParams);
    QueryService.QueryRequest request =
        new QueryService.QueryRequest(
            QueryService.InformationModel.STUDY_ROOT,
            level,
            "QIDO-SCU",
            "DICOOGLE",
            0,
            query.keys(),
            query.freeText(),
            query.keywordFilters(),
            query.fuzzyMatchingEnabled(),
            false,
            () -> false,
            query.rawQuery());

    List<AttrsWithUri> raw = runQuery(request, provider);
    if (raw == null || raw.isEmpty()) {
      return new SearchResultSet(toDicomJson(List.of()), List.of());
    }
    List<AttrsWithUri> deduplicated = deduplicateByLevel(raw, level);
    List<AttrsWithUri> projected =
        applyIncludeFieldProjection(deduplicated, level, query.includeFields());
    List<AttrsWithUri> paged = paginate(projected, query.offset(), query.limit());
    String dicomJson = toDicomJson(paged.stream().map(AttrsWithUri::attrs).toList());
    List<URI> uris = paged.stream().map(AttrsWithUri::uri).toList();
    return new SearchResultSet(dicomJson, uris);
  }

  private List<AttrsWithUri> runQuery(QueryService.QueryRequest request, String provider) {
    List<QueryService.QueryResult> results;
    if (provider != null && !provider.isBlank()) {
      List<String> names =
          java.util.Arrays.stream(provider.split(","))
              .map(String::trim)
              .filter(n -> !n.isEmpty())
              .toList();
      results = router.query(request, names);
    } else {
      results = router.queryAll(request);
    }
    if (results == null || results.isEmpty()) {
      return List.of();
    }
    return results.stream().map(r -> new AttrsWithUri(r.attributes(), r.storageUri())).toList();
  }

  private ParsedQuery parseQuery(
      QueryRetrieveLevel level,
      String pathStudyUid,
      String pathSeriesUid,
      MultiValueMap<String, String> queryParams) {
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, level.name());

    String fuzzy = firstValue(queryParams, "fuzzymatching");
    boolean fuzzyEnabled = fuzzy != null && Boolean.parseBoolean(fuzzy);
    int limit = parseIntegerParam(firstValue(queryParams, "limit"), "limit", 0, Integer.MAX_VALUE);
    int offset =
        parseIntegerParam(firstValue(queryParams, "offset"), "offset", 0, Integer.MAX_VALUE);

    IncludeFields includeFields = parseIncludeFields(queryParams.get("includefield"));

    for (Map.Entry<String, List<String>> entry : queryParams.entrySet()) {
      String rawKey = entry.getKey();
      if (rawKey == null) {
        continue;
      }
      String normalizedKey = rawKey.trim().toLowerCase(Locale.ROOT);
      if (RESERVED_PARAMS.contains(normalizedKey)) {
        continue;
      }

      int tag = resolveTag(rawKey);
      if (tag < 0) {
        throw new IllegalArgumentException("Unsupported QIDO key: " + rawKey);
      }

      String value = normalizeParamValues(entry.getValue());
      if (value == null || value.isBlank()) {
        continue;
      }

      VR vr = ElementDictionary.vrOf(tag, null);
      keys.setString(tag, vr == null ? VR.LO : vr, value);
    }

    if (pathStudyUid != null) {
      enforcePathUid(keys, Tag.StudyInstanceUID, pathStudyUid, "StudyInstanceUID");
    }
    if (pathSeriesUid != null) {
      enforcePathUid(keys, Tag.SeriesInstanceUID, pathSeriesUid, "SeriesInstanceUID");
    }

    String rawPatientName = keys.getString(Tag.PatientName, null);
    String freeText = extractFreeText(rawPatientName);
    Map<String, String> keywordFilters = extractKeywordFilters(rawPatientName);
    if (freeText == null || freeText.isBlank()) {
      keys.setNull(Tag.PatientName, VR.PN);
    } else {
      keys.setString(Tag.PatientName, VR.PN, freeText);
    }

    String rawQuery = firstValue(queryParams, "_rawQuery");

    return new ParsedQuery(
        keys, freeText, keywordFilters, fuzzyEnabled, limit, offset, includeFields, rawQuery);
  }

  private IncludeFields parseIncludeFields(List<String> rawIncludeValues) {
    if (rawIncludeValues == null || rawIncludeValues.isEmpty()) {
      return IncludeFields.none();
    }

    boolean all = false;
    Set<Integer> tags = new LinkedHashSet<>();
    for (String raw : rawIncludeValues) {
      if (raw == null || raw.isBlank()) {
        continue;
      }
      for (String token : raw.split(",")) {
        String field = token.trim();
        if (field.isEmpty()) {
          continue;
        }
        if (field.equalsIgnoreCase("all")) {
          all = true;
          continue;
        }
        int tag = resolveTag(field);
        if (tag < 0) {
          throw new IllegalArgumentException("Unsupported includefield value: " + field);
        }
        tags.add(tag);
      }
    }
    return new IncludeFields(all, tags);
  }

  private List<AttrsWithUri> deduplicateByLevel(
      List<AttrsWithUri> values, QueryRetrieveLevel level) {
    Map<String, AttrsWithUri> byKey = new LinkedHashMap<>();
    for (AttrsWithUri item : values) {
      String key = dedupKey(item.attrs(), level);
      if (key == null) {
        key = "row-" + byKey.size();
      }
      byKey.putIfAbsent(key, item);
    }
    return List.copyOf(byKey.values());
  }

  private String dedupKey(Attributes attrs, QueryRetrieveLevel level) {
    String study = attrs.getString(Tag.StudyInstanceUID, null);
    String series = attrs.getString(Tag.SeriesInstanceUID, null);
    String sop = attrs.getString(Tag.SOPInstanceUID, null);

    return switch (level) {
      case STUDY -> study;
      case SERIES -> study != null && series != null ? study + "|" + series : null;
      case IMAGE ->
          study != null && series != null && sop != null ? study + "|" + series + "|" + sop : null;
    };
  }

  private List<AttrsWithUri> applyIncludeFieldProjection(
      List<AttrsWithUri> values, QueryRetrieveLevel level, IncludeFields includeFields) {
    if (includeFields.includeAll() || includeFields.tags().isEmpty()) {
      return values;
    }

    Set<Integer> required = requiredTags(level);
    List<AttrsWithUri> out = new ArrayList<>(values.size());
    for (AttrsWithUri item : values) {
      Attributes dst = new Attributes();
      for (int tag : includeFields.tags()) {
        copyTagIfPresent(item.attrs(), dst, tag);
      }
      for (int tag : required) {
        copyTagIfPresent(item.attrs(), dst, tag);
      }
      out.add(new AttrsWithUri(dst, item.uri()));
    }
    return out;
  }

  private Set<Integer> requiredTags(QueryRetrieveLevel level) {
    return switch (level) {
      case STUDY -> Set.of(Tag.StudyInstanceUID);
      case SERIES -> Set.of(Tag.StudyInstanceUID, Tag.SeriesInstanceUID);
      case IMAGE -> Set.of(Tag.StudyInstanceUID, Tag.SeriesInstanceUID, Tag.SOPInstanceUID);
    };
  }

  private void copyTagIfPresent(Attributes src, Attributes dst, int tag) {
    Object value = src.getValue(tag);
    VR vr = src.getVR(tag);
    if (value != null && vr != null) {
      dst.setValue(tag, vr, value);
    }
  }

  private List<AttrsWithUri> paginate(List<AttrsWithUri> values, int offset, int limit) {
    if (offset >= values.size()) {
      return List.of();
    }
    int fromIndex = Math.max(0, offset);
    if (limit == 0) {
      return values.subList(fromIndex, values.size());
    }
    int toIndex = Math.min(values.size(), fromIndex + limit);
    return values.subList(fromIndex, toIndex);
  }

  private int resolveTag(String key) {
    int keywordTag = ElementDictionary.tagForKeyword(key, null);
    if (keywordTag >= 0) {
      return keywordTag;
    }

    String normalized = key.replace(",", "").trim();
    if (normalized.length() == 8) {
      try {
        return Integer.parseInt(normalized, 16);
      } catch (NumberFormatException ignored) {
        return -1;
      }
    }
    return -1;
  }

  private void enforcePathUid(Attributes keys, int tag, String expected, String name) {
    String current = keys.getString(tag, null);
    if (current != null && !current.isBlank() && !current.equals(expected)) {
      throw new IllegalArgumentException(name + " query parameter conflicts with path UID");
    }
    keys.setString(tag, VR.UI, expected);
  }

  private int parseIntegerParam(String raw, String name, int min, int max) {
    if (raw == null || raw.isBlank()) {
      return 0;
    }
    try {
      int value = Integer.parseInt(raw);
      if (value < min || value > max) {
        throw new IllegalArgumentException(name + " must be between " + min + " and " + max);
      }
      return value;
    } catch (NumberFormatException ex) {
      throw new IllegalArgumentException(name + " must be a valid integer", ex);
    }
  }

  private String firstValue(MultiValueMap<String, String> params, String name) {
    List<String> values = params.get(name);
    if (values == null || values.isEmpty()) {
      return null;
    }
    return values.getFirst();
  }

  private String normalizeParamValues(List<String> values) {
    if (values == null || values.isEmpty()) {
      return null;
    }
    List<String> out = new ArrayList<>();
    for (String value : values) {
      if (value == null || value.isBlank()) {
        continue;
      }
      for (String part : value.split(",")) {
        String token = part.trim();
        if (!token.isEmpty()) {
          out.add(token);
        }
      }
    }
    if (out.isEmpty()) {
      return null;
    }
    return String.join("\\", out);
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

  private String toDicomJson(List<Attributes> attributesList) {
    StringWriter output = new StringWriter();
    try (JsonGenerator generator = Json.createGenerator(output)) {
      generator.writeStartArray();
      JSONWriter writer = new JSONWriter(generator);
      for (Attributes attributes : attributesList) {
        writer.write(attributes);
      }
      generator.writeEnd();
    }
    return output.toString();
  }

  record SearchResultSet(String dicomJson, List<URI> storageUris) {}

  private record AttrsWithUri(Attributes attrs, URI uri) {}

  private record ParsedQuery(
      Attributes keys,
      String freeText,
      Map<String, String> keywordFilters,
      boolean fuzzyMatchingEnabled,
      int limit,
      int offset,
      IncludeFields includeFields,
      String rawQuery) {}

  private record IncludeFields(boolean includeAll, Set<Integer> tags) {
    static IncludeFields none() {
      return new IncludeFields(false, Set.of());
    }
  }
}
