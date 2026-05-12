package org.dicoogle.protocol.dicomweb;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.json.Json;
import jakarta.json.JsonArray;
import java.io.StringReader;
import java.util.List;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dicoogle.sdk.query.DimseFindServicePlugin;
import org.junit.jupiter.api.Test;
import org.springframework.util.LinkedMultiValueMap;

class DicomwebQidoServiceTest {

  @Test
  void qidoStudySearchDeduplicatesByStudyUid() {
    Attributes a1 = dataset("1.2.3", "1.2.3.1", "1.2.3.1.1", "FELIX", "P1");
    Attributes a2 = dataset("1.2.3", "1.2.3.2", "1.2.3.2.1", "FELIX", "P1");

    DicomwebQidoService service =
        new DicomwebQidoService(List.of(new StubFindPlugin(List.of(a1, a2))));
    String json = service.searchStudies(new LinkedMultiValueMap<>());

    JsonArray array = Json.createReader(new StringReader(json)).readArray();
    assertEquals(1, array.size());
  }

  @Test
  void qidoIncludeFieldProjectsAndKeepsRequiredTags() {
    Attributes a1 = dataset("1.2.3", "1.2.3.1", "1.2.3.1.1", "FELIX", "P1");

    DicomwebQidoService service = new DicomwebQidoService(List.of(new StubFindPlugin(List.of(a1))));
    LinkedMultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("includefield", "PatientName");

    String json = service.searchStudies(params);
    assertTrue(json.contains("00100010"));
    assertTrue(json.contains("0020000D"));
    assertTrue(!json.contains("00100020"));
  }

  @Test
  void qidoPaginationAppliesOffsetAndLimit() {
    Attributes a1 = dataset("1.2.3", "1.2.3.1", "1.2.3.1.1", "FELIX", "P1");
    Attributes a2 = dataset("1.2.4", "1.2.4.1", "1.2.4.1.1", "ANA", "P2");
    Attributes a3 = dataset("1.2.5", "1.2.5.1", "1.2.5.1.1", "JOAO", "P3");

    DicomwebQidoService service =
        new DicomwebQidoService(List.of(new StubFindPlugin(List.of(a1, a2, a3))));
    LinkedMultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("offset", "1");
    params.add("limit", "1");

    String json = service.searchStudies(params);
    JsonArray array = Json.createReader(new StringReader(json)).readArray();
    assertEquals(1, array.size());
  }

  @Test
  void qidoRejectsInvalidLimit() {
    DicomwebQidoService service = new DicomwebQidoService(List.of(new StubFindPlugin(List.of())));
    LinkedMultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("limit", "abc");

    assertThrows(IllegalArgumentException.class, () -> service.searchStudies(params));
  }

  private Attributes dataset(
      String studyUid, String seriesUid, String sopUid, String patientName, String patientId) {
    Attributes attrs = new Attributes();
    attrs.setString(Tag.StudyInstanceUID, VR.UI, studyUid);
    attrs.setString(Tag.SeriesInstanceUID, VR.UI, seriesUid);
    attrs.setString(Tag.SOPInstanceUID, VR.UI, sopUid);
    attrs.setString(Tag.PatientName, VR.PN, patientName);
    attrs.setString(Tag.PatientID, VR.LO, patientId);
    attrs.setString(Tag.QueryRetrieveLevel, VR.CS, "IMAGE");
    return attrs;
  }

  private record StubFindPlugin(List<Attributes> values) implements DimseFindServicePlugin {
    @Override
    public org.dicoogle.sdk.PluginMetadata metadata() {
      return new org.dicoogle.sdk.PluginMetadata("stub", "stub", "0", "query-index");
    }

    @Override
    public List<Attributes> find(FindRequest request) {
      return values;
    }
  }
}
