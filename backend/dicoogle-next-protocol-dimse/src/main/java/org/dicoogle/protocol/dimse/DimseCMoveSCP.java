package org.dicoogle.protocol.dimse;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.net.ApplicationEntity;
import org.dcm4che3.net.Association;
import org.dcm4che3.net.Connection;
import org.dcm4che3.net.DataWriter;
import org.dcm4che3.net.InputStreamDataWriter;
import org.dcm4che3.net.Status;
import org.dcm4che3.net.pdu.AAssociateRQ;
import org.dcm4che3.net.pdu.PresentationContext;
import org.dcm4che3.net.service.BasicCMoveSCP;
import org.dcm4che3.net.service.BasicRetrieveTask;
import org.dcm4che3.net.service.DicomServiceException;
import org.dcm4che3.net.service.InstanceLocator;
import org.dcm4che3.net.service.RetrieveTask;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.query.DimseMoveServicePlugin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

class DimseCMoveSCP extends BasicCMoveSCP {

  private static final String STUDY_ROOT_MOVE_UID = "1.2.840.10008.5.1.4.1.2.2.2";
  private static final Logger LOGGER = LoggerFactory.getLogger(DimseCMoveSCP.class);

  private final CMoveService cMoveService;
  private final StorageRouter storageRouter;
  private final DimseCStoreProperties cStoreProperties;

  DimseCMoveSCP(
      CMoveService cMoveService,
      StorageRouter storageRouter,
      DimseCStoreProperties cStoreProperties) {
    super(STUDY_ROOT_MOVE_UID);
    this.cMoveService = cMoveService;
    this.storageRouter = storageRouter;
    this.cStoreProperties = cStoreProperties;
  }

  @Override
  protected RetrieveTask calculateMatches(
      Association as, PresentationContext pc, Attributes rq, Attributes keys)
      throws DicomServiceException {
    String destinationAet = rq.getString(Tag.MoveDestination, null);
    if (destinationAet == null || destinationAet.isBlank()) {
      throw new DicomServiceException(
          Status.MoveDestinationUnknown, "Move Destination is required");
    }

    LOGGER.info(
        "C-MOVE request association={} callingAET={} calledAET={} destinationAET={}",
        as.getSerialNo(),
        as.getCallingAET(),
        as.getCalledAET(),
        destinationAet);

    final boolean[] canceled = {false};
    List<DimseMoveServicePlugin.MoveCandidate> candidates =
        cMoveService.resolve(
            rq.getString(Tag.AffectedSOPClassUID),
            keys,
            destinationAet,
            as.getCallingAET(),
            as.getCalledAET(),
            as.getSerialNo(),
            () -> canceled[0]);

    DimseCMoveProperties.Destination destination = cMoveService.destination(destinationAet);
    Association storeAssociation = openStoreAssociation(as, destination, destinationAet);
    return new StorageBackedRetrieveTask(
        as, pc, rq, candidates, storeAssociation, storageRouter, canceled);
  }

  private Association openStoreAssociation(
      Association requestAssociation,
      DimseCMoveProperties.Destination destination,
      String destinationAet)
      throws DicomServiceException {
    try {
      ApplicationEntity ae = requestAssociation.getApplicationEntity();
      Connection localConnection = requestAssociation.getConnection();
      Connection remoteConnection = new Connection();
      remoteConnection.setHostname(destination.getHost());
      remoteConnection.setPort(destination.getPort());

      AAssociateRQ moveStoreRequest = new AAssociateRQ();
      moveStoreRequest.setCallingAET(cStoreProperties.getAeTitle());
      moveStoreRequest.setCalledAET(
          destination.getAeTitle() == null || destination.getAeTitle().isBlank()
              ? destinationAet
              : destination.getAeTitle());

      int pcid = 1;
      for (DimseCStoreProperties.AcceptedTransferCapability tc :
          cStoreProperties.getAcceptedTransferCapabilities()) {
        if (tc.getSopClassUid() == null || tc.getSopClassUid().isBlank()) {
          continue;
        }
        if (tc.getTransferSyntaxUids() == null || tc.getTransferSyntaxUids().isEmpty()) {
          continue;
        }
        moveStoreRequest.addPresentationContext(
            new PresentationContext(
                pcid, tc.getSopClassUid(), tc.getTransferSyntaxUids().toArray(String[]::new)));
        pcid += 2;
      }

      return ae.connect(localConnection, remoteConnection, moveStoreRequest);
    } catch (Exception ex) {
      throw new DicomServiceException(
          Status.UnableToPerformSubOperations,
          "Failed to connect to move destination " + destinationAet + ": " + ex.getMessage());
    }
  }

  private static final class StorageBackedRetrieveTask
      extends BasicRetrieveTask<StorageMoveLocator> {

    private final StorageRouter storageRouter;

    StorageBackedRetrieveTask(
        Association requestAssociation,
        PresentationContext presentationContext,
        Attributes requestCommand,
        List<DimseMoveServicePlugin.MoveCandidate> candidates,
        Association storeAssociation,
        StorageRouter storageRouter,
        boolean[] canceledRef) {
      super(
          org.dcm4che3.net.Dimse.C_MOVE_RQ,
          requestAssociation,
          presentationContext,
          requestCommand,
          toLocators(candidates),
          storeAssociation);
      this.storageRouter = storageRouter;
      this.canceledRef = canceledRef;
      setSendPendingRSP(true);
      setSendPendingRSPInterval(1);
    }

    private final boolean[] canceledRef;

    @Override
    public void onCancelRQ(Association as) {
      super.onCancelRQ(as);
      canceledRef[0] = true;
    }

    @Override
    protected String selectTransferSyntaxFor(Association storeas, StorageMoveLocator inst)
        throws Exception {
      for (String ts : storeas.getTransferSyntaxesFor(inst.cuid)) {
        return ts;
      }
      throw new IOException("No common transfer syntax for SOP Class: " + inst.cuid);
    }

    @Override
    protected DataWriter createDataWriter(StorageMoveLocator inst, String tsuid) throws Exception {
      InputStream stream =
          storageRouter.requireReadable(inst.location.getScheme()).openForRead(inst.location);
      return new InputStreamDataWriter(stream);
    }

    private static List<StorageMoveLocator> toLocators(
        List<DimseMoveServicePlugin.MoveCandidate> candidates) {
      return candidates.stream()
          .map(c -> new StorageMoveLocator(c.sopClassUid(), c.sopInstanceUid(), c.location()))
          .toList();
    }
  }

  private static final class StorageMoveLocator extends InstanceLocator {

    private final java.net.URI location;

    StorageMoveLocator(String cuid, String iuid, java.net.URI location) {
      super(cuid, iuid, "*", location.toString());
      this.location = location;
    }
  }
}
