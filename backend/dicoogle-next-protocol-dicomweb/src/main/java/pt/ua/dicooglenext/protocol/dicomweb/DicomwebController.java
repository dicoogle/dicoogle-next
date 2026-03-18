package pt.ua.dicooglenext.protocol.dicomweb;

import java.util.List;
import java.util.Map;
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
      produces = MediaType.APPLICATION_JSON_VALUE)
  public List<Map<String, Object>> retrieveStudyMetadata(@PathVariable String studyInstanceUid) {
    return retrieveService.studyMetadata(studyInstanceUid);
  }

  @GetMapping(
      value = "/studies/{studyInstanceUid}/series/{seriesInstanceUid}/metadata",
      produces = MediaType.APPLICATION_JSON_VALUE)
  public List<Map<String, Object>> retrieveSeriesMetadata(
      @PathVariable String studyInstanceUid, @PathVariable String seriesInstanceUid) {
    return retrieveService.seriesMetadata(studyInstanceUid, seriesInstanceUid);
  }

  @GetMapping(
      value =
          "/studies/{studyInstanceUid}/series/{seriesInstanceUid}/instances/{sopInstanceUid}/metadata",
      produces = MediaType.APPLICATION_JSON_VALUE)
  public Map<String, Object> retrieveInstanceMetadata(
      @PathVariable String studyInstanceUid,
      @PathVariable String seriesInstanceUid,
      @PathVariable String sopInstanceUid) {
    return retrieveService.instanceMetadata(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
  }
}
