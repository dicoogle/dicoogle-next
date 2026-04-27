package org.dicoogle.protocol.dimse;

import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.net.ApplicationEntity;
import org.dcm4che3.net.Association;
import org.dcm4che3.net.Connection;
import org.dcm4che3.net.Status;
import org.dcm4che3.net.pdu.AAssociateRQ;
import org.dcm4che3.net.pdu.PresentationContext;
import org.dcm4che3.net.service.BasicCMoveSCP;
import org.dcm4che3.net.service.DicomServiceException;
import org.dcm4che3.net.service.RetrieveTask;
import org.dicoogle.core.storage.StorageRouter;
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
    DimseCMoveProperties.Destination destination = cMoveService.destination(destinationAet);
    Association storeAssociation = openStoreAssociation(as, destination, destinationAet);
    return new DimseMoveRetrieveTask(
        as,
        pc,
        rq,
        storeAssociation,
        storageRouter,
        cancelRequested ->
            cMoveService.resolve(
                rq.getString(Tag.AffectedSOPClassUID),
                keys,
                destinationAet,
                as.getCallingAET(),
                as.getCalledAET(),
                as.getSerialNo(),
                cancelRequested),
        canceled);
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
}
