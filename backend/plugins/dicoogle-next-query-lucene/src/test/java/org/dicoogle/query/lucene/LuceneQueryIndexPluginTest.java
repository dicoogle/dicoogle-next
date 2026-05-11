package org.dicoogle.query.lucene;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
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
import org.dicoogle.sdk.query.DimseFindServicePlugin;
import org.dicoogle.sdk.query.DimseMoveServicePlugin;
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
    properties.setAutoReindexOnStartup(false);
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
        new DimseFindServicePlugin.FindRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            DimseFindServicePlugin.QueryRetrieveLevel.STUDY,
            "CALLING",
            "CALLED",
            2,
            keys,
            "felix",
            java.util.Map.of("modality", "MR"),
            false,
            false,
            () -> false);

    List<Attributes> findResult = plugin.find(findRequest);
    assertFalse(findResult.isEmpty());

    var moveRequest =
        new DimseMoveServicePlugin.MoveRequest(
            DimseFindServicePlugin.InformationModel.STUDY_ROOT,
            DimseFindServicePlugin.QueryRetrieveLevel.STUDY,
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
  void reindexBuildsIndexFromFilesystem() throws Exception {
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
    properties.setAutoReindexOnStartup(false);
    properties.setWatchStorage(false);

    LuceneQueryIndexPlugin plugin = new LuceneQueryIndexPlugin(router, properties);
    int indexed = plugin.reindex();
    assertTrue(indexed >= 1);
    assertTrue(plugin.indexedDocuments() >= 1);
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
