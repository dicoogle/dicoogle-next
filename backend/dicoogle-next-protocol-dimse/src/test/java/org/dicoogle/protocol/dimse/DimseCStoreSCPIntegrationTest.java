package org.dicoogle.protocol.dimse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.util.List;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomInputStream;
import org.dcm4che3.io.DicomOutputStream;
import org.dcm4che3.net.ApplicationEntity;
import org.dcm4che3.net.Association;
import org.dcm4che3.net.Connection;
import org.dcm4che3.net.Device;
import org.dcm4che3.net.DimseRSP;
import org.dcm4che3.net.IncompatibleConnectionException;
import org.dcm4che3.net.Status;
import org.dcm4che3.net.TransferCapability;
import org.dcm4che3.net.pdu.AAssociateRQ;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.PluginMetadata;
import org.dicoogle.sdk.storage.StoredObject;
import org.dicoogle.sdk.storage.WritableStoragePlugin;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class DimseCStoreSCPIntegrationTest {

  private DimseCStoreServer server;
  private Device scuDevice;
  private Association association;

  @AfterEach
  void tearDown() throws Exception {
    if (association != null) {
      association.release();
      association.waitForSocketClose();
      association = null;
    }
    if (scuDevice != null) {
      scuDevice.waitForNoOpenConnections();
      scuDevice.unbindConnections();
      scuDevice = null;
    }
    if (server != null) {
      server.stop();
      server = null;
    }
  }

  @Test
  void cstoreImplicitVRLittleEndianSucceeds() throws Exception {
    Path root = Files.createTempDirectory("cstore-integ-implicit");
    int port = randomPort();
    startServer(root, port);

    byte[] payload = createImplicitVRLittleEndianDicom();

    association = openScu(port);

    // Send C-STORE-RQ over the association (Implicit VR Little Endian transfer syntax)
    Attributes dataset = readDataset(payload);
    String sopClassUid = dataset.getString(Tag.SOPClassUID);
    String sopInstanceUid = dataset.getString(Tag.SOPInstanceUID);

    DimseRSP rsp =
        association.cstore(
            sopClassUid,
            sopInstanceUid,
            0,
            new org.dcm4che3.net.DataWriterAdapter(dataset),
            UID.ImplicitVRLittleEndian);
    assertTrue(rsp.next());
    int status = rsp.getCommand().getInt(Tag.Status, -1);
    assertEquals(Status.Success, status, "C-STORE with Implicit VR LE should succeed");
  }

  private void startServer(Path root, int port) throws Exception {
    WritableStoragePlugin storage = new InMemoryStoragePlugin(root);
    CStoreService cStoreService = new CStoreService(new StorageRouter(List.of(storage)));

    DimseCStoreProperties cstoreProps = new DimseCStoreProperties();
    cstoreProps.setEnabled(true);
    cstoreProps.setAeTitle("DICOOGLE");
    cstoreProps.setBindAddress("127.0.0.1");
    cstoreProps.setPort(port);
    cstoreProps.setStorageScheme("mem");

    server =
        new DimseCStoreServer(
            cStoreService, new StorageRouter(List.of(storage)), cstoreProps, "mem");
    server.start();
  }

  private Association openScu(int port)
      throws IOException,
          InterruptedException,
          GeneralSecurityException,
          IncompatibleConnectionException {
    scuDevice = new Device("cstore-scu-device");
    scuDevice.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
    scuDevice.setScheduledExecutor(
        java.util.concurrent.Executors.newSingleThreadScheduledExecutor());
    Connection localConn = new Connection();
    localConn.setHostname("127.0.0.1");
    ApplicationEntity scu = new ApplicationEntity("TESTSCU");
    scu.setAssociationInitiator(true);
    scu.setAssociationAcceptor(false);
    TransferCapability tc =
        new TransferCapability(
            "cstore-scu",
            UID.SecondaryCaptureImageStorage,
            TransferCapability.Role.SCU,
            UID.ImplicitVRLittleEndian,
            UID.ExplicitVRLittleEndian);
    scu.addTransferCapability(tc);

    scuDevice.addConnection(localConn);
    scuDevice.addApplicationEntity(scu);
    scu.addConnection(localConn);

    Connection remote = new Connection();
    remote.setHostname("127.0.0.1");
    remote.setPort(port);

    AAssociateRQ rq = new AAssociateRQ();
    rq.setCallingAET("TESTSCU");
    rq.setCalledAET("DICOOGLE");
    rq.addPresentationContext(
        new org.dcm4che3.net.pdu.PresentationContext(
            1,
            UID.SecondaryCaptureImageStorage,
            UID.ImplicitVRLittleEndian,
            UID.ExplicitVRLittleEndian));

    return scu.connect(localConn, remote, rq);
  }

  private static int randomPort() throws IOException {
    try (ServerSocket socket = new ServerSocket(0)) {
      return socket.getLocalPort();
    }
  }

  private static byte[] createImplicitVRLittleEndianDicom() throws IOException {
    Attributes fmi = new Attributes();
    fmi.setString(Tag.TransferSyntaxUID, VR.UI, UID.ImplicitVRLittleEndian);
    fmi.setString(Tag.MediaStorageSOPClassUID, VR.UI, UID.SecondaryCaptureImageStorage);
    fmi.setString(Tag.MediaStorageSOPInstanceUID, VR.UI, "1.2.3.4.5.6.7");
    fmi.setString(
        Tag.ImplementationClassUID,
        VR.UI,
        org.dicoogle.sdk.ImplementationInfo.IMPLEMENTATION_CLASS_UID);

    Attributes attrs = new Attributes();
    attrs.setString(Tag.SOPClassUID, VR.UI, UID.SecondaryCaptureImageStorage);
    attrs.setString(Tag.SOPInstanceUID, VR.UI, "1.2.3.4.5.6.7");
    attrs.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");
    attrs.setString(Tag.SeriesInstanceUID, VR.UI, "1.2.3.1");
    attrs.setString(Tag.PatientID, VR.LO, "PATIENT-1");

    ByteArrayOutputStream out = new ByteArrayOutputStream();
    try (DicomOutputStream dos = new DicomOutputStream(out, UID.ExplicitVRLittleEndian)) {
      dos.writeDataset(fmi, attrs);
    }
    return out.toByteArray();
  }

  private static Attributes readDataset(byte[] payload) throws IOException {
    try (DicomInputStream dis = new DicomInputStream(new ByteArrayInputStream(payload))) {
      return dis.readDataset();
    }
  }

  private record InMemoryStoragePlugin(Path root) implements WritableStoragePlugin {

    @Override
    public String scheme() {
      return "mem";
    }

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("mem", "Mem Storage", "1.0.0", "storage");
    }

    @Override
    public StoredObject store(InputStream data, String contentType) throws IOException {
      byte[] bytes = data.readAllBytes();
      String patient = "UNKNOWN";
      String study = "UNKNOWN";
      String series = "UNKNOWN";
      String sop = "UNKNOWN";
      try (DicomInputStream dis = new DicomInputStream(new ByteArrayInputStream(bytes))) {
        Attributes attrs = dis.readDataset();
        patient = attrs.getString(Tag.PatientID, patient);
        study = attrs.getString(Tag.StudyInstanceUID, study);
        series = attrs.getString(Tag.SeriesInstanceUID, series);
        sop = attrs.getString(Tag.SOPInstanceUID, sop);
      }
      Path path = root.resolve(patient).resolve(study).resolve(series);
      Files.createDirectories(path);
      Path file = path.resolve(sop + ".dcm");
      Files.write(file, bytes);
      return new StoredObject(file.toUri(), bytes.length, contentType);
    }
  }
}
