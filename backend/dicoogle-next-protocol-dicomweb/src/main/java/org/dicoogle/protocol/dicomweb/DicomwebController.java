package org.dicoogle.protocol.dicomweb;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/dicom-web")
public class DicomwebController {

  private static final MediaType APPLICATION_DICOM = MediaType.parseMediaType("application/dicom");
  private static final MediaType APPLICATION_DICOM_JSON =
      MediaType.parseMediaType("application/dicom+json");
  private static final String SOURCE_TRANSFER_SYNTAX_HEADER = "X-Source-Transfer-Syntax";

  private final DicomwebRetrieveService retrieveService;
  private final DicomwebQidoService qidoService;
  private final NativeFrameService nativeFrameService;

  public DicomwebController(
      DicomwebRetrieveService retrieveService,
      DicomwebQidoService qidoService,
      NativeFrameService nativeFrameService) {
    this.retrieveService = retrieveService;
    this.qidoService = qidoService;
    this.nativeFrameService = nativeFrameService;
  }

  @GetMapping(value = "/studies", produces = "application/dicom+json")
  public ResponseEntity<String> searchStudies(
      @RequestParam MultiValueMap<String, String> queryParams) {
    return ResponseEntity.ok()
        .contentType(APPLICATION_DICOM_JSON)
        .body(qidoService.searchStudies(queryParams));
  }

  @GetMapping(value = "/studies/{studyInstanceUid}/series", produces = "application/dicom+json")
  public ResponseEntity<String> searchSeries(
      @PathVariable String studyInstanceUid,
      @RequestParam MultiValueMap<String, String> queryParams) {
    return ResponseEntity.ok()
        .contentType(APPLICATION_DICOM_JSON)
        .body(qidoService.searchSeries(studyInstanceUid, queryParams));
  }

  @GetMapping(
      value = "/studies/{studyInstanceUid}/series/{seriesInstanceUid}/instances",
      produces = "application/dicom+json")
  public ResponseEntity<String> searchInstances(
      @PathVariable String studyInstanceUid,
      @PathVariable String seriesInstanceUid,
      @RequestParam MultiValueMap<String, String> queryParams) {
    return ResponseEntity.ok()
        .contentType(APPLICATION_DICOM_JSON)
        .body(qidoService.searchInstances(studyInstanceUid, seriesInstanceUid, queryParams));
  }

  @GetMapping(
      value = "/studies/{studyInstanceUid}/series/{seriesInstanceUid}/instances/{sopInstanceUid}",
      produces = "application/dicom")
  public ResponseEntity<byte[]> retrieveInstance(
      @PathVariable String studyInstanceUid,
      @PathVariable String seriesInstanceUid,
      @PathVariable String sopInstanceUid) {
    byte[] payload =
        retrieveService.retrieveInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid);

    return ResponseEntity.ok().contentType(APPLICATION_DICOM).body(payload);
  }

  @GetMapping(
      value =
          "/studies/{studyInstanceUid}/series/{seriesInstanceUid}/instances/{sopInstanceUid}/frames/{frameList}",
      produces = "multipart/related")
  public ResponseEntity<byte[]> retrieveFrames(
      @PathVariable String studyInstanceUid,
      @PathVariable String seriesInstanceUid,
      @PathVariable String sopInstanceUid,
      @PathVariable String frameList) {
    NativeFrameResponse frameResponse =
        nativeFrameService.retrieveFrames(
            studyInstanceUid, seriesInstanceUid, sopInstanceUid, frameList);

    return ResponseEntity.ok()
        .contentType(
            MediaType.parseMediaType(
                "multipart/related; type=\"application/octet-stream\"; boundary="
                    + frameResponse.boundary()))
        .header("X-Frame-Representation", NativeFrameService.REPRESENTATION)
        .header("X-Frame-Transfer-Syntax", frameResponse.transferSyntaxUID())
        .header("X-Frame-Number-Basis", "1")
        .header("X-Frame-Source", "next")
        .header("X-Frame-Cache", "bypass")
        .cacheControl(CacheControl.noStore())
        .body(frameResponse.body());
  }

  @GetMapping(value = "/studies/{studyInstanceUid}/metadata", produces = "application/dicom+json")
  public ResponseEntity<String> retrieveStudyMetadata(@PathVariable String studyInstanceUid) {
    return ResponseEntity.ok()
        .contentType(APPLICATION_DICOM_JSON)
        .body(retrieveService.studyMetadata(studyInstanceUid));
  }

  @GetMapping(
      value = "/studies/{studyInstanceUid}/series/{seriesInstanceUid}/metadata",
      produces = "application/dicom+json")
  public ResponseEntity<String> retrieveSeriesMetadata(
      @PathVariable String studyInstanceUid, @PathVariable String seriesInstanceUid) {
    return ResponseEntity.ok()
        .contentType(APPLICATION_DICOM_JSON)
        .body(retrieveService.seriesMetadata(studyInstanceUid, seriesInstanceUid));
  }

  @GetMapping(
      value =
          "/studies/{studyInstanceUid}/series/{seriesInstanceUid}/instances/{sopInstanceUid}/metadata",
      produces = "application/dicom+json")
  public ResponseEntity<String> retrieveInstanceMetadata(
      @PathVariable String studyInstanceUid,
      @PathVariable String seriesInstanceUid,
      @PathVariable String sopInstanceUid) {
    DicomwebRetrieveService.InstanceMetadataResult metadata =
        retrieveService.instanceMetadataResult(studyInstanceUid, seriesInstanceUid, sopInstanceUid);

    ResponseEntity.BodyBuilder response = ResponseEntity.ok().contentType(APPLICATION_DICOM_JSON);
    if (metadata.sourceTransferSyntaxUid() != null) {
      response.header(SOURCE_TRANSFER_SYNTAX_HEADER, metadata.sourceTransferSyntaxUid());
    }
    return response.body(metadata.dicomJson());
  }
}
