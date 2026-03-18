package pt.ua.dicooglenext.protocol.dimse;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.List;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomOutputStream;
import org.junit.jupiter.api.Test;
import pt.ua.dicooglenext.core.storage.StorageRouter;
import pt.ua.dicooglenext.sdk.PluginMetadata;
import pt.ua.dicooglenext.sdk.storage.StoragePlugin;
import pt.ua.dicooglenext.sdk.storage.StoredObject;

class CStoreServiceTest {

  @Test
  void returnsDimseRefusalWhenOnlyReadOnlyProviderExists() {
    CStoreService service = new CStoreService(new StorageRouter(List.of(new ReadOnlyFilePlugin())));

    CStoreResult result =
        service.store(
            new CStoreRequest(
                "file", createValidDicom(), "application/dicom", "CALLING_AET", "CALLED_AET"));

    assertEquals(CStoreDimseStatus.REFUSED_OUT_OF_RESOURCES, result.status());
  }

  @Test
  void returnsSuccessWhenWritableProviderExists() {
    WritableFilePlugin writable = new WritableFilePlugin();
    CStoreService service =
        new CStoreService(new StorageRouter(List.of(new ReadOnlyFilePlugin(), writable)));

    CStoreResult result =
        service.store(
            new CStoreRequest(
                "file", createValidDicom(), "application/dicom", "CALLING_AET", "CALLED_AET"));

    assertEquals(CStoreDimseStatus.SUCCESS, result.status());
    assertEquals(1, writable.storedCount);
  }

  @Test
  void returnsDimseRefusalWhenNoProviderSupportsScheme() {
    CStoreService service = new CStoreService(new StorageRouter(List.of(new ReadOnlyFilePlugin())));

    CStoreResult result =
        service.store(
            new CStoreRequest(
                "s3", createValidDicom(), "application/dicom", "CALLING_AET", "CALLED_AET"));

    assertEquals(CStoreDimseStatus.REFUSED_OUT_OF_RESOURCES, result.status());
  }

  @Test
  void returnsCannotUnderstandForInvalidDicomPayload() {
    CStoreService service = new CStoreService(new StorageRouter(List.of(new ReadOnlyFilePlugin())));

    CStoreResult result =
        service.store(
            new CStoreRequest(
                "file", "not-dicom".getBytes(), "application/dicom", "CALLING_AET", "CALLED_AET"));

    assertEquals(CStoreDimseStatus.ERROR_CANNOT_UNDERSTAND, result.status());
  }

  private byte[] createValidDicom() {
    try {
      Attributes fmi = new Attributes();
      fmi.setString(Tag.TransferSyntaxUID, VR.UI, UID.ExplicitVRLittleEndian);
      fmi.setString(Tag.MediaStorageSOPClassUID, VR.UI, UID.SecondaryCaptureImageStorage);
      fmi.setString(Tag.MediaStorageSOPInstanceUID, VR.UI, "1.2.826.0.1.3680043.2.1125.1");
      fmi.setString(Tag.ImplementationClassUID, VR.UI, "1.2.826.0.1.3680043.2.1125.99");

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

  private static final class ReadOnlyFilePlugin implements StoragePlugin {

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("ro", "read-only", "0", "storage");
    }

    @Override
    public String scheme() {
      return "file";
    }

    @Override
    public boolean canRead() {
      return true;
    }

    @Override
    public boolean canWrite() {
      return false;
    }

    @Override
    public InputStream openForRead(URI location) {
      throw new UnsupportedOperationException();
    }
  }

  private static final class WritableFilePlugin implements StoragePlugin {

    private int storedCount = 0;

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("rw", "write", "0", "storage");
    }

    @Override
    public String scheme() {
      return "file";
    }

    @Override
    public boolean canRead() {
      return true;
    }

    @Override
    public boolean canWrite() {
      return true;
    }

    @Override
    public InputStream openForRead(URI location) {
      throw new UnsupportedOperationException();
    }

    @Override
    public StoredObject store(InputStream data, String contentType) throws IOException {
      if (data.readAllBytes().length == 0) {
        throw new IOException("empty");
      }
      storedCount++;
      return new StoredObject(URI.create("file:/tmp/fake.dcm"), 10, contentType);
    }
  }
}
