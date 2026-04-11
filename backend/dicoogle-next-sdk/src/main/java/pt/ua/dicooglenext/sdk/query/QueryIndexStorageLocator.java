package org.dicoogle.sdk.query;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Optional;

public interface QueryIndexStorageLocator extends QueryIndexPlugin {

  Optional<URI> locateInstance(String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid)
      throws IOException;

  List<URI> listStudyInstances(String studyInstanceUid) throws IOException;

  List<URI> listSeriesInstances(String studyInstanceUid, String seriesInstanceUid)
      throws IOException;
}
