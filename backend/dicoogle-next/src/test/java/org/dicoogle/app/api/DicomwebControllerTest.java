package org.dicoogle.app.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomOutputStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@DirtiesContext
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DicomwebControllerTest {

  @Autowired private MockMvc mockMvc;

  @BeforeEach
  void setUp() throws IOException {
    Path root = Path.of("target/test-storage/wado");
    Path instancePath =
        root.resolve("PATIENT-1")
            .resolve("1.2.826.0.1.3680043.2.1125.2")
            .resolve("1.2.826.0.1.3680043.2.1125.3")
            .resolve("1.2.826.0.1.3680043.2.1125.1.dcm");

    Files.createDirectories(instancePath.getParent());
    Files.write(instancePath, createValidDicom());
  }

  @Test
  void retrievesDicomInstance() throws Exception {
    mockMvc
        .perform(
            get("/dicom-web/studies/1.2.826.0.1.3680043.2.1125.2/series/1.2.826.0.1.3680043.2.1125.3/instances/1.2.826.0.1.3680043.2.1125.1")
                .with(user("dicoogle").roles("ADMIN")))
        .andExpect(status().isOk())
        .andExpect(content().contentType("application/dicom"));
  }

  @Test
  void retrievesInstanceMetadata() throws Exception {
    mockMvc
        .perform(
            get("/dicom-web/studies/1.2.826.0.1.3680043.2.1125.2/series/1.2.826.0.1.3680043.2.1125.3/instances/1.2.826.0.1.3680043.2.1125.1/metadata")
                .with(user("dicoogle").roles("ADMIN")))
        .andExpect(status().isOk())
        .andExpect(content().contentType("application/dicom+json"))
        .andExpect(jsonPath("$.00100020.vr").value("LO"))
        .andExpect(jsonPath("$.00100020.Value[0]").value("PATIENT-1"))
        .andExpect(jsonPath("$.0020000D.vr").value("UI"))
        .andExpect(jsonPath("$.0020000D.Value[0]").value("1.2.826.0.1.3680043.2.1125.2"))
        .andExpect(jsonPath("$.0020000E.Value[0]").value("1.2.826.0.1.3680043.2.1125.3"))
        .andExpect(jsonPath("$.00080018.Value[0]").value("1.2.826.0.1.3680043.2.1125.1"));
  }

  @Test
  void missingInstanceReturnsProblemDetails() throws Exception {
    mockMvc
        .perform(
            get("/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.9")
                .with(user("dicoogle").roles("ADMIN")))
        .andExpect(status().isNotFound())
        .andExpect(content().contentType("application/problem+json"))
        .andExpect(jsonPath("$.status").value(404))
        .andExpect(
            jsonPath("$.path").value("/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.9"));
  }

  @Test
  void qidoSearchStudiesReturnsDicomJsonArray() throws Exception {
    mockMvc
        .perform(
            get("/dicom-web/studies")
                .queryParam("PatientName", "FELIX")
                .queryParam("limit", "10")
                .with(user("dicoogle").roles("ADMIN")))
        .andExpect(status().isOk())
        .andExpect(content().contentType("application/dicom+json"));
  }

  @Test
  void qidoSearchSeriesReturnsDicomJsonArray() throws Exception {
    mockMvc
        .perform(
            get("/dicom-web/studies/1.2.826.0.1.3680043.2.1125.2/series")
                .queryParam("Modality", "OT")
                .with(user("dicoogle").roles("ADMIN")))
        .andExpect(status().isOk())
        .andExpect(content().contentType("application/dicom+json"));
  }

  @Test
  void qidoSearchInstancesReturnsDicomJsonArray() throws Exception {
    mockMvc
        .perform(
            get("/dicom-web/studies/1.2.826.0.1.3680043.2.1125.2/series/1.2.826.0.1.3680043.2.1125.3/instances")
                .queryParam("SOPInstanceUID", "1.2.826.0.1.3680043.2.1125.1")
                .with(user("dicoogle").roles("ADMIN")))
        .andExpect(status().isOk())
        .andExpect(content().contentType("application/dicom+json"));
  }

  @Test
  void qidoInvalidLimitReturnsBadRequest() throws Exception {
    mockMvc
        .perform(
            get("/dicom-web/studies")
                .queryParam("limit", "abc")
                .with(user("dicoogle").roles("ADMIN")))
        .andExpect(status().isBadRequest());
  }

  private byte[] createValidDicom() {
    try {
      Attributes fmi = new Attributes();
      fmi.setString(Tag.TransferSyntaxUID, VR.UI, UID.ExplicitVRLittleEndian);
      fmi.setString(Tag.MediaStorageSOPClassUID, VR.UI, UID.SecondaryCaptureImageStorage);
      fmi.setString(Tag.MediaStorageSOPInstanceUID, VR.UI, "1.2.826.0.1.3680043.2.1125.1");
      fmi.setString(
          Tag.ImplementationClassUID,
          VR.UI,
          org.dicoogle.sdk.ImplementationInfo.IMPLEMENTATION_CLASS_UID);

      Attributes attrs = new Attributes();
      attrs.setString(Tag.SOPClassUID, VR.UI, UID.SecondaryCaptureImageStorage);
      attrs.setString(Tag.SOPInstanceUID, VR.UI, "1.2.826.0.1.3680043.2.1125.1");
      attrs.setString(Tag.StudyInstanceUID, VR.UI, "1.2.826.0.1.3680043.2.1125.2");
      attrs.setString(Tag.SeriesInstanceUID, VR.UI, "1.2.826.0.1.3680043.2.1125.3");
      attrs.setString(Tag.PatientID, VR.LO, "PATIENT-1");

      ByteArrayOutputStream output = new ByteArrayOutputStream();
      try (DicomOutputStream dos = new DicomOutputStream(output, UID.ExplicitVRLittleEndian)) {
        dos.writeDataset(fmi, attrs);
      }
      return output.toByteArray();
    } catch (IOException ex) {
      throw new IllegalStateException(ex);
    }
  }
}
