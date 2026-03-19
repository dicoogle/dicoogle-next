package pt.ua.dicooglenext.protocol.dicomweb;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomOutputStream;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import pt.ua.dicooglenext.core.storage.StorageRouter;
import pt.ua.dicooglenext.sdk.PluginMetadata;
import pt.ua.dicooglenext.sdk.service.StorageRetrieveEventListener;
import pt.ua.dicooglenext.sdk.storage.HierarchicalDicomStoragePlugin;
import pt.ua.dicooglenext.sdk.storage.StoragePlugin;
import pt.ua.dicooglenext.sdk.storage.StoredObject;

class DicomwebRetrieveServiceTest {

  @Test
  void retrievesInstanceAndMetadata() {
    byte[] dicom = createValidDicom();
    InMemoryHierarchicalStoragePlugin plugin = new InMemoryHierarchicalStoragePlugin(dicom);
    DicomwebRetrieveService service =
        new DicomwebRetrieveService(
            List.of(plugin),
            new StorageRouter(List.<StoragePlugin>of(plugin)),
            List.<StorageRetrieveEventListener>of(),
            new SimpleMeterRegistry());

    byte[] retrieved =
        service.retrieveInstance(
            "1.2.826.0.1.3680043.2.1125.2",
            "1.2.826.0.1.3680043.2.1125.3",
            "1.2.826.0.1.3680043.2.1125.1");
    assertEquals(dicom.length, retrieved.length);

    Map<String, Object> metadata =
        service.instanceMetadata(
            "1.2.826.0.1.3680043.2.1125.2",
            "1.2.826.0.1.3680043.2.1125.3",
            "1.2.826.0.1.3680043.2.1125.1");
    assertEquals("PATIENT-1", metadata.get("PatientID"));
    assertNotNull(metadata.get("location"));
  }

  @Test
  void returnsNotFoundWhenNoStoragePluginCanLocateInstance() {
    DicomwebRetrieveService service =
        new DicomwebRetrieveService(
            List.of(new EmptyHierarchicalStoragePlugin()),
            new StorageRouter(List.<StoragePlugin>of()),
            List.<StorageRetrieveEventListener>of(),
            new SimpleMeterRegistry());

    ResponseStatusException ex =
        assertThrows(
            ResponseStatusException.class,
            () -> service.retrieveInstance("missing-study", "missing-series", "missing-instance"));

    assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
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

  private static final class InMemoryHierarchicalStoragePlugin
      implements HierarchicalDicomStoragePlugin {

    private static final URI LOCATION =
        URI.create(
            "file:/tmp/PATIENT-1/1.2.826.0.1.3680043.2.1125.2/1.2.826.0.1.3680043.2.1125.3/1.2.826.0.1.3680043.2.1125.1.dcm");

    private final byte[] payload;

    private InMemoryHierarchicalStoragePlugin(byte[] payload) {
      this.payload = payload;
    }

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("test", "test", "1", "storage");
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
      return new ByteArrayInputStream(payload);
    }

    @Override
    public StoredObject store(InputStream data, String contentType) {
      return new StoredObject(LOCATION, payload.length, contentType);
    }

    @Override
    public Optional<URI> locateInstance(
        String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) {
      return Optional.of(LOCATION);
    }

    @Override
    public List<URI> listStudyInstances(String studyInstanceUid) {
      return List.of(LOCATION);
    }

    @Override
    public List<URI> listSeriesInstances(String studyInstanceUid, String seriesInstanceUid) {
      return List.of(LOCATION);
    }
  }

  private static final class EmptyHierarchicalStoragePlugin
      implements HierarchicalDicomStoragePlugin {

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("empty", "empty", "1", "storage");
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

    @Override
    public Optional<URI> locateInstance(
        String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) {
      return Optional.empty();
    }

    @Override
    public List<URI> listStudyInstances(String studyInstanceUid) {
      return List.of();
    }

    @Override
    public List<URI> listSeriesInstances(String studyInstanceUid, String seriesInstanceUid) {
      return List.of();
    }
  }
}
