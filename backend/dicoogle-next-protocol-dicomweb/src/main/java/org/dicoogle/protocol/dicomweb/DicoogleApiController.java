package org.dicoogle.protocol.dicomweb;

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
   * Returns all DICOM attributes of a single instance identified by its SOPInstanceUID, as a flat
   * keyword→value JSON object.
   *
   * <p>Matches the legacy Dicoogle endpoint exactly: {@code GET /dump?uid=<SOPInstanceUID>}.
   *
   * <p>Example:
   *
   * <pre>
   * GET /dump?uid=1.2.840.113745.101000.1008000.38446.6272.7138759
   * </pre>
   *
   * <p>Response:
   *
   * <pre>{@code
   * {
   *   "SOPInstanceUID": "1.2.840...",
   *   "PatientName":    "FELIX",
   *   "Modality":       "MR",
   *   ...
   * }
   * }</pre>
   *
   * <p>Sequence tags (SQ) and pixel data are excluded. Private/unknown tags appear as their
   * zero-padded uppercase hex tag (e.g. {@code "00091010"}).
   *
   * @param sopInstanceUid the SOPInstanceUID of the instance to dump
   * @return 200 with flat keyword JSON, 400 if uid is missing, 404 if not found
   */
  @GetMapping(value = "/dump", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> dumpInstance(
      @RequestParam(value = "uid", required = false) String sopInstanceUid) {
    if (sopInstanceUid == null || sopInstanceUid.isBlank()) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Query parameter 'uid' (SOPInstanceUID) is required");
    }
    LOGGER.info("dump request: uid={}", sopInstanceUid);
    var attrs = retrieveService.instanceAttributes(sopInstanceUid);
    return ResponseEntity.ok()
        .contentType(APPLICATION_JSON_UTF8)
        .body(DicomTagTransformer.toDumpResponse(attrs));
  }
}
