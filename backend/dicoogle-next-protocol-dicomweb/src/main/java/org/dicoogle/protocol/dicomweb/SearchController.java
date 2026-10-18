package org.dicoogle.protocol.dicomweb;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.dicoogle.protocol.legacyproxy.LegacyProxyService;
import org.dicoogle.protocol.legacyproxy.config.LegacyProxyProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Legacy-compatible search endpoints for the dicoogle-next UI.
 *
 * <p>The dicoogle-next frontend's SearchStore calls {@code GET /search?query=...} and expects a
 * flat JSON response shaped like:
 *
 * <pre>
 * {
 *   "numResults": 3,
 *   "results": [
 *     { "uri": "file:///...", "fields": { "PatientName": "FELIX", "SOPInstanceUID": "...", ... } },
 *     ...
 *   ]
 * }
 * </pre>
 *
 * <p>To stay compatible with the Dicoogle 3 API, {@code /search} returns one entry per matching SOP
 * instance, without any aggregation. The {@code /searchDIM} endpoint returns the hierarchical
 * patient → study → series → image tree for consumers that want an aggregated view.
 *
 * <p>These endpoints reuse {@link DicomwebQidoService} and {@link DicomTagTransformer} — no
 * duplicate query logic.
 */
@RestController
public class SearchController {

  private static final Logger log = LoggerFactory.getLogger(SearchController.class);

  private static final MediaType APPLICATION_JSON_UTF8 =
      MediaType.parseMediaType("application/json;charset=UTF-8");

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private static final int DEFAULT_DIM_DEPTH = 4;
  private static final int MAX_DIM_DEPTH = 4;

  private final DicomwebQidoService qidoService;
  private final LegacyProxyService legacyProxyService;
  private final LegacyProxyProperties legacyProxyProperties;

  public SearchController(
      DicomwebQidoService qidoService,
      @org.springframework.beans.factory.annotation.Autowired(required = false)
          LegacyProxyService legacyProxyService,
      @org.springframework.beans.factory.annotation.Autowired(required = false)
          LegacyProxyProperties legacyProxyProperties) {
    this.qidoService = qidoService;
    this.legacyProxyService = legacyProxyService;
    this.legacyProxyProperties = legacyProxyProperties;
  }

  /**
   * Legacy {@code /search} endpoint — returns a flat list of all matching SOP instances.
   *
   * <p>Accepts:
   *
   * <ul>
   *   <li>{@code query} – free-text or keyword query string (e.g. {@code PatientName:FELIX})
   *   <li>{@code provider} – optional plugin provider name (ignored, kept for API compat)
   *   <li>{@code offset} – number of results to skip (default 0)
   *   <li>{@code limit} – maximum number of results to return (default 0 = all)
   *   <li>{@code psize} – legacy alias for {@code limit} (used when {@code limit} is absent)
   *   <li>{@code field} – DICOM keyword to include in results (repeatable)
   * </ul>
   */
  @GetMapping(value = "/search", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> search(
      @RequestParam(value = "query", required = false, defaultValue = "") String query,
      @RequestParam(value = "provider", required = false) String provider,
      @RequestParam(value = "offset", required = false, defaultValue = "0") int offset,
      @RequestParam(value = "limit", required = false, defaultValue = "0") int limit,
      @RequestParam(value = "psize", required = false, defaultValue = "0") int psize,
      @RequestParam(value = "field", required = false) String[] field) {

    int effectiveLimit = limit > 0 ? limit : psize;
    boolean useLegacy = shouldUseLegacy();

    long start = System.nanoTime();
    ArrayNode entries = acquireEntries(query, provider, offset, effectiveLimit, field, useLegacy);
    long elapsedNanos = System.nanoTime() - start;

    String body = buildLegacySearchResponse(entries, elapsedNanos);
    return ResponseEntity.ok().contentType(APPLICATION_JSON_UTF8).body(body);
  }

  /**
   * Legacy {@code /searchDIM} endpoint — returns the DIM tree as a hierarchical JSON document.
   *
   * <p>Accepts the same query parameters as {@code /search}, plus:
   *
   * <ul>
   *   <li>{@code depth} – one of {@code none} (0), {@code patient} (1), {@code study} (2), {@code
   *       series} (3), {@code image} (4). Defaults to {@code image}.
   * </ul>
   *
   * <p>The {@code offset} and {@code psize} parameters paginate at the patient level, matching
   * legacy Dicoogle behaviour.
   */
  @GetMapping(value = "/searchDIM", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> searchDim(
      @RequestParam(value = "query", required = false, defaultValue = "") String query,
      @RequestParam(value = "provider", required = false) String provider,
      @RequestParam(value = "offset", required = false, defaultValue = "0") int offset,
      @RequestParam(value = "psize", required = false, defaultValue = "0") int psize,
      @RequestParam(value = "depth", required = false) String depth,
      @RequestParam(value = "field", required = false) String[] field) {

    int dimDepth = parseDepth(depth);
    boolean useLegacy = shouldUseLegacy();

    // Pagination is applied at the patient level after the tree is built,
    // so the underlying query must not be paginated itself.
    long start = System.nanoTime();
    ArrayNode entries = acquireEntries(query, provider, 0, 0, field, useLegacy);
    long elapsedNanos = System.nanoTime() - start;

    String body = buildDimResponse(entries, dimDepth, offset, psize, elapsedNanos);
    return ResponseEntity.ok().contentType(APPLICATION_JSON_UTF8).body(body);
  }

  private boolean shouldUseLegacy() {
    boolean hasQueryPlugin = qidoService.hasQueryPlugins();
    boolean useLegacy =
        legacyProxyProperties != null
            && legacyProxyProperties.shouldUseLegacyForQueryIndex(hasQueryPlugin);
    if (useLegacy && legacyProxyService == null) {
      throw new ResponseStatusException(
          org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,
          "Legacy proxy expected but not available");
    }
    return useLegacy;
  }

  /**
   * Collects the matching instances as {@code {uri, fields}} entries, either from the local query
   * plugins or, when configured, from a legacy Dicoogle instance.
   */
  private ArrayNode acquireEntries(
      String query, String provider, int offset, int limit, String[] field, boolean useLegacy) {
    if (useLegacy) {
      return legacyEntries(query, offset, limit, field);
    }
    return localEntries(query, provider, offset, limit, field);
  }

  private ArrayNode localEntries(
      String query, String provider, int offset, int limit, String[] field) {
    MultiValueMap<String, String> qidoParams = buildQidoParams(query);
    qidoParams.add("_rawQuery", query);
    if (offset > 0) {
      qidoParams.add("offset", String.valueOf(offset));
    }
    if (limit > 0) {
      qidoParams.add("limit", String.valueOf(limit));
    }
    if (field != null) {
      for (String f : field) {
        qidoParams.add("includefield", f);
      }
    }

    DicomwebQidoService.SearchResultSet resultSet =
        qidoService.searchInstancesWithUris(qidoParams, provider);
    return toResultEntries(resultSet);
  }

  private ArrayNode legacyEntries(String query, int offset, int limit, String[] field) {
    // Legacy Dicoogle rejects empty query with HTTP 400 — use "*" for wildcard
    String legacyQuery = (query == null || query.isBlank()) ? "*" : query;
    log.info("No local query plugin, falling back to legacy: query={}", legacyQuery);

    int maxResults = limit > 0 ? limit : 1000;
    Map<?, ?> legacyResponse =
        legacyProxyService.searchQuery(legacyQuery, field, maxResults, offset);
    if (legacyResponse == null) {
      log.warn("Legacy /search returned null");
      return MAPPER.createArrayNode();
    }
    try {
      JsonNode root = MAPPER.valueToTree(legacyResponse);
      return normaliseEntries(root.get("results"));
    } catch (Exception e) {
      log.error("Failed to serialize legacy search response", e);
      return MAPPER.createArrayNode();
    }
  }

  private ArrayNode toResultEntries(DicomwebQidoService.SearchResultSet resultSet) {
    try {
      String keywordJson = DicomTagTransformer.transformResultArray(resultSet.dicomJson());
      JsonNode results = MAPPER.readTree(keywordJson);
      List<URI> uris = resultSet.storageUris();

      ArrayNode entries = MAPPER.createArrayNode();
      if (results.isArray()) {
        for (int i = 0; i < results.size(); i++) {
          ObjectNode fields = normaliseResult((ObjectNode) results.get(i));
          ObjectNode entry = MAPPER.createObjectNode();
          String uri = i < uris.size() && uris.get(i) != null ? uris.get(i).toString() : null;
          entry.put("uri", uri);
          entry.set("fields", fields);
          entries.add(entry);
        }
      }
      return entries;
    } catch (Exception e) {
      throw new RuntimeException("Failed to build search entries", e);
    }
  }

  /** Normalises a {@code results} array from a legacy Dicoogle response. */
  private ArrayNode normaliseEntries(JsonNode results) {
    ArrayNode entries = MAPPER.createArrayNode();
    if (results == null || !results.isArray()) {
      return entries;
    }
    for (JsonNode item : results) {
      if (!item.isObject()) {
        continue;
      }
      ObjectNode entry = (ObjectNode) item;
      if (entry.has("fields") && entry.get("fields").isObject()) {
        normaliseResult((ObjectNode) entry.get("fields"));
      }
      entries.add(entry);
    }
    return entries;
  }

  /**
   * Converts a legacy query string into QIDO-RS compatible params.
   *
   * <p>Legacy Dicoogle supported two modes:
   *
   * <ul>
   *   <li>Free-text: {@code query=felix} → mapped to {@code PatientName=felix}
   *   <li>Keyword: {@code query=PatientName:FELIX} → mapped to {@code PatientName=FELIX}
   * </ul>
   */
  private MultiValueMap<String, String> buildQidoParams(String query) {
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    if (query == null || query.isBlank()) {
      // empty query — return all (no filters)
      return params;
    }

    // Wildcard "*:*" means "return all" — no filters
    if ("*:*".equals(query.trim()) || "*".equals(query.trim())) {
      return params;
    }

    // Detect keyword mode: "Key:Value" pairs separated by spaces
    boolean hasKeywordPairs = false;
    for (String token : query.trim().split("\\s+")) {
      int colon = token.indexOf(':');
      if (colon > 0 && colon < token.length() - 1) {
        hasKeywordPairs = true;
        break;
      }
    }

    if (hasKeywordPairs) {
      // Keyword mode: expect "Key:Value" pairs separated by spaces
      for (String token : query.trim().split("\\s+")) {
        int colon = token.indexOf(':');
        if (colon > 0 && colon < token.length() - 1) {
          String key = token.substring(0, colon);
          String value = token.substring(colon + 1);
          if ("*".equals(key)) {
            continue;
          }
          params.add(key, value);
        }
      }
    } else {
      // Free-text mode: treat the whole string as a PatientName search
      params.add("PatientName", query);
      params.add("fuzzymatching", "true");
    }

    return params;
  }

  /**
   * Builds a legacy-compatible flat search response:
   *
   * <pre>
   * {"results": [{"uri": "file:///...", "fields": {...}}, ...], "elapsedTime": N, "numResults": N}
   * </pre>
   */
  private String buildLegacySearchResponse(ArrayNode entries, long elapsedNanos) {
    try {
      ObjectNode response = MAPPER.createObjectNode();
      response.set("results", entries);
      response.put("elapsedTime", TimeUnit.NANOSECONDS.toMillis(elapsedNanos));
      response.put("numResults", entries.size());
      return MAPPER.writeValueAsString(response);
    } catch (Exception e) {
      throw new RuntimeException("Failed to build search response", e);
    }
  }

  // ---------------------------------------------------------------------------
  // /searchDIM — hierarchical DIM tree
  // ---------------------------------------------------------------------------

  private int parseDepth(String raw) {
    if (raw == null || raw.isBlank()) {
      return DEFAULT_DIM_DEPTH;
    }
    String value = raw.trim().toLowerCase(Locale.ROOT);
    switch (value) {
      case "none":
        return 0;
      case "patient":
        return 1;
      case "study":
        return 2;
      case "series":
        return 3;
      case "image":
        return MAX_DIM_DEPTH;
      default:
        break;
    }
    try {
      int numeric = Integer.parseInt(value);
      if (numeric < 0) {
        numeric = 0;
      }
      return Math.min(numeric, MAX_DIM_DEPTH);
    } catch (NumberFormatException e) {
      throw new ResponseStatusException(
          org.springframework.http.HttpStatus.BAD_REQUEST,
          "Invalid parameter depth: must be one of 'none', 'patient', 'study', 'series' or "
              + "'image'");
    }
  }

  /**
   * Builds the DIM tree (patient → study → series → image) from flat instance entries.
   *
   * <p>Mirrors the shape produced by legacy Dicoogle's {@code DIMGeneric.getJSONObject}, including
   * the {@code depth} cut-off and patient-level pagination.
   */
  private String buildDimResponse(
      ArrayNode entries, int depth, int offset, int psize, long elapsedNanos) {

    Map<String, DimPatient> patients = new LinkedHashMap<>();
    Map<String, DimStudy> studies = new LinkedHashMap<>();
    Map<String, DimSeries> seriesMap = new LinkedHashMap<>();

    for (JsonNode node : entries) {
      if (!node.isObject()) {
        continue;
      }
      ObjectNode entry = (ObjectNode) node;
      ObjectNode fields =
          entry.has("fields") && entry.get("fields").isObject()
              ? (ObjectNode) entry.get("fields")
              : MAPPER.createObjectNode();

      String patientId = text(fields, "PatientID");
      String patientName = text(fields, "PatientName");
      String patientKey =
          (patientId != null && !patientId.isBlank())
              ? patientId
              : (patientName != null ? patientName : "");

      DimPatient patient =
          patients.computeIfAbsent(
              patientKey,
              k ->
                  new DimPatient(
                      patientId != null ? patientId : "",
                      patientName != null ? patientName : "",
                      text(fields, "PatientSex"),
                      text(fields, "PatientBirthDate")));

      String studyUid = text(fields, "StudyInstanceUID");
      if (studyUid == null) {
        continue;
      }
      String studyKey = patientKey + "\u0000" + studyUid;
      DimStudy study =
          studies.computeIfAbsent(
              studyKey,
              k -> {
                DimStudy s =
                    new DimStudy(
                        studyUid,
                        text(fields, "StudyDate"),
                        text(fields, "StudyDescription"),
                        text(fields, "InstitutionName"));
                patient.studies.add(s);
                return s;
              });
      String modality = text(fields, "Modality");
      if (modality != null && !modality.isBlank()) {
        study.modalities.add(modality);
      }

      String seriesUid = text(fields, "SeriesInstanceUID");
      if (seriesUid == null) {
        continue;
      }
      String seriesKey = studyKey + "\u0000" + seriesUid;
      DimSeries series =
          seriesMap.computeIfAbsent(
              seriesKey,
              k -> {
                DimSeries s =
                    new DimSeries(
                        seriesUid,
                        text(fields, "SeriesDescription"),
                        modality,
                        parseInteger(text(fields, "SeriesNumber")));
                study.series.add(s);
                return s;
              });

      String sopUid = text(fields, "SOPInstanceUID");
      if (sopUid != null) {
        String uri = text(entry, "uri");
        series.images.add(new DimImage(sopUid, uri, parseInteger(text(fields, "InstanceNumber"))));
      }
    }

    ObjectNode root = MAPPER.createObjectNode();
    root.put("numResults", patients.size());
    root.put("elapsedTime", TimeUnit.NANOSECONDS.toMillis(elapsedNanos));

    if (depth < 1) {
      return writeJson(root);
    }

    ArrayNode results = root.putArray("results");
    int effectivePsize = psize > 0 ? psize : patients.size();
    int patientCount = 0;
    for (DimPatient patient : patients.values()) {
      patientCount++;
      if (patientCount <= offset) {
        continue;
      }
      if (patientCount > offset + effectivePsize) {
        break;
      }

      ObjectNode patientJson = results.addObject();
      patientJson.put("id", patient.id);
      patientJson.put("name", patient.name);
      patientJson.put("gender", patient.gender == null ? "" : patient.gender);
      patientJson.put("nStudies", patient.studies.size());
      patientJson.put("birthdate", patient.birthdate == null ? "" : patient.birthdate);

      if (depth < 2) {
        continue;
      }

      ArrayNode studiesJson = patientJson.putArray("studies");
      for (DimStudy study : patient.studies) {
        ObjectNode studyJson = studiesJson.addObject();
        studyJson.put("studyInstanceUID", study.studyInstanceUID);
        studyJson.put("studyDate", nullToEmpty(study.studyDate));
        studyJson.put("studyDescription", nullToEmpty(study.studyDescription));
        studyJson.put("institutionName", nullToEmpty(study.institutionName));
        studyJson.put("modalities", String.join(",", study.modalities));

        if (depth < 3) {
          continue;
        }

        ArrayNode seriesJson = studyJson.putArray("series");
        for (DimSeries series : study.series) {
          ObjectNode seriesObj = seriesJson.addObject();
          seriesObj.put("serieNumber", series.seriesNumber == null ? 0 : series.seriesNumber);
          seriesObj.put("serieInstanceUID", series.seriesInstanceUID);
          seriesObj.put("serieDescription", nullToEmpty(series.seriesDescription));
          seriesObj.put("serieModality", nullToEmpty(series.modality));

          if (depth < 4) {
            continue;
          }

          ArrayNode images = seriesObj.putArray("images");
          for (DimImage image : series.images) {
            ObjectNode imageJson = images.addObject();
            imageJson.put("sopInstanceUID", image.sopInstanceUID);
            imageJson.put("rawPath", image.rawPath);
            imageJson.put("uri", image.uri);
            imageJson.put("filename", image.filename);
            if (image.number != null) {
              imageJson.put("number", image.number);
            }
          }
        }
      }
    }

    return writeJson(root);
  }

  private static String writeJson(ObjectNode node) {
    try {
      return MAPPER.writeValueAsString(node);
    } catch (Exception e) {
      throw new RuntimeException("Failed to build DIM response", e);
    }
  }

  private static String nullToEmpty(String value) {
    return value == null ? "" : value;
  }

  private static Integer parseInteger(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    String normalized = value.trim();
    if (normalized.endsWith(".0")) {
      normalized = normalized.substring(0, normalized.length() - 2);
    }
    try {
      return Integer.valueOf(normalized);
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private static String text(JsonNode node, String key) {
    JsonNode value = node.get(key);
    if (value == null || value.isNull()) {
      return null;
    }
    return value.asText();
  }

  /**
   * Ensures all expected UI fields are present in each result (with null defaults), so the frontend
   * never has to guard against missing keys.
   */
  private ObjectNode normaliseResult(ObjectNode item) {
    for (Map.Entry<String, String> field : EXPECTED_FIELDS.entrySet()) {
      if (!item.has(field.getKey())) {
        item.putNull(field.getKey());
      }
    }
    return item;
  }

  /**
   * Required top-level fields expected by the dicoogle-next UI's SearchStore. Keys are DICOM
   * keywords; values are human-readable descriptions (unused at runtime).
   */
  private static final Map<String, String> EXPECTED_FIELDS =
      Map.ofEntries(
          Map.entry("PatientName", "Patient name"),
          Map.entry("PatientID", "Patient ID"),
          Map.entry("PatientBirthDate", "Patient birth date"),
          Map.entry("PatientSex", "Patient sex"),
          Map.entry("StudyInstanceUID", "Study instance UID"),
          Map.entry("StudyDate", "Study date"),
          Map.entry("StudyTime", "Study time"),
          Map.entry("StudyDescription", "Study description"),
          Map.entry("StudyID", "Study ID"),
          Map.entry("AccessionNumber", "Accession number"),
          Map.entry("Modality", "Modality"),
          Map.entry("SeriesInstanceUID", "Series instance UID"),
          Map.entry("SeriesDescription", "Series description"),
          Map.entry("SeriesNumber", "Series number"),
          Map.entry("SOPInstanceUID", "SOP instance UID"),
          Map.entry("SOPClassUID", "SOP class UID"),
          Map.entry("InstanceNumber", "Instance number"),
          Map.entry("InstitutionName", "Institution name"));

  // ---------------------------------------------------------------------------
  // DIM nodes
  // ---------------------------------------------------------------------------

  private static final class DimPatient {
    final String id;
    final String name;
    final String gender;
    final String birthdate;
    final List<DimStudy> studies = new ArrayList<>();

    DimPatient(String id, String name, String gender, String birthdate) {
      this.id = id;
      this.name = name;
      this.gender = gender;
      this.birthdate = birthdate;
    }
  }

  private static final class DimStudy {
    final String studyInstanceUID;
    final String studyDate;
    final String studyDescription;
    final String institutionName;
    final Set<String> modalities = new LinkedHashSet<>();
    final List<DimSeries> series = new ArrayList<>();

    DimStudy(
        String studyInstanceUID,
        String studyDate,
        String studyDescription,
        String institutionName) {
      this.studyInstanceUID = studyInstanceUID;
      this.studyDate = studyDate;
      this.studyDescription = studyDescription;
      this.institutionName = institutionName;
    }
  }

  private static final class DimSeries {
    final String seriesInstanceUID;
    final String seriesDescription;
    final String modality;
    final Integer seriesNumber;
    final List<DimImage> images = new ArrayList<>();

    DimSeries(
        String seriesInstanceUID, String seriesDescription, String modality, Integer seriesNumber) {
      this.seriesInstanceUID = seriesInstanceUID;
      this.seriesDescription = seriesDescription;
      this.modality = modality;
      this.seriesNumber = seriesNumber;
    }
  }

  private static final class DimImage {
    final String sopInstanceUID;
    final String uri;
    final String rawPath;
    final String filename;
    final Integer number;

    DimImage(String sopInstanceUID, String uri, Integer number) {
      this.sopInstanceUID = sopInstanceUID;
      this.uri = uri;
      this.rawPath = deriveRawPath(uri);
      this.filename = deriveFilename(this.rawPath);
      this.number = number;
    }

    private static String deriveRawPath(String uri) {
      if (uri == null || uri.isBlank()) {
        return null;
      }
      try {
        String path = URI.create(uri).getRawPath();
        return path != null ? path : uri;
      } catch (Exception e) {
        return uri;
      }
    }

    private static String deriveFilename(String rawPath) {
      if (rawPath == null) {
        return "";
      }
      int slash = rawPath.lastIndexOf('/');
      return slash >= 0 ? rawPath.substring(slash + 1) : rawPath;
    }
  }
}
