package org.dicoogle.sdk.query;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.function.BooleanSupplier;
import org.dcm4che3.data.Attributes;

public interface QueryService extends QueryIndexPlugin {

  enum InformationModel {
    STUDY_ROOT
  }

  record QueryRequest(
      InformationModel informationModel,
      QueryRetrieveLevel level,
      String callingAet,
      String calledAet,
      int associationSerialNo,
      Attributes keys,
      String freeText,
      Map<String, String> keywordFilters,
      boolean fuzzyMatchingEnabled,
      boolean dateTimeMatchingEnabled,
      BooleanSupplier cancelRequested) {}

  List<Attributes> query(QueryRequest request) throws IOException;
}
