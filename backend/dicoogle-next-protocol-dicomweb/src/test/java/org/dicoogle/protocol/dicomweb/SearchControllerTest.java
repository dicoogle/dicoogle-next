package org.dicoogle.protocol.dicomweb;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.List;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dicoogle.core.query.QueryRouter;
import org.dicoogle.sdk.query.QueryService;
import org.junit.jupiter.api.Test;

class SearchControllerTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Test
  void legacySearchReturnsEveryInstanceWithoutAggregation() throws Exception {
    JsonNode body = body(search(""));

    assertEquals(3, body.get("numResults").asInt());
    assertEquals(3, body.get("results").size());
    assertNotNull(body.get("results").get(0).get("fields").get("SOPInstanceUID"));
  }

  @Test
  void legacySearchAcceptsPsizeAsLimitAlias() throws Exception {
    JsonNode body = body(search("", 0, 0, 1));

    assertEquals(1, body.get("numResults").asInt());
  }

  @Test
  void searchDimBuildsFullPatientStudySeriesImageTree() throws Exception {
    JsonNode body = body(searchDim(null));

    assertEquals(1, body.get("numResults").asInt(), "one patient");
    JsonNode patient = body.get("results").get(0);
    assertEquals(1, patient.get("studies").size());
    JsonNode study = patient.get("studies").get(0);
    assertEquals(1, study.get("series").size());
    assertEquals(3, study.get("series").get(0).get("images").size());
  }

  @Test
  void searchDimHonoursDepthCutoff() throws Exception {
    JsonNode body = body(searchDim("study"));

    JsonNode study = body.get("results").get(0).get("studies").get(0);
    assertTrue(study.has("studyInstanceUID"));
    assertFalse(study.has("series"), "series should be omitted below depth 3");
  }

  private JsonNode body(org.springframework.http.ResponseEntity<String> response) throws Exception {
    return MAPPER.readTree(response.getBody());
  }

  private org.springframework.http.ResponseEntity<String> search(String query) {
    return search(query, 0, 0, 0);
  }

  private org.springframework.http.ResponseEntity<String> search(
      String query, int offset, int limit, int psize) {
    return controller().search(query, null, offset, limit, psize, null);
  }

  private org.springframework.http.ResponseEntity<String> searchDim(String depth) {
    return controller().searchDim("", null, 0, 0, depth, null);
  }

  private SearchController controller() {
    Attributes a1 = dataset("1.2.3", "1.2.3.1", "1.2.3.1.1", "1");
    Attributes a2 = dataset("1.2.3", "1.2.3.1", "1.2.3.1.2", "2");
    Attributes a3 = dataset("1.2.3", "1.2.3.1", "1.2.3.1.3", "3");

    QueryRouter router =
        new QueryRouter(List.of(new StubQueryPlugin(List.of(a1, a2, a3))), List.of(), 4, 1000);
    return new SearchController(new DicomwebQidoService(router), null, null);
  }

  private Attributes dataset(
      String studyUid, String seriesUid, String sopUid, String instanceNumber) {
    Attributes attrs = new Attributes();
    attrs.setString(Tag.StudyInstanceUID, VR.UI, studyUid);
    attrs.setString(Tag.SeriesInstanceUID, VR.UI, seriesUid);
    attrs.setString(Tag.SOPInstanceUID, VR.UI, sopUid);
    attrs.setString(Tag.PatientName, VR.PN, "FELIX");
    attrs.setString(Tag.PatientID, VR.LO, "P1");
    attrs.setString(Tag.PatientSex, VR.CS, "M");
    attrs.setString(Tag.PatientBirthDate, VR.DA, "19800101");
    attrs.setString(Tag.StudyDate, VR.DA, "20260101");
    attrs.setString(Tag.StudyDescription, VR.LO, "CHEST");
    attrs.setString(Tag.Modality, VR.CS, "CT");
    attrs.setString(Tag.SeriesNumber, VR.IS, "1");
    attrs.setString(Tag.InstanceNumber, VR.IS, instanceNumber);
    attrs.setString(Tag.QueryRetrieveLevel, VR.CS, "IMAGE");
    return attrs;
  }

  private record StubQueryPlugin(List<Attributes> values) implements QueryService {
    @Override
    public org.dicoogle.sdk.PluginMetadata metadata() {
      return new org.dicoogle.sdk.PluginMetadata("stub", "stub", "0", "query-index");
    }

    @Override
    public List<QueryResult> query(QueryRequest request) {
      return values.stream()
          .map(a -> new QueryResult(a, URI.create("file:///dummy/a.dcm")))
          .toList();
    }
  }
}
