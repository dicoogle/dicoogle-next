package org.dicoogle.protocol.dimse;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.net.Association;
import org.dcm4che3.net.pdu.PresentationContext;
import org.dcm4che3.net.service.BasicQueryTask;
import org.dcm4che3.net.service.DicomServiceException;

class DimseListQueryTask extends BasicQueryTask {
  @FunctionalInterface
  interface MatchProvider {
    List<Attributes> load(BooleanSupplier cancelRequested) throws DicomServiceException;
  }

  private final MatchProvider matchProvider;
  private Iterator<Attributes> iterator;
  private boolean initialized;

  DimseListQueryTask(
      Association as,
      PresentationContext pc,
      Attributes rq,
      Attributes keys,
      MatchProvider matchProvider) {
    super(as, pc, rq, keys);
    this.matchProvider = matchProvider;
  }

  @Override
  protected boolean hasMoreMatches() throws DicomServiceException {
    ensureInitialized();
    return iterator.hasNext();
  }

  @Override
  protected Attributes nextMatch() {
    return iterator.next();
  }

  private void ensureInitialized() throws DicomServiceException {
    if (initialized) {
      return;
    }
    initialized = true;
    if (canceled) {
      iterator = List.<Attributes>of().iterator();
      return;
    }
    List<Attributes> matches = matchProvider.load(() -> canceled);
    iterator = new ArrayList<>(matches).iterator();
  }
}
