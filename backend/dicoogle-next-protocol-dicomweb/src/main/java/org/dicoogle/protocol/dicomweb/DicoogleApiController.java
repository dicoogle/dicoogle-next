package org.dicoogle.protocol.dicomweb;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * UI-friendly query endpoints mirroring legacy Dicoogle naming while reusing the DICOMweb QIDO
 * query service. These endpoints return keyword-based JSON fields rather than raw hex DICOM tags.
 *
 * <p>Endpoint families:
 *
 * <ul>
 *   <li>{@code /DICOMWeb/Studies}, {@code /Series}, {@code /Instances} — QIDO results as flat
 *       keyword JSON (legacy Dicoogle path names).
 *   <li>{@code GET /dump?uid=<SOPInstanceUID>} — full attribute dump of a single instance, matching
 *       the legacy Dicoogle {@code /dump} endpoint exactly.
 * </ul>
 */
@RestController
public class DicoogleApiController {

  private static final Logger LOGGER = LoggerFactory.getLogger(DicoogleApiController.class);

  private static final MediaType APPLICATION_JSON_UTF8 =
      MediaType.parseMediaType("application/json;charset=UTF-8");

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final DicomwebQidoService qidoService;
  private final DicomwebRetrieveService retrieveService;

  public DicoogleApiController(
      DicomwebQidoService qidoService, DicomwebRetrieveService retrieveService) {
    this.qidoService = qidoService;
    this.retrieveService = retrieveService;
  }

  // ---------------------------------------------------------------------------
  // QIDO-RS UI-friendly endpoints (legacy path names)
  // ---------------------------------------------------------------------------

  @GetMapping(value = "/DICOMWeb/Studies", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> searchStudies(
      @RequestParam MultiValueMap<String, String> queryParams) {
    String dicomJson = qidoService.searchStudies(queryParams);
    return ResponseEntity.ok()
        .contentType(APPLICATION_JSON_UTF8)
        .body(DicomTagTransformer.transformResultArray(dicomJson));
  }

  @GetMapping(
      value = "/DICOMWeb/Studies/{studyInstanceUid}/Series",
      produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> searchSeries(
      @PathVariable String studyInstanceUid,
      @RequestParam MultiValueMap<String, String> queryParams) {
    String dicomJson = qidoService.searchSeries(studyInstanceUid, queryParams);
    return ResponseEntity.ok()
        .contentType(APPLICATION_JSON_UTF8)
        .body(DicomTagTransformer.transformResultArray(dicomJson));
  }

  @GetMapping(
      value = "/DICOMWeb/Studies/{studyInstanceUid}/Series/{seriesInstanceUid}/Instances",
      produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> searchInstances(
      @PathVariable String studyInstanceUid,
      @PathVariable String seriesInstanceUid,
      @RequestParam MultiValueMap<String, String> queryParams) {
    String dicomJson =
        qidoService.searchInstances(studyInstanceUid, seriesInstanceUid, queryParams);
    return ResponseEntity.ok()
        .contentType(APPLICATION_JSON_UTF8)
        .body(DicomTagTransformer.transformResultArray(dicomJson));
  }

  // ---------------------------------------------------------------------------
  // /dump — full attribute dump for one instance (legacy Dicoogle parity)
  // ---------------------------------------------------------------------------

  /**
   * Returns all DICOM attributes of a single instance, wrapped in the legacy envelope.
   *
   * <p>Matches the legacy {@code DumpServlet} response exactly:
   *
   * <pre>{@code
   * {
   *   "results": {
   *     "uri": "file:///path/to/file.dcm",
   *     "fields": { "SOPInstanceUID": "...", "PatientName": "...", ... }
   *   },
   *   "elapsedTime": 42
   * }
   * }</pre>
   *
   * <p>Sequence tags (SQ) and pixel data are excluded from {@code fields}. Accepts an optional
   * {@code provider} parameter to restrict the query to a specific index plugin.
   *
   * @param sopInstanceUid the SOPInstanceUID of the instance to dump
   * @param provider optional query provider name
   * @return 200 with legacy envelope, 400 if uid is missing, 404 if not found
   */
  @GetMapping(value = "/dump", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> dumpInstance(
      @RequestParam(value = "uid", required = false) String sopInstanceUid,
      @RequestParam(value = "provider", required = false) String provider) {
    if (sopInstanceUid == null || sopInstanceUid.isBlank()) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Query parameter 'uid' (SOPInstanceUID) is required");
    }
    LOGGER.info("dump request: uid={}", sopInstanceUid);

    long start = System.nanoTime();
    var result = retrieveService.dumpResult(sopInstanceUid, provider);
    long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);

    try {
      ObjectNode response = MAPPER.createObjectNode();
      ObjectNode results = MAPPER.createObjectNode();
      results.put("uri", result.storageUri().toString());
      JsonNode fields = MAPPER.readTree(DicomTagTransformer.toDumpResponse(result.attributes()));
      results.set("fields", fields);
      response.set("results", results);
      response.put("elapsedTime", elapsedMs);

      return ResponseEntity.ok()
          .contentType(APPLICATION_JSON_UTF8)
          .body(MAPPER.writeValueAsString(response));
    } catch (Exception e) {
      throw new RuntimeException("Failed to build dump response", e);
    }
  }

  /** Serves raw DICOM bytes for a given SOPInstanceUID. Used by Cornerstone's wadouri loader. */
  @GetMapping("/legacy/file")
  public ResponseEntity<byte[]> legacyFile(
      @RequestParam("uid") String sopInstanceUid,
      @RequestParam(value = "provider", required = false) String provider) {
    LOGGER.info("legacy/file request: uid={}", sopInstanceUid);
    byte[] bytes = retrieveService.retrieveInstanceBySopUid(sopInstanceUid, provider);
    return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).body(bytes);
  }

  /** Returns DICOM instance bytes for thumbnail/image rendering. */
  @GetMapping("/dic2png")
  public ResponseEntity<byte[]> dic2png(
      @RequestParam("SOPInstanceUID") String sopInstanceUid,
      @RequestParam(value = "thumbnail", required = false, defaultValue = "false")
          boolean thumbnail,
      @RequestParam(value = "provider", required = false) String provider) {
    byte[] bytes = retrieveService.retrieveInstanceBySopUid(sopInstanceUid, provider);
    return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).body(bytes);
  }
}
