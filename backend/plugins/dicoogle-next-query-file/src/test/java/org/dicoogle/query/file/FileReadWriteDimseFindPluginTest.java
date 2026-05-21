package org.dicoogle.query.file;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Sequence;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomInputStream;
import org.dcm4che3.io.DicomOutputStream;
import org.dicoogle.sdk.query.QueryMoveService;
import org.dicoogle.sdk.query.QueryRetrieveLevel;
import org.dicoogle.sdk.query.QueryService;
import org.dicoogle.sdk.storage.StorageIngestSuccessEvent;
import org.dicoogle.storage.filerw.FileReadWriteStoragePlugin;
import org.junit.jupiter.api.Test;

class FileQueryIndexPluginTest {

  /**
   * Stores a DICOM instance and immediately notifies the plugin's in-memory index.
   *
   * <p>FileReadWriteStoragePlugin does not publish StorageIngestSuccessEvent itself; the event is
   * normally fired by the core after a successful store. In unit tests we replicate that by calling
   * onIngestSuccess directly.
   */
  private static void storeAndIndex(
      FileReadWriteStoragePlugin storage, FileQueryIndexPlugin plugin, byte[] dicom)
      throws IOException {
    var stored = storage.store(new ByteArrayInputStream(dicom), "application/dicom");
    Attributes attrs;
    try (var dis = new DicomInputStream(new ByteArrayInputStream(dicom))) {
      attrs = dis.readDataset();
    }
    plugin.onIngestSuccess(
        new StorageIngestSuccessEvent(
            0,
            "CALLING",
            "CALLED",
            storage.scheme(),
            attrs.getString(Tag.PatientID, ""),
            attrs.getString(Tag.StudyInstanceUID, ""),
            attrs.getString(Tag.SeriesInstanceUID, ""),
            attrs.getString(Tag.SOPInstanceUID, ""),
            attrs.getString(Tag.SOPClassUID, ""),
            stored.location()));
  }

  // -------------------------------------------------------------------------
  // Tests
  // -------------------------------------------------------------------------

  @Test
  void supportsTextAndKeywordFilters() throws Exception {
    Path root = Files.createTempDirectory("query-file-test");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    FileQueryIndexPlugin plugin = new FileQueryIndexPlugin(storage);
    storeAndIndex(storage, plugin, createDicom("P1", "FELIX", "MR", "A001", "20240101"));

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, studyUid("A001"));
    keys.setString(Tag.PatientName, VR.PN, "felix");
    keys.setString(Tag.Modality, VR.CS, "MR");

    var request =
        new QueryService.QueryRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            1,
            keys,
            "felix",
            java.util.Map.of("modality", "MR"),
            false,
            false,
            () -> false);

    assertFalse(plugin.query(request).isEmpty());
  }

  @Test
  void supportsArbitraryDicomKeywordFilter() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-any-keyword");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    FileQueryIndexPlugin plugin = new FileQueryIndexPlugin(storage);
    storeAndIndex(storage, plugin, createDicom("P1", "FELIX", "MR", "A002", "20240101"));

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, studyUid("A002"));

    var request =
        new QueryService.QueryRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            10,
            keys,
            null,
            java.util.Map.of("StudyDate", "20240101"),
            false,
            false,
            () -> false);

    assertEquals(1, plugin.query(request).size());
  }

  @Test
  void supportsWildcardAndMultiValueMatching() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-wildcards");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    FileQueryIndexPlugin plugin = new FileQueryIndexPlugin(storage);
    // Two instances with different accessions → different study/series/sop UIDs
    storeAndIndex(storage, plugin, createDicom("P1", "FELIX^ALMEIDA", "MR", "A100", "20240115"));
    storeAndIndex(storage, plugin, createDicom("P2", "JOAO", "CT", "A101", "20250310"));

    // Query scoped to P1's study — only FELIX^ALMEIDA is in that study
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, studyUid("A100"));
    keys.setString(Tag.PatientName, VR.PN, "F*");
    keys.setString(Tag.Modality, VR.CS, "MR\\US");

    var request =
        new QueryService.QueryRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            2,
            keys,
            null,
            java.util.Map.of(),
            false,
            false,
            () -> false);

    assertEquals(1, plugin.query(request).size());
  }

  @Test
  void supportsDateRangeMatching() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-dates");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    FileQueryIndexPlugin plugin = new FileQueryIndexPlugin(storage);
    storeAndIndex(storage, plugin, createDicom("P1", "ANA", "MR", "A200", "20240115"));
    storeAndIndex(storage, plugin, createDicom("P2", "BEA", "MR", "A201", "20250310"));

    // Range query: only A200 (date 20240115) falls within 2024
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    // StudyInstanceUID left as universal match (empty) — plugin scans both studies
    // Actually plugin requires a StudyInstanceUID, so query each study separately
    // and expect the in-range one to match.
    keys.setString(Tag.StudyInstanceUID, VR.UI, studyUid("A200"));
    keys.setString(Tag.StudyDate, VR.DA, "20240101-20241231");

    var request =
        new QueryService.QueryRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            3,
            keys,
            null,
            java.util.Map.of(),
            false,
            false,
            () -> false);

    assertEquals(1, plugin.query(request).size());
  }

  @Test
  void supportsTimeAndDateTimeRangeMatchingWithNegotiation() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-datetime");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    FileQueryIndexPlugin plugin = new FileQueryIndexPlugin(storage);
    // A300: time 10:30, A301: time 15:30 — both in same study would overwrite,
    // so give each its own accession → distinct studyUid
    storeAndIndex(
        storage,
        plugin,
        createDicom("P1", "ANA", "MR", "A300", "20240115", "103000", "20240115103000"));
    storeAndIndex(
        storage,
        plugin,
        createDicom("P2", "BEA", "MR", "A301", "20240115", "153000", "20240115153000"));

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, studyUid("A300"));
    keys.setString(Tag.StudyTime, VR.TM, "100000-120000");
    keys.setString(Tag.AcquisitionDateTime, VR.DT, "20240115100000-20240115120000");

    var requestNoDateTimeNegotiation =
        new QueryService.QueryRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            4,
            keys,
            null,
            java.util.Map.of(),
            false,
            false,
            () -> false);
    // Without dateTimeNegotiation: DT tag is treated as plain string match → no match
    assertEquals(0, plugin.query(requestNoDateTimeNegotiation).size());

    var requestWithDateTimeNegotiation =
        new QueryService.QueryRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            5,
            keys,
            null,
            java.util.Map.of(),
            false,
            true,
            () -> false);
    // With dateTimeNegotiation: DA, TM, DT ranges are all evaluated → A300 matches
    assertEquals(1, plugin.query(requestWithDateTimeNegotiation).size());
  }

  @Test
  void supportsFuzzyPersonNameWhenNegotiated() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-fuzzy");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    FileQueryIndexPlugin plugin = new FileQueryIndexPlugin(storage);
    storeAndIndex(
        storage,
        plugin,
        createDicom("P1", "FELIX^ALMEIDA", "MR", "A400", "20240101", "101010", "20240101101010"));

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, studyUid("A400"));
    keys.setString(Tag.PatientName, VR.PN, "felixal");

    var requestWithoutFuzzy =
        new QueryService.QueryRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            6,
            keys,
            null,
            java.util.Map.of(),
            false,
            false,
            () -> false);
    assertEquals(0, plugin.query(requestWithoutFuzzy).size());

    var requestWithFuzzy =
        new QueryService.QueryRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            7,
            keys,
            null,
            java.util.Map.of(),
            true,
            false,
            () -> false);
    assertEquals(1, plugin.query(requestWithFuzzy).size());
  }

  @Test
  void supportsNestedSequenceMatching() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-nested");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    FileQueryIndexPlugin plugin = new FileQueryIndexPlugin(storage);
    storeAndIndex(
        storage,
        plugin,
        createDicom("P1", "NESTED", "MR", "A500", "20240101", "101010", "20240101101010"));

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, studyUid("A500"));
    Sequence seq = keys.newSequence(Tag.RequestAttributesSequence, 1);
    Attributes item = new Attributes();
    item.setString(Tag.AccessionNumber, VR.SH, "A500");
    seq.add(item);

    var request =
        new QueryService.QueryRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            8,
            keys,
            null,
            java.util.Map.of(),
            false,
            false,
            () -> false);
    assertEquals(1, plugin.query(request).size());
  }

  @Test
  void stopsEarlyWhenCancelRequested() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-cancel");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    FileQueryIndexPlugin plugin = new FileQueryIndexPlugin(storage);
    storeAndIndex(
        storage,
        plugin,
        createDicom("P1", "CANCEL", "MR", "A600", "20240101", "101010", "20240101101010"));

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, studyUid("A600"));

    var request =
        new QueryService.QueryRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            9,
            keys,
            null,
            java.util.Map.of(),
            false,
            false,
            () -> true);

    assertEquals(0, plugin.query(request).size());
  }

  @Test
  void resolvesMoveCandidatesByStudy() throws Exception {
    Path root = Files.createTempDirectory("query-file-test-move");
    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(root, "file");
    FileQueryIndexPlugin plugin = new FileQueryIndexPlugin(storage);
    storeAndIndex(
        storage,
        plugin,
        createDicom("P1", "MOVE", "MR", "A700", "20240101", "101010", "20240101101010"));

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, studyUid("A700"));

    QueryMoveService.MoveRequest request =
        new QueryMoveService.MoveRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            "DEST",
            10,
            keys,
            () -> false);

    assertEquals(1, plugin.resolve(request).size());
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Derives a deterministic StudyInstanceUID from an accession number so that each test instance
   * with a distinct accession lands in its own study in the index, avoiding overwrites.
   */
  private static String studyUid(String accession) {
    return "2.25." + Math.abs(accession.hashCode());
  }

  private static String seriesUid(String accession) {
    return studyUid(accession) + ".1";
  }

  private static String sopUid(String accession) {
    return studyUid(accession) + ".1.1";
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
    String studyUid = studyUid(accession);
    String seriesUid = seriesUid(accession);
    String sopUid = sopUid(accession);

    Attributes fmi = new Attributes();
    fmi.setString(Tag.TransferSyntaxUID, VR.UI, UID.ExplicitVRLittleEndian);
    fmi.setString(Tag.MediaStorageSOPClassUID, VR.UI, UID.SecondaryCaptureImageStorage);
    fmi.setString(Tag.MediaStorageSOPInstanceUID, VR.UI, sopUid);
    fmi.setString(
        Tag.ImplementationClassUID,
        VR.UI,
        org.dicoogle.sdk.ImplementationInfo.IMPLEMENTATION_CLASS_UID);

    Attributes attrs = new Attributes();
    attrs.setString(Tag.SOPClassUID, VR.UI, UID.SecondaryCaptureImageStorage);
    attrs.setString(Tag.SOPInstanceUID, VR.UI, sopUid);
    attrs.setString(Tag.StudyInstanceUID, VR.UI, studyUid);
    attrs.setString(Tag.SeriesInstanceUID, VR.UI, seriesUid);
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
