package org.dicoogle.protocol.dimse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.function.BooleanSupplier;
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
import org.dcm4che3.net.QueryOption;
import org.dcm4che3.net.Status;
import org.dcm4che3.net.TransferCapability;
import org.dcm4che3.net.pdu.AAssociateRQ;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.PluginMetadata;
import org.dicoogle.sdk.query.QueryService;
import org.dicoogle.sdk.storage.StoredObject;
import org.dicoogle.sdk.storage.WritableStoragePlugin;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class DimseCFindSCPIntegrationTest {

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
  void negotiatedFuzzyMatchingReturnsResult() throws Exception {
    Path root = Files.createTempDirectory("cfind-integ-fuzzy");
    int port = randomPort();
    startServer(root, port);

    storeDicom(
        root, createDicom("P1", "FELIX^ALMEIDA", "A1", "20240101", "101010", "20240101101010"));

    association = openScu(port, EnumSet.of(QueryOption.FUZZY));
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.PatientName, VR.PN, "felixal");

    DimseRSP rsp =
        association.cfind("1.2.840.10008.5.1.4.1.2.2.1", 0, keys, UID.ImplicitVRLittleEndian, 0);

    int pending = 0;
    boolean successSeen = false;
    while (rsp.next()) {
      int status = rsp.getCommand().getInt(Tag.Status, -1);
      if (Status.isPending(status)) {
        pending++;
      } else {
        successSeen = status == Status.Success;
      }
    }

    assertTrue(successSeen);
    assertTrue(pending >= 1);
  }

  @Test
  void missingDateTimeNegotiationReturnsIdentifierError() throws Exception {
    Path root = Files.createTempDirectory("cfind-integ-datetime");
    int port = randomPort();
    startServer(root, port);

    storeDicom(root, createDicom("P1", "ANA", "A1", "20240101", "101010", "20240101101010"));

    association = openScu(port, EnumSet.noneOf(QueryOption.class));
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.AcquisitionDateTime, VR.DT, "20240101000000-20241231235959");

    DimseRSP rsp =
        association.cfind("1.2.840.10008.5.1.4.1.2.2.1", 0, keys, UID.ImplicitVRLittleEndian, 0);
    assertTrue(rsp.next());
    int status = rsp.getCommand().getInt(Tag.Status, -1);
    assertEquals(Status.IdentifierDoesNotMatchSOPClass, status);
  }

  @Test
  void negotiatedDateTimeRangeReturnsPendingMatch() throws Exception {
    Path root = Files.createTempDirectory("cfind-integ-datetime-ok");
    int port = randomPort();
    startServer(root, port);

    storeDicom(root, createDicom("P1", "ANA", "A1", "20240101", "101010", "20240101101010"));

    association = openScu(port, EnumSet.of(QueryOption.DATETIME));
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.AcquisitionDateTime, VR.DT, "20240101000000-20241231235959");

    DimseRSP rsp =
        association.cfind("1.2.840.10008.5.1.4.1.2.2.1", 0, keys, UID.ImplicitVRLittleEndian, 0);

    int pending = 0;
    int finalStatus = -1;
    while (rsp.next()) {
      int status = rsp.getCommand().getInt(Tag.Status, -1);
      if (Status.isPending(status)) {
        pending++;
      } else {
        finalStatus = status;
      }
    }

    assertTrue(pending >= 1);
    assertEquals(Status.Success, finalStatus);
  }

  private void startServer(Path root, int port) {
    WritableStoragePlugin storage = new InMemoryStoragePlugin(root);
    CStoreService cStoreService = new CStoreService(new StorageRouter(List.of(storage)));
    CFindService cFindService =
        new CFindService(
            List.of(new IntegrationFindPlugin(root)),
            List.of(),
            new DimseCFindProperties(),
            new SimpleMeterRegistry());
    CMoveService cMoveService =
        new CMoveService(
            List.of(),
            List.of(),
            new DimseCFindProperties(),
            new DimseCMoveProperties(),
            new SimpleMeterRegistry());

    DimseCStoreProperties properties = new DimseCStoreProperties();
    properties.setEnabled(true);
    properties.setAeTitle("DICOOGLE");
    properties.setBindAddress("127.0.0.1");
    properties.setPort(port);
    properties.setStorageScheme("mem");

    server =
        new DimseCStoreServer(
            cStoreService,
            cFindService,
            cMoveService,
            new StorageRouter(List.of(storage)),
            properties,
            "mem");
    server.start();
  }

  private Association openScu(int port, EnumSet<QueryOption> options)
      throws IOException,
          InterruptedException,
          GeneralSecurityException,
          IncompatibleConnectionException {
    scuDevice = new Device("cfind-scu-device");
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
            "cfind-scu",
            "1.2.840.10008.5.1.4.1.2.2.1",
            TransferCapability.Role.SCU,
            UID.ImplicitVRLittleEndian,
            UID.ExplicitVRLittleEndian);
    tc.setQueryOptions(EnumSet.of(QueryOption.DATETIME, QueryOption.FUZZY));
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
            "1.2.840.10008.5.1.4.1.2.2.1",
            UID.ImplicitVRLittleEndian,
            UID.ExplicitVRLittleEndian));
    rq.addExtendedNegotiation(
        new org.dcm4che3.net.pdu.ExtendedNegotiation(
            "1.2.840.10008.5.1.4.1.2.2.1", QueryOption.toExtendedNegotiationInformation(options)));

    return scu.connect(localConn, remote, rq);
  }

  private static int randomPort() throws IOException {
    try (ServerSocket socket = new ServerSocket(0)) {
      return socket.getLocalPort();
    }
  }

  private static byte[] createDicom(
      String patientId,
      String patientName,
      String accession,
      String studyDate,
      String studyTime,
      String acquisitionDateTime)
      throws IOException {
    Attributes fmi = new Attributes();
    fmi.setString(Tag.TransferSyntaxUID, VR.UI, UID.ExplicitVRLittleEndian);
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
    attrs.setString(Tag.PatientID, VR.LO, patientId);
    attrs.setString(Tag.PatientName, VR.PN, patientName);
    attrs.setString(Tag.AccessionNumber, VR.SH, accession);
    attrs.setString(Tag.StudyDate, VR.DA, studyDate);
    attrs.setString(Tag.StudyTime, VR.TM, studyTime);
    attrs.setString(Tag.AcquisitionDateTime, VR.DT, acquisitionDateTime);

    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
    try (DicomOutputStream dos = new DicomOutputStream(out, UID.ExplicitVRLittleEndian)) {
      dos.writeDataset(fmi, attrs);
    }
    return out.toByteArray();
  }

  private static void storeDicom(Path root, byte[] payload) throws IOException {
    WritableStoragePlugin plugin = new InMemoryStoragePlugin(root);
    StoredObject stored = plugin.store(new ByteArrayInputStream(payload), "application/dicom");
    assertNotNull(stored);
    assertFalse(stored.location().toString().isBlank());
  }

  private record InMemoryStoragePlugin(Path root) implements WritableStoragePlugin {

    @Override
    public String scheme() {
      return "mem";
    }

    @Override
    public org.dicoogle.sdk.PluginMetadata metadata() {
      return new org.dicoogle.sdk.PluginMetadata("mem", "Mem Storage", "1.0.0", "storage");
    }

    @Override
    public StoredObject store(java.io.InputStream data, String contentType) throws IOException {
      byte[] bytes = data.readAllBytes();
      String patient = "UNKNOWN";
      String study = "UNKNOWN";
      String series = "UNKNOWN";
      String sop = "UNKNOWN";
      try (org.dcm4che3.io.DicomInputStream dis =
          new org.dcm4che3.io.DicomInputStream(new ByteArrayInputStream(bytes))) {
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

  private record IntegrationFindPlugin(Path root) implements QueryService {

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("integration-find", "Integration Find", "1.0.0", "query-index");
    }

    @Override
    public List<Attributes> query(QueryRequest request) throws IOException {
      List<Attributes> out = new ArrayList<>();
      BooleanSupplier cancelRequested = request.cancelRequested();
      List<Path> files =
          Files.walk(root)
              .filter(
                  path ->
                      Files.isRegularFile(path) && path.getFileName().toString().endsWith(".dcm"))
              .toList();

      for (Path file : files) {
        if (cancelRequested != null && cancelRequested.getAsBoolean()) {
          break;
        }
        try (DicomInputStream dis = new DicomInputStream(Files.newInputStream(file))) {
          Attributes attrs = dis.readDataset();
          if (!matches(attrs, request)) {
            continue;
          }
          out.add(attrs);
        }
      }
      return out;
    }

    private boolean matches(Attributes attrs, QueryRequest request) {
      String expectedName = request.keys().getString(Tag.PatientName, null);
      if (expectedName != null && !expectedName.isBlank()) {
        String actualName = attrs.getString(Tag.PatientName, "");
        if (request.fuzzyMatchingEnabled()) {
          String lhs = actualName.toLowerCase().replaceAll("[^a-z0-9]", "");
          String rhs = expectedName.toLowerCase().replaceAll("[^a-z0-9]", "");
          if (!lhs.contains(rhs)) {
            return false;
          }
        } else if (!actualName.equalsIgnoreCase(expectedName)) {
          return false;
        }
      }

      String expectedDateTime = request.keys().getString(Tag.AcquisitionDateTime, null);
      if (expectedDateTime != null && !expectedDateTime.isBlank()) {
        if (!request.dateTimeMatchingEnabled()) {
          return false;
        }
        String actualDateTime = attrs.getString(Tag.AcquisitionDateTime, "");
        int dash = expectedDateTime.indexOf('-');
        if (dash < 0) {
          return actualDateTime.equals(expectedDateTime);
        }
        String start = expectedDateTime.substring(0, dash).trim();
        String end = expectedDateTime.substring(dash + 1).trim();
        if (!start.isBlank() && actualDateTime.compareTo(start) < 0) {
          return false;
        }
        if (!end.isBlank() && actualDateTime.compareTo(end) > 0) {
          return false;
        }
      }
      return true;
    }
  }
}
