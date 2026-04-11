package org.dicoogle.protocol.dimse;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.net.Association;
import org.dcm4che3.net.pdu.PresentationContext;
import org.dcm4che3.net.service.BasicQueryTask;

class DimseListQueryTask extends BasicQueryTask {
  private final Iterator<Attributes> iterator;

  DimseListQueryTask(
      Association as,
      PresentationContext pc,
      Attributes rq,
      Attributes keys,
      List<Attributes> matches) {
    super(as, pc, rq, keys);
    this.iterator = new ArrayList<>(matches).iterator();
  }

  @Override
  protected boolean hasMoreMatches() {
    return iterator.hasNext();
  }

  @Override
  protected Attributes nextMatch() {
    return iterator.next();
  }
}
