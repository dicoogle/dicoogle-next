package org.dicoogle.protocol.dimse;

import java.util.Set;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.net.Association;
import org.dcm4che3.net.QueryOption;
import org.dcm4che3.net.pdu.PresentationContext;
import org.dcm4che3.net.service.BasicCFindSCP;
import org.dcm4che3.net.service.DicomServiceException;
import org.dcm4che3.net.service.QueryTask;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

class DimseCFindSCP extends BasicCFindSCP {

  private static final Logger LOGGER = LoggerFactory.getLogger(DimseCFindSCP.class);

  private final CFindService cFindService;

  DimseCFindSCP(CFindService cFindService) {
    super("1.2.840.10008.5.1.4.1.2.2.1");
    this.cFindService = cFindService;
  }

  @Override
  protected QueryTask calculateMatches(
      Association as, PresentationContext pc, Attributes rq, Attributes keys)
      throws DicomServiceException {
    LOGGER.info(
        "C-FIND request association={} callingAET={} calledAET={}",
        as.getSerialNo(),
        as.getCallingAET(),
        as.getCalledAET());

    Set<QueryOption> queryOptions =
        as.getRequestedQueryOptionsFor(rq.getString(org.dcm4che3.data.Tag.AffectedSOPClassUID));
    return new DimseListQueryTask(
        as,
        pc,
        rq,
        keys,
        cancelRequested ->
            cFindService.find(
                rq.getString(org.dcm4che3.data.Tag.AffectedSOPClassUID),
                keys,
                as.getCallingAET(),
                as.getCalledAET(),
                as.getSerialNo(),
                queryOptions,
                cancelRequested));
  }
}
