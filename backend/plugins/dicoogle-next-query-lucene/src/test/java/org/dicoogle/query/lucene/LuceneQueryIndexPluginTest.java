package org.dicoogle.query.lucene;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Sequence;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomOutputStream;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.query.QueryMoveService;
import org.dicoogle.sdk.query.QueryRetrieveLevel;
import org.dicoogle.sdk.query.QueryService;
import org.dicoogle.sdk.storage.StorageIngestSuccessEvent;
import org.dicoogle.storage.filerw.FileReadWriteStoragePlugin;
import org.junit.jupiter.api.Test;

class LuceneQueryIndexPluginTest {

  @Test
  void supportsFindAndMoveAndLocatorAfterIngest() throws Exception {
    Path storageRoot = Files.createTempDirectory("lucene-storage");
    Path indexRoot = Files.createTempDirectory("lucene-index");

    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(storageRoot, "file");
    StorageRouter router = new StorageRouter(List.of(storage));

    LuceneQueryProperties properties = new LuceneQueryProperties();
    properties.setRootDir(indexRoot.toString());
    properties.setStorageRootDir(storageRoot.toString());
    properties.setWatchStorage(false);

    LuceneQueryIndexPlugin plugin = new LuceneQueryIndexPlugin(router, properties);

    byte[] dicom = createDicom("P1", "FELIX", "MR", "A1", "20240101");
    var stored = storage.store(new ByteArrayInputStream(dicom), "application/dicom");

    plugin.onIngestSuccess(
        new StorageIngestSuccessEvent(
            1,
            "CALLING",
            "CALLED",
            "file",
            "P1",
            "1.2.3",
            "1.2.3.1",
            "1.2.3.4.5",
            UID.SecondaryCaptureImageStorage,
            stored.location()));

    assertTrue(plugin.indexedDocuments() >= 1);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");

    var findRequest =
        new QueryService.QueryRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            2,
            keys,
            "felix",
            java.util.Map.of("modality", "MR"),
            false,
            false,
            () -> false,
            null);

    List<QueryService.QueryResult> findResult = plugin.query(findRequest);
    assertFalse(findResult.isEmpty());
    assertNotNull(findResult.getFirst().storageUri());

    var moveRequest =
        new QueryMoveService.MoveRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            "DEST",
            3,
            keys,
            () -> false);

    assertEquals(1, plugin.resolve(moveRequest).size());
    assertTrue(plugin.locateInstance("1.2.3", "1.2.3.1", "1.2.3.4.5").isPresent());
    assertEquals(1, plugin.listStudyInstances("1.2.3").size());
    assertEquals(1, plugin.listSeriesInstances("1.2.3", "1.2.3.1").size());

    plugin.stop();
  }

  @Test
  void indexStorageRootBuildsIndexFromFilesystem() throws Exception {
    Path storageRoot = Files.createTempDirectory("lucene-storage-reindex");
    Path indexRoot = Files.createTempDirectory("lucene-index-reindex");

    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(storageRoot, "file");
    storage.store(
        new ByteArrayInputStream(createDicom("P1", "ANA", "MR", "A1", "20240101")),
        "application/dicom");

    StorageRouter router = new StorageRouter(List.of(storage));

    LuceneQueryProperties properties = new LuceneQueryProperties();
    properties.setRootDir(indexRoot.toString());
    properties.setStorageRootDir(storageRoot.toString());
    properties.setWatchStorage(false);

    LuceneQueryIndexPlugin plugin = new LuceneQueryIndexPlugin(router, properties);
    int indexed = plugin.indexPath(storageRoot.toUri());
    assertTrue(indexed >= 1);
    assertTrue(plugin.indexedDocuments() >= 1);
    plugin.stop();
  }

  @Test
  void indexAndUnindexAcceptFileUriAndPlainPathWithoutExtension() throws Exception {
    Path storageRoot = Files.createTempDirectory("lucene-storage-path");
    Path indexRoot = Files.createTempDirectory("lucene-index-path");

    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(storageRoot, "file");
    StorageRouter router = new StorageRouter(List.of(storage));

    LuceneQueryProperties properties = new LuceneQueryProperties();
    properties.setRootDir(indexRoot.toString());
    properties.setStorageRootDir(storageRoot.toString());
    properties.setWatchStorage(false);

    LuceneQueryIndexPlugin plugin = new LuceneQueryIndexPlugin(router, properties);

    Path dicomNoExt = storageRoot.resolve("instance-no-ext");
    Files.write(dicomNoExt, createDicom("P2", "MARTA", "CT", "A2", "20240202"));

    int indexedViaPathUri = plugin.indexPath(dicomNoExt.toUri());
    assertEquals(1, indexedViaPathUri);
    assertTrue(plugin.indexedDocuments() >= 1);

    int removedViaPlainPath = plugin.unindexPath(dicomNoExt.toUri());
    assertEquals(1, removedViaPlainPath);
    assertEquals(0, plugin.locateInstance("1.2.3", "1.2.3.1", "1.2.3.4.5").isPresent() ? 1 : 0);

    assertThrows(
        IllegalArgumentException.class,
        () -> plugin.indexPath(URI.create("http://example.com/file.dcm")));

    plugin.stop();
  }

  @Test
  void unindexDirectoryRemovesIndexedDicomFiles() throws Exception {
    Path storageRoot = Files.createTempDirectory("lucene-storage-unindex-dir");
    Path indexRoot = Files.createTempDirectory("lucene-index-unindex-dir");
    Path dir = storageRoot.resolve("dicom-dir");
    Files.createDirectories(dir);

    Files.write(dir.resolve("a.dcm"), createDicom("P3", "JOAO", "MR", "A3", "20240303"));
    Files.write(dir.resolve("b"), createDicom("P4", "ANA", "CT", "A4", "20240404"));

    FileReadWriteStoragePlugin storage = new FileReadWriteStoragePlugin(storageRoot, "file");
    StorageRouter router = new StorageRouter(List.of(storage));

    LuceneQueryProperties properties = new LuceneQueryProperties();
    properties.setRootDir(indexRoot.toString());
    properties.setStorageRootDir(storageRoot.toString());
    properties.setWatchStorage(false);

    LuceneQueryIndexPlugin plugin = new LuceneQueryIndexPlugin(router, properties);

    assertEquals(2, plugin.indexPath(dir.toUri()));
    assertEquals(2, plugin.indexedDocuments());
    assertEquals(2, plugin.unindexPath(dir.toUri()));
    assertFalse(plugin.locateInstance("1.2.3", "1.2.3.1", "1.2.3.4.5").isPresent());

    plugin.stop();
  }

  private byte[] createDicom(
      String patientId, String patientName, String modality, String accession, String studyDate)
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
