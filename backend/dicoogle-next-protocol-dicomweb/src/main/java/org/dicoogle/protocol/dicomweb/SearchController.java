package org.dicoogle.protocol.dicomweb;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Legacy-compatible search endpoints for the dicoogle-next UI.
 *
 * <p>The dicoogle-next frontend's SearchStore calls {@code GET /search?query=...&keyword=false} and
 * expects a flat JSON response shaped like:
 *
 * <pre>
 * {
 *   "numResults": 3,
 *   "results": [
 *     { "PatientName": "FELIX", "PatientID": "7DfDKDK", "StudyInstanceUID": "...", ... },
 *     ...
 *   ]
 * }
 * </pre>
 *
 * <p>These endpoints reuse {@link DicomwebQidoService} and {@link DicomTagTransformer} — no
 * duplicate query logic. The {@code /searchDIM} alias is provided for legacy compatibility.
 */
@RestController
public class SearchController {

  private static final MediaType APPLICATION_JSON_UTF8 =
      MediaType.parseMediaType("application/json;charset=UTF-8");

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final DicomwebQidoService qidoService;

  public SearchController(DicomwebQidoService qidoService) {
    this.qidoService = qidoService;
  }

  /**
   * Legacy {@code /search} endpoint.
   *
   * <p>Accepts:
   *
   * <ul>
   *   <li>{@code query} – free-text or keyword query string (e.g. {@code PatientName:FELIX})
   *   <li>{@code keyword} – {@code true} to treat query as DICOM keyword expression (default:
   *       {@code false})
   *   <li>{@code provider} – optional plugin provider name (ignored, kept for API compat)
   *   <li>{@code dim} – {@code true} to group results by study (default: {@code false}, flat list)
   * </ul>
   */
  @GetMapping(value = "/search", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> search(
      @RequestParam(value = "query", required = false, defaultValue = "") String query,
      @RequestParam(value = "keyword", required = false, defaultValue = "false") boolean keyword,
      @RequestParam(value = "provider", required = false) String provider,
      @RequestParam(value = "dim", required = false, defaultValue = "false") boolean dim) {

    MultiValueMap<String, String> qidoParams = buildQidoParams(query, keyword);
    qidoParams.add("_rawQuery", query);
    String dicomJson = qidoService.searchStudies(qidoParams, provider);
    String body = buildSearchResponse(dicomJson);

    return ResponseEntity.ok().contentType(APPLICATION_JSON_UTF8).body(body);
  }

  /**
   * Legacy {@code /searchDIM} alias — returns the same flat structure as {@code /search}.
   *
   * <p>In legacy Dicoogle, {@code /searchDIM} returned a hierarchical (study→series→instance) tree.
   * For compatibility with the new UI's flat-list approach, this endpoint returns the same shape as
   * {@code /search}.
   */
  @GetMapping(value = "/searchDIM", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> searchDim(
      @RequestParam(value = "query", required = false, defaultValue = "") String query,
      @RequestParam(value = "keyword", required = false, defaultValue = "false") boolean keyword,
      @RequestParam(value = "provider", required = false) String provider) {

    return search(query, keyword, provider, false);
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
  private MultiValueMap<String, String> buildQidoParams(String query, boolean keyword) {
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    if (query == null || query.isBlank()) {
      // empty query — return all (no filters)
      return params;
    }

    if (keyword) {
      // Keyword mode: expect "Key:Value" pairs separated by spaces
      for (String token : query.trim().split("\\s+")) {
        int colon = token.indexOf(':');
        if (colon > 0 && colon < token.length() - 1) {
          String key = token.substring(0, colon);
          String value = token.substring(colon + 1);
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
   * Wraps a DICOM JSON array string into the legacy search response shape:
   *
   * <pre>{"numResults": N, "results": [...]}</pre>
   */
  private String buildSearchResponse(String dicomJson) {
    try {
      String keywordJson = DicomTagTransformer.transformResultArray(dicomJson);
      JsonNode results = MAPPER.readTree(keywordJson);

      // Flatten: for each result, ensure required fields are present (null-safe)
      ArrayNode normalised = MAPPER.createArrayNode();
      if (results.isArray()) {
        for (JsonNode item : results) {
          normalised.add(normaliseResult((ObjectNode) item));
        }
      }

      ObjectNode response = MAPPER.createObjectNode();
      response.put("numResults", normalised.size());
      response.set("results", normalised);
      return MAPPER.writeValueAsString(response);
    } catch (Exception e) {
      throw new RuntimeException("Failed to build search response", e);
    }
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
          Map.entry("AccessionNumber", "Accession number"),
          Map.entry("Modality", "Modality"),
          Map.entry("SeriesInstanceUID", "Series instance UID"),
          Map.entry("SeriesDescription", "Series description"),
          Map.entry("SeriesNumber", "Series number"),
          Map.entry("SOPInstanceUID", "SOP instance UID"),
          Map.entry("SOPClassUID", "SOP class UID"),
          Map.entry("InstitutionName", "Institution name"));
}
