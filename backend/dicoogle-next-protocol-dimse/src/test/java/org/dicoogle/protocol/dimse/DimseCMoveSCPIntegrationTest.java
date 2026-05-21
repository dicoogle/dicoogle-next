package org.dicoogle.protocol.dimse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
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
import org.dcm4che3.net.pdu.PresentationContext;
import org.dcm4che3.net.service.BasicCStoreSCP;
import org.dcm4che3.net.service.DicomServiceRegistry;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.query.file.FileQueryIndexPlugin;
import org.dicoogle.storage.filerw.FileReadWriteStoragePlugin;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class DimseCMoveSCPIntegrationTest {

  private DimseCStoreServer sourceServer;
  private FileReadWriteStoragePlugin storage;
  private FileQueryIndexPlugin queryPlugin;
  private Device destinationDevice;
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
    if (destinationDevice != null) {
      destinationDevice.waitForNoOpenConnections();
      destinationDevice.unbindConnections();
      destinationDevice = null;
    }
    if (sourceServer != null) {
      sourceServer.stop();
      sourceServer = null;
    }
    storage = null;
    queryPlugin = null;
  }

  @Test
  void movesStudyInstancesToConfiguredDestination() throws Exception {
    Path root = Files.createTempDirectory("cmove-integration");
    int sourcePort = randomPort();
    int destinationPort = randomPort();

    List<String> receivedSops = Collections.synchronizedList(new ArrayList<>());
    startDestinationScp(destinationPort, receivedSops);

    String studyUid = "1.2.3.4.5";
    String seriesUid = "1.2.3.4.5.1";
    String sopUid = "1.2.3.4.5.1.1";
    startSourceServer(root, sourcePort, destinationPort);
    storeDicom(createDicom(studyUid, seriesUid, sopUid));

    association = openMoveScu(sourcePort);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, studyUid);

    DimseRSP rsp =
        association.cmove(
            "1.2.840.10008.5.1.4.1.2.2.2", 0, keys, UID.ImplicitVRLittleEndian, "DEST");

    int pendingResponses = 0;
    int finalStatus = -1;
    int completedSubOps = 0;
    while (rsp.next()) {
      int status = rsp.getCommand().getInt(Tag.Status, -1);
      if (Status.isPending(status)) {
        pendingResponses++;
        continue;
      }
      finalStatus = status;
      completedSubOps = rsp.getCommand().getInt(Tag.NumberOfCompletedSuboperations, 0);
    }

    assertTrue(pendingResponses >= 1);
    assertEquals(Status.Success, finalStatus);
    assertEquals(1, completedSubOps);
    assertEquals(List.of(sopUid), receivedSops);
  }

  @Test
  void reportsFailureWhenDestinationUnavailable() throws Exception {
    Path root = Files.createTempDirectory("cmove-integration-dest-down");
    int sourcePort = randomPort();
    int destinationPort = randomPort();

    String studyUid = "1.2.3.4.6";
    String seriesUid = "1.2.3.4.6.1";
    String sopUid = "1.2.3.4.6.1.1";
    startSourceServer(root, sourcePort, destinationPort);
    storeDicom(createDicom(studyUid, seriesUid, sopUid));

    association = openMoveScu(sourcePort);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, studyUid);

    DimseRSP rsp =
        association.cmove(
            "1.2.840.10008.5.1.4.1.2.2.2", 0, keys, UID.ImplicitVRLittleEndian, "DEST");

    int finalStatus = -1;
    while (rsp.next()) {
      int status = rsp.getCommand().getInt(Tag.Status, -1);
      if (!Status.isPending(status)) {
        finalStatus = status;
      }
    }

    assertEquals(Status.UnableToPerformSubOperations, finalStatus);
  }

  @Test
  void reportsCancelWhenMoveIsCancelled() throws Exception {
    Path root = Files.createTempDirectory("cmove-integration-cancel");
    int sourcePort = randomPort();
    int destinationPort = randomPort();

    List<String> receivedSops = Collections.synchronizedList(new ArrayList<>());
    startDestinationScp(destinationPort, receivedSops, true);

    String studyUid = "1.2.3.4.7";
    String seriesUid = "1.2.3.4.7.1";
    startSourceServer(root, sourcePort, destinationPort);
    for (int i = 0; i < 2; i++) {
      storeDicom(createDicom(studyUid, seriesUid, "1.2.3.4.7.1." + (i + 1)));
    }

    association = openMoveScu(sourcePort);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, studyUid);

    DimseRSP rsp =
        association.cmove(
            "1.2.840.10008.5.1.4.1.2.2.2", 0, keys, UID.ImplicitVRLittleEndian, "DEST");

    int finalStatus = -1;
    boolean canceledSent = false;
    while (rsp.next()) {
      int status = rsp.getCommand().getInt(Tag.Status, -1);
      if (Status.isPending(status) && !canceledSent) {
        rsp.cancel(association);
        canceledSent = true;
        continue;
      }
      if (!Status.isPending(status)) {
        finalStatus = status;
      }
    }

    assertTrue(canceledSent);
    assertEquals(Status.Cancel, finalStatus);
    assertTrue(receivedSops.size() <= 2);
  }

  private void startSourceServer(Path root, int sourcePort, int destinationPort) {
    storage = new FileReadWriteStoragePlugin(root, "file");
    StorageRouter storageRouter = new StorageRouter(List.of(storage));
    queryPlugin = new FileQueryIndexPlugin(storage);

    CStoreService cStoreService = new CStoreService(storageRouter);
    CFindService cFindService =
        new CFindService(
            List.of(queryPlugin), List.of(), new DimseCFindProperties(), new SimpleMeterRegistry());

    DimseCMoveProperties moveProperties = new DimseCMoveProperties();
    DimseCMoveProperties.Destination destination = new DimseCMoveProperties.Destination();
    destination.setHost("127.0.0.1");
    destination.setPort(destinationPort);
    destination.setAeTitle("DEST");
    moveProperties.setDestinations(java.util.Map.of("DEST", destination));

    CMoveService cMoveService =
        new CMoveService(
            List.of(queryPlugin),
            List.of(),
            new DimseCFindProperties(),
            moveProperties,
            new SimpleMeterRegistry());

    DimseCStoreProperties cStoreProperties = new DimseCStoreProperties();
    cStoreProperties.setEnabled(true);
    cStoreProperties.setAeTitle("DICOOGLE");
    cStoreProperties.setBindAddress("127.0.0.1");
    cStoreProperties.setPort(sourcePort);
    cStoreProperties.setStorageScheme("file");

    sourceServer =
        new DimseCStoreServer(
            cStoreService, cFindService, cMoveService, storageRouter, cStoreProperties, "file");
    sourceServer.start();
  }

  private void startDestinationScp(int port, List<String> receivedSops) throws Exception {
    startDestinationScp(port, receivedSops, false);
  }

  private void startDestinationScp(int port, List<String> receivedSops, boolean slowStore)
      throws Exception {
    destinationDevice = new Device("cmove-destination-device");
    destinationDevice.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
    destinationDevice.setScheduledExecutor(
        java.util.concurrent.Executors.newSingleThreadScheduledExecutor());

    ApplicationEntity destinationAe = new ApplicationEntity("DEST");
    destinationAe.setAssociationAcceptor(true);
    destinationAe.setAssociationInitiator(false);
    destinationAe.addTransferCapability(
        new TransferCapability(
            "dest-store",
            UID.SecondaryCaptureImageStorage,
            TransferCapability.Role.SCP,
            UID.ImplicitVRLittleEndian,
            UID.ExplicitVRLittleEndian));

    Connection connection = new Connection();
    connection.setHostname("127.0.0.1");
    connection.setPort(port);

    destinationDevice.addConnection(connection);
    destinationDevice.addApplicationEntity(destinationAe);
    destinationAe.addConnection(connection);

    DicomServiceRegistry services = new DicomServiceRegistry();
    services.addDicomService(
        new BasicCStoreSCP(UID.SecondaryCaptureImageStorage) {
          @Override
          protected void store(
              Association as,
              PresentationContext pc,
              Attributes rq,
              org.dcm4che3.net.PDVInputStream data,
              Attributes rsp)
              throws IOException {
            receivedSops.add(rq.getString(Tag.AffectedSOPInstanceUID));
            if (slowStore) {
              try {
                Thread.sleep(150);
              } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
              }
            }

            ByteArrayOutputStream payload = new ByteArrayOutputStream();
            data.copyTo(payload);

            try (DicomInputStream dis =
                new DicomInputStream(
                    new ByteArrayInputStream(payload.toByteArray()), pc.getTransferSyntax())) {
              Attributes attrs = dis.readDataset();
              assertEquals(
                  rq.getString(Tag.AffectedSOPInstanceUID), attrs.getString(Tag.SOPInstanceUID));
              assertEquals(rq.getString(Tag.AffectedSOPClassUID), attrs.getString(Tag.SOPClassUID));
            }
            rsp.setInt(Tag.Status, VR.US, Status.Success);
          }
        });
    destinationAe.setDimseRQHandler(services);

    destinationDevice.bindConnections();
  }

  private Association openMoveScu(int sourcePort)
      throws IOException,
          InterruptedException,
          GeneralSecurityException,
          IncompatibleConnectionException {
    scuDevice = new Device("cmove-scu-device");
    scuDevice.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
    scuDevice.setScheduledExecutor(
        java.util.concurrent.Executors.newSingleThreadScheduledExecutor());

    ApplicationEntity scu = new ApplicationEntity("TESTSCU");
    scu.setAssociationInitiator(true);
    scu.setAssociationAcceptor(false);
    scu.addTransferCapability(
        new TransferCapability(
            "cmove-scu",
            "1.2.840.10008.5.1.4.1.2.2.2",
            TransferCapability.Role.SCU,
            UID.ImplicitVRLittleEndian,
            UID.ExplicitVRLittleEndian));

    Connection local = new Connection();
    local.setHostname("127.0.0.1");

    scuDevice.addConnection(local);
    scuDevice.addApplicationEntity(scu);
    scu.addConnection(local);

    Connection remote = new Connection();
    remote.setHostname("127.0.0.1");
    remote.setPort(sourcePort);

    AAssociateRQ rq = new AAssociateRQ();
    rq.setCallingAET("TESTSCU");
    rq.setCalledAET("DICOOGLE");
    rq.addPresentationContext(
        new PresentationContext(
            1,
            "1.2.840.10008.5.1.4.1.2.2.2",
            UID.ImplicitVRLittleEndian,
            UID.ExplicitVRLittleEndian));

    return scu.connect(local, remote, rq);
  }

  private static int randomPort() throws IOException {
    try (ServerSocket socket = new ServerSocket(0)) {
      return socket.getLocalPort();
    }
  }

  private void storeDicom(byte[] payload) throws IOException {
    var stored = storage.store(new ByteArrayInputStream(payload), "application/dicom");
    Attributes attrs;
    try (DicomInputStream dis = new DicomInputStream(new ByteArrayInputStream(payload))) {
      attrs = dis.readDataset();
    }
    queryPlugin.onIngestSuccess(
        new org.dicoogle.sdk.storage.StorageIngestSuccessEvent(
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

  private static byte[] createDicom(String studyUid, String seriesUid, String sopUid)
      throws IOException {
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
    attrs.setString(Tag.PatientID, VR.LO, "PATIENT-" + UUID.randomUUID());

    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (DicomOutputStream dos = new DicomOutputStream(output, UID.ExplicitVRLittleEndian)) {
      dos.writeDataset(fmi, attrs);
    }

    try (DicomInputStream dis =
        new DicomInputStream(new ByteArrayInputStream(output.toByteArray()))) {
      dis.readDataset();
    }
    return output.toByteArray();
  }
}
