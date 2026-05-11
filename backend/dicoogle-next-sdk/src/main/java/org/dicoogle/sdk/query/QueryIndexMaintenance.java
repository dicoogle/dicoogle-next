package org.dicoogle.sdk.query;

import java.io.IOException;
import java.net.URI;

public interface QueryIndexMaintenance extends QueryIndexPlugin {

  String indexId();

  int indexedDocuments() throws IOException;

  int reindex() throws IOException;

  int indexPath(URI uri) throws IOException;

  int unindexPath(URI uri) throws IOException;
}
