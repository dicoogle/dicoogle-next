package org.dicoogle.sdk.query;

import java.io.IOException;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.dcm4che3.data.Attributes;

public interface DimseFindServicePlugin extends QueryIndexPlugin {

  enum InformationModel {
    STUDY_ROOT
  }

  enum QueryRetrieveLevel {
    STUDY,
    SERIES,
    IMAGE
  }

  record FindRequest(
      InformationModel informationModel,
      QueryRetrieveLevel level,
      String callingAet,
      String calledAet,
      int associationSerialNo,
      Attributes keys,
      String freeText,
      java.util.Map<String, String> keywordFilters,
      boolean fuzzyMatchingEnabled,
      boolean dateTimeMatchingEnabled,
      boolean relationalMatchingEnabled,
      BooleanSupplier cancelRequested) {}

  List<Attributes> find(FindRequest request) throws IOException;
}
