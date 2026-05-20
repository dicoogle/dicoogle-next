package org.dicoogle.protocol.dimse;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.io.DicomInputStream;
import org.dcm4che3.io.DicomOutputStream;
import org.dcm4che3.net.Association;
import org.dcm4che3.net.DataWriter;
import org.dcm4che3.net.PDVOutputStream;
import org.dcm4che3.net.pdu.PresentationContext;
import org.dcm4che3.net.service.BasicRetrieveTask;
import org.dcm4che3.net.service.DicomServiceException;
import org.dcm4che3.net.service.InstanceLocator;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.query.QueryMoveService;

class DimseMoveRetrieveTask extends BasicRetrieveTask<DimseMoveRetrieveTask.StorageMoveLocator> {

  @FunctionalInterface
  interface CandidateProvider {
    List<QueryMoveService.MoveCandidate> load(BooleanSupplier cancelRequested)
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
    return new ReencodeDataWriter(
        storageRouter.requireReadable(inst.location.getScheme()).openForRead(inst.location), tsuid);
  }

  private static final class ReencodeDataWriter implements DataWriter {
    private final InputStream source;
    private final String negotiatedTsuid;

    ReencodeDataWriter(InputStream source, String negotiatedTsuid) {
      this.source = source;
      this.negotiatedTsuid = negotiatedTsuid;
    }

    @Override
    public void writeTo(PDVOutputStream out, String tsuid) throws IOException {
      try (InputStream in = source;
          DicomInputStream dis = new DicomInputStream(in);
          DicomOutputStream dos = new DicomOutputStream(out, negotiatedTsuid)) {
        Attributes attrs = dis.readDataset();
        String sopInstanceUid = attrs.getString(Tag.SOPInstanceUID, null);
        if (sopInstanceUid == null || sopInstanceUid.isBlank()) {
          throw new IOException("Dataset missing SOP Instance UID");
        }

        dos.writeDataset(null, attrs);
      }
    }
  }

  private void initializeCandidates() {
    if (initialized) {
      return;
    }
    initialized = true;
    if (canceledRef[0]) {
      return;
    }
    List<QueryMoveService.MoveCandidate> candidates;
    try {
      candidates = candidateProvider.load(() -> canceledRef[0]);
    } catch (DicomServiceException ex) {
      status = ex.getStatus();
      return;
    }
    for (QueryMoveService.MoveCandidate candidate : candidates) {
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
