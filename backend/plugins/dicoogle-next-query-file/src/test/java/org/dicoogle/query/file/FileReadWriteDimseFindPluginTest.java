package org.dicoogle.query.file;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Sequence;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomOutputStream;
import org.dicoogle.sdk.query.DimseFindServicePlugin;
import org.dicoogle.sdk.query.DimseMoveServicePlugin;
import org.dicoogle.storage.filerw.FileReadWriteStoragePlugin;
import org.junit.jupiter.api.Test;

class FileReadWriteDimseFindPluginTest {

  @Test
  void supportsTextAndKeywordFilters() throws Exception {
    Path root = Files.createTempDirectory("query-file-test");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    storage.store(
        new java.io.ByteArrayInputStream(createDicom("P1", "FELIX", "MR", "A1", "20240101")),
        "application/dicom");

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
            java.util.Map.of("modality", "MR"),
            false,
            false,
            () -> false);

    assertFalse(plugin.find(request).isEmpty());
  }

  @Test
  void parserKeepsTextAndKeywordsSeparated() {
    String raw = "brain patientid:123 modality:MR";
    assertTrue(FileReadWriteDimseFindPlugin.extractKeywordFilters(raw).containsKey("patientid"));
    assertTrue(FileReadWriteDimseFindPlugin.extractFreeText(raw).contains("brain"));
  }

  @Test
  void supportsArbitraryDicomKeywordFilter() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-any-keyword");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    storage.store(
        new java.io.ByteArrayInputStream(createDicom("P1", "FELIX", "MR", "A1", "20240101")),
        "application/dicom");

    FileReadWriteDimseFindPlugin plugin = new FileReadWriteDimseFindPlugin(storage);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");

    var request =
        new DimseFindServicePlugin.FindRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            DimseFindServicePlugin.QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            10,
            keys,
            null,
            java.util.Map.of("StudyDate", "20240101"),
            false,
            false,
            () -> false);

    assertEquals(1, plugin.find(request).size());
  }

  @Test
  void supportsWildcardAndMultiValueMatching() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-wildcards");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    storage.store(
        new java.io.ByteArrayInputStream(
            createDicom("P1", "FELIX^ALMEIDA", "MR", "A100", "20240115")),
        "application/dicom");
    storage.store(
        new java.io.ByteArrayInputStream(createDicom("P2", "JOAO", "CT", "A200", "20250310")),
        "application/dicom");

    FileReadWriteDimseFindPlugin plugin = new FileReadWriteDimseFindPlugin(storage);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.PatientName, VR.PN, "F*");
    keys.setString(Tag.Modality, VR.CS, "MR\\US");

    var request =
        new DimseFindServicePlugin.FindRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            DimseFindServicePlugin.QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            2,
            keys,
            null,
            java.util.Map.of(),
            false,
            false,
            () -> false);

    assertEquals(1, plugin.find(request).size());
  }

  @Test
  void supportsDateRangeMatching() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-dates");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    storage.store(
        new java.io.ByteArrayInputStream(createDicom("P1", "ANA", "MR", "A1", "20240115")),
        "application/dicom");
    storage.store(
        new java.io.ByteArrayInputStream(createDicom("P2", "BEA", "MR", "A2", "20250310")),
        "application/dicom");

    FileReadWriteDimseFindPlugin plugin = new FileReadWriteDimseFindPlugin(storage);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyDate, VR.DA, "20240101-20241231");

    var request =
        new DimseFindServicePlugin.FindRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            DimseFindServicePlugin.QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            3,
            keys,
            null,
            java.util.Map.of(),
            false,
            false,
            () -> false);

    assertEquals(1, plugin.find(request).size());
  }

  @Test
  void supportsTimeAndDateTimeRangeMatchingWithNegotiation() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-datetime");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    storage.store(
        new java.io.ByteArrayInputStream(
            createDicom("P1", "ANA", "MR", "A1", "20240115", "103000", "20240115103000")),
        "application/dicom");
    storage.store(
        new java.io.ByteArrayInputStream(
            createDicom("P2", "BEA", "MR", "A2", "20240115", "153000", "20240115153000")),
        "application/dicom");

    FileReadWriteDimseFindPlugin plugin = new FileReadWriteDimseFindPlugin(storage);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyTime, VR.TM, "100000-120000");
    keys.setString(Tag.AcquisitionDateTime, VR.DT, "20240115100000-20240115120000");

    var requestNoDateTimeNegotiation =
        new DimseFindServicePlugin.FindRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            DimseFindServicePlugin.QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            4,
            keys,
            null,
            java.util.Map.of(),
            false,
            false,
            () -> false);
    assertEquals(0, plugin.find(requestNoDateTimeNegotiation).size());

    var requestWithDateTimeNegotiation =
        new DimseFindServicePlugin.FindRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            DimseFindServicePlugin.QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            5,
            keys,
            null,
            java.util.Map.of(),
            false,
            true,
            () -> false);
    assertEquals(1, plugin.find(requestWithDateTimeNegotiation).size());
  }

  @Test
  void supportsFuzzyPersonNameWhenNegotiated() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-fuzzy");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    storage.store(
        new java.io.ByteArrayInputStream(
            createDicom("P1", "FELIX^ALMEIDA", "MR", "A1", "20240101", "101010", "20240101101010")),
        "application/dicom");

    FileReadWriteDimseFindPlugin plugin = new FileReadWriteDimseFindPlugin(storage);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.PatientName, VR.PN, "felixal");

    var requestWithoutFuzzy =
        new DimseFindServicePlugin.FindRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            DimseFindServicePlugin.QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            6,
            keys,
            null,
            java.util.Map.of(),
            false,
            false,
            () -> false);
    assertEquals(0, plugin.find(requestWithoutFuzzy).size());

    var requestWithFuzzy =
        new DimseFindServicePlugin.FindRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            DimseFindServicePlugin.QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            7,
            keys,
            null,
            java.util.Map.of(),
            true,
            false,
            () -> false);
    assertEquals(1, plugin.find(requestWithFuzzy).size());
  }

  @Test
  void supportsNestedSequenceMatching() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-nested");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    storage.store(
        new java.io.ByteArrayInputStream(
            createDicom("P1", "NESTED", "MR", "A1", "20240101", "101010", "20240101101010")),
        "application/dicom");

    FileReadWriteDimseFindPlugin plugin = new FileReadWriteDimseFindPlugin(storage);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    Sequence seq = keys.newSequence(Tag.RequestAttributesSequence, 1);
    Attributes item = new Attributes();
    item.setString(Tag.AccessionNumber, VR.SH, "A1");
    seq.add(item);

    var request =
        new DimseFindServicePlugin.FindRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            DimseFindServicePlugin.QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            8,
            keys,
            null,
            java.util.Map.of(),
            false,
            false,
            () -> false);
    assertEquals(1, plugin.find(request).size());
  }

  @Test
  void stopsEarlyWhenCancelRequested() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-cancel");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    storage.store(
        new java.io.ByteArrayInputStream(
            createDicom("P1", "CANCEL", "MR", "A1", "20240101", "101010", "20240101101010")),
        "application/dicom");

    FileReadWriteDimseFindPlugin plugin = new FileReadWriteDimseFindPlugin(storage);
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");

    var request =
        new DimseFindServicePlugin.FindRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            DimseFindServicePlugin.QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            9,
            keys,
            null,
            java.util.Map.of(),
            false,
            false,
            () -> true);

    assertEquals(0, plugin.find(request).size());
  }

  @Test
  void resolvesMoveCandidatesByStudy() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-move");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    storage.store(
        new java.io.ByteArrayInputStream(
            createDicom("P1", "MOVE", "MR", "A1", "20240101", "101010", "20240101101010")),
        "application/dicom");

    FileReadWriteDimseFindPlugin plugin = new FileReadWriteDimseFindPlugin(storage);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");

    DimseMoveServicePlugin.MoveRequest request =
        new DimseMoveServicePlugin.MoveRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            DimseFindServicePlugin.QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            "DEST",
            10,
            keys,
            () -> false);

    assertEquals(1, plugin.resolve(request).size());
  }

  private byte[] createDicom(
      String patientId, String patientName, String modality, String accession, String studyDate)
      throws Exception {
    return createDicom(
        patientId, patientName, modality, accession, studyDate, "101010", "20240101101010");
  }

  private byte[] createDicom(
      String patientId,
      String patientName,
      String modality,
      String accession,
      String studyDate,
      String studyTime,
      String acquisitionDateTime)
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
    attrs.setString(Tag.AccessionNumber, VR.SH, accession);
    attrs.setString(Tag.StudyDate, VR.DA, studyDate);
    attrs.setString(Tag.StudyTime, VR.TM, studyTime);
    attrs.setString(Tag.AcquisitionDateTime, VR.DT, acquisitionDateTime);
    Sequence requestSequence = attrs.newSequence(Tag.RequestAttributesSequence, 1);
    Attributes requestItem = new Attributes();
    requestItem.setString(Tag.AccessionNumber, VR.SH, accession);
    requestSequence.add(requestItem);

    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
    try (DicomOutputStream dos = new DicomOutputStream(out, UID.ExplicitVRLittleEndian)) {
      dos.writeDataset(fmi, attrs);
    }
    return out.toByteArray();
  }
}
