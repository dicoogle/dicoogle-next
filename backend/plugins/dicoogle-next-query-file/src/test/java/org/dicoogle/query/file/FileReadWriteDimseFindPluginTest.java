package org.dicoogle.query.file;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomOutputStream;
import org.dicoogle.sdk.query.DimseFindServicePlugin;
import org.dicoogle.storage.filerw.FileReadWriteStoragePlugin;
import org.junit.jupiter.api.Test;

class FileReadWriteDimseFindPluginTest {

  @Test
  void supportsTextAndKeywordFilters() throws Exception {
    Path root = Files.createTempDirectory("query-file-test");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    storage.store(
        new java.io.ByteArrayInputStream(createDicom("P1", "FELIX", "MR")), "application/dicom");

    FileReadWriteDimseFindPlugin plugin = new FileReadWriteDimseFindPlugin(storage);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.PatientName, VR.PN, "felix");
    keys.setString(Tag.Modality, VR.CS, "MR");

    var request =
        new DimseFindServicePlugin.FindRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            DimseFindServicePlugin.QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            1,
            keys,
            "felix",
            java.util.Map.of("modality", "MR"));

    assertFalse(plugin.find(request).isEmpty());
  }

  @Test
  void parserKeepsTextAndKeywordsSeparated() {
    String raw = "brain patientid:123 modality:MR";
    assertTrue(FileReadWriteDimseFindPlugin.extractKeywordFilters(raw).containsKey("patientid"));
    assertTrue(FileReadWriteDimseFindPlugin.extractFreeText(raw).contains("brain"));
  }

  private byte[] createDicom(String patientId, String patientName, String modality)
      throws Exception {
    Attributes fmi = new Attributes();
    fmi.setString(Tag.TransferSyntaxUID, VR.UI, UID.ExplicitVRLittleEndian);
    fmi.setString(Tag.MediaStorageSOPClassUID, VR.UI, UID.SecondaryCaptureImageStorage);
    fmi.setString(Tag.MediaStorageSOPInstanceUID, VR.UI, "1.2.3.4.5");
    fmi.setString(Tag.ImplementationClassUID, VR.UI, "1.2.826.0.1.3680043.2.1125.99");

    Attributes attrs = new Attributes();
    attrs.setString(Tag.SOPClassUID, VR.UI, UID.SecondaryCaptureImageStorage);
    attrs.setString(Tag.SOPInstanceUID, VR.UI, "1.2.3.4.5");
    attrs.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");
    attrs.setString(Tag.SeriesInstanceUID, VR.UI, "1.2.3.1");
    attrs.setString(Tag.PatientID, VR.LO, patientId);
    attrs.setString(Tag.PatientName, VR.PN, patientName);
    attrs.setString(Tag.Modality, VR.CS, modality);

    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
    try (DicomOutputStream dos = new DicomOutputStream(out, UID.ExplicitVRLittleEndian)) {
      dos.writeDataset(fmi, attrs);
    }
    return out.toByteArray();
  }
}
