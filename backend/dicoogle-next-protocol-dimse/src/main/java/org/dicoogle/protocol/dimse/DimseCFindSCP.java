package org.dicoogle.protocol.dimse;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.net.Association;
import org.dcm4che3.net.pdu.PresentationContext;
import org.dcm4che3.net.service.BasicCFindSCP;
import org.dcm4che3.net.service.BasicQueryTask;
import org.dcm4che3.net.service.DicomServiceException;
import org.dcm4che3.net.service.QueryTask;

class DimseCFindSCP extends BasicCFindSCP {

  private final CFindService cFindService;

  DimseCFindSCP(CFindService cFindService) {
    super("1.2.840.10008.5.1.4.1.2.2.1");
    this.cFindService = cFindService;
  }

  @Override
  protected QueryTask calculateMatches(
      Association as, PresentationContext pc, Attributes rq, Attributes keys)
      throws DicomServiceException {
    List<Attributes> matches =
        cFindService.find(
            rq.getString(org.dcm4che3.data.Tag.AffectedSOPClassUID),
            keys,
            as.getCallingAET(),
            as.getCalledAET(),
            as.getSerialNo());
    return new ListQueryTask(as, pc, rq, keys, matches);
  }

  private static final class ListQueryTask extends BasicQueryTask {
    private final Iterator<Attributes> iterator;

    private ListQueryTask(
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
}
