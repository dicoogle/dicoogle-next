package org.dicoogle.storage.filerw;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
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
