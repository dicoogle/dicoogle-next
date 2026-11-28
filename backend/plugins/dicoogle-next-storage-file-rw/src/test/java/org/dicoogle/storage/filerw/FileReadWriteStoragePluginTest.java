package org.dicoogle.storage.filerw;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomOutputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FileReadWriteStoragePluginTest {

  @TempDir Path tempDir;

  @Test
  void storesUsingOldStyleHierarchyAndReadsBack() throws Exception {
    FileReadWriteStoragePlugin plugin = new FileReadWriteStoragePlugin(tempDir, "file");
    byte[] dicom = createValidDicom();

    var stored = plugin.store(new java.io.ByteArrayInputStream(dicom), "application/dicom");

    Path expected =
        tempDir
            .resolve("PATIENT-1")
            .resolve("1.2.826.0.1.3680043.2.1125.2")
            .resolve("1.2.826.0.1.3680043.2.1125.3")
            .resolve("1.2.826.0.1.3680043.2.1125.1.dcm");

    assertTrue(Files.exists(expected));

    byte[] readBack;
    try (var is = plugin.openForRead(stored.location())) {
      readBack = is.readAllBytes();
    }

    assertArrayEquals(dicom, readBack);
  }

  @Test
  void deletesStoredFile() throws Exception {
    FileReadWriteStoragePlugin plugin = new FileReadWriteStoragePlugin(tempDir, "file");
    var stored =
        plugin.store(new java.io.ByteArrayInputStream(createValidDicom()), "application/dicom");

    assertEquals(1, plugin.delete(stored.location()));
    assertFalse(Files.exists(Path.of(stored.location())));
    assertEquals(0, plugin.delete(stored.location()));
  }

  @Test
  void deletesEverythingBelowAFolder() throws Exception {
    FileReadWriteStoragePlugin plugin = new FileReadWriteStoragePlugin(tempDir, "file");
    plugin.store(new java.io.ByteArrayInputStream(createValidDicom()), "application/dicom");
    Path patient = tempDir.resolve("PATIENT-1");

    assertEquals(1, plugin.delete(patient.toUri()));
    assertFalse(Files.exists(patient));
    assertTrue(Files.exists(tempDir));
  }

  @Test
  void refusesToDeleteOutsideOrAtTheRoot() throws Exception {
    Path root = Files.createDirectory(tempDir.resolve("root"));
    Path outside = Files.writeString(tempDir.resolve("outside.txt"), "keep");
    FileReadWriteStoragePlugin plugin = new FileReadWriteStoragePlugin(root, "file");

    assertThrows(IOException.class, () -> plugin.delete(outside.toUri()));
    assertThrows(IOException.class, () -> plugin.delete(root.toUri()));
    assertTrue(Files.exists(outside));
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
