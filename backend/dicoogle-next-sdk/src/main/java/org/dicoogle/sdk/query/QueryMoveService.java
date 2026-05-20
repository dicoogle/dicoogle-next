package org.dicoogle.sdk.query;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.dcm4che3.data.Attributes;

public interface QueryMoveService extends QueryIndexPlugin {

  record MoveRequest(
      QueryService.InformationModel informationModel,
      QueryRetrieveLevel level,
      String callingAet,
      String calledAet,
      String moveDestinationAet,
      int associationSerialNo,
      Attributes keys,
      BooleanSupplier cancelRequested) {}

  record MoveCandidate(String sopClassUid, String sopInstanceUid, URI location) {}

  List<MoveCandidate> resolve(MoveRequest request) throws IOException;
}
