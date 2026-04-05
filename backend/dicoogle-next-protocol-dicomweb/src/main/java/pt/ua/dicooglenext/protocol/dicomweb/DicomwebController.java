package pt.ua.dicooglenext.protocol.dicomweb;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/dicom-web")
public class DicomwebController {

  private static final MediaType APPLICATION_DICOM = MediaType.parseMediaType("application/dicom");
  private static final MediaType APPLICATION_DICOM_JSON =
      MediaType.parseMediaType("application/dicom+json");

  private final DicomwebRetrieveService retrieveService;

  public DicomwebController(DicomwebRetrieveService retrieveService) {
    this.retrieveService = retrieveService;
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
      value = "/studies/{studyInstanceUid}/metadata",
      produces = "application/dicom+json")
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
    return ResponseEntity.ok()
        .contentType(APPLICATION_DICOM_JSON)
        .body(retrieveService.instanceMetadata(studyInstanceUid, seriesInstanceUid, sopInstanceUid));
  }
}
