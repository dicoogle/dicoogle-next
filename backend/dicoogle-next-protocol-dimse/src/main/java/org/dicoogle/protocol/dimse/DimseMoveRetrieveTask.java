package org.dicoogle.protocol.dimse;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.net.Association;
import org.dcm4che3.net.DataWriter;
import org.dcm4che3.net.InputStreamDataWriter;
import org.dcm4che3.net.pdu.PresentationContext;
import org.dcm4che3.net.service.BasicRetrieveTask;
import org.dcm4che3.net.service.DicomServiceException;
import org.dcm4che3.net.service.InstanceLocator;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.query.DimseMoveServicePlugin;

class DimseMoveRetrieveTask extends BasicRetrieveTask<DimseMoveRetrieveTask.StorageMoveLocator> {

  @FunctionalInterface
  interface CandidateProvider {
    List<DimseMoveServicePlugin.MoveCandidate> load(BooleanSupplier cancelRequested)
        throws DicomServiceException;
  }

  private final CandidateProvider candidateProvider;
  private final StorageRouter storageRouter;
  private final boolean[] canceledRef;
  private boolean initialized;

  DimseMoveRetrieveTask(
      Association requestAssociation,
      PresentationContext presentationContext,
      Attributes requestCommand,
      Association storeAssociation,
      StorageRouter storageRouter,
      CandidateProvider candidateProvider,
      boolean[] canceledRef) {
    super(
        org.dcm4che3.net.Dimse.C_MOVE_RQ,
        requestAssociation,
        presentationContext,
        requestCommand,
        new java.util.ArrayList<>(),
        storeAssociation);
    this.storageRouter = storageRouter;
    this.candidateProvider = candidateProvider;
    this.canceledRef = canceledRef;
    setSendPendingRSP(true);
    setSendPendingRSPInterval(1);
  }

  @Override
  public void onCancelRQ(Association as) {
    super.onCancelRQ(as);
    canceledRef[0] = true;
  }

  @Override
  public void run() {
    initializeCandidates();
    super.run();
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

  private void initializeCandidates() {
    if (initialized) {
      return;
    }
    initialized = true;
    if (canceledRef[0]) {
      return;
    }
    List<DimseMoveServicePlugin.MoveCandidate> candidates;
    try {
      candidates = candidateProvider.load(() -> canceledRef[0]);
    } catch (DicomServiceException ex) {
      status = ex.getStatus();
      return;
    }
    for (DimseMoveServicePlugin.MoveCandidate candidate : candidates) {
      insts.add(
          new StorageMoveLocator(
              candidate.sopClassUid(), candidate.sopInstanceUid(), candidate.location()));
    }
  }

  static final class StorageMoveLocator extends InstanceLocator {

    private final java.net.URI location;

    StorageMoveLocator(String cuid, String iuid, java.net.URI location) {
      super(cuid, iuid, "*", location.toString());
      this.location = location;
    }
  }
}
