package org.dicoogle.sdk.query;

public interface QueryIndexSettings {

  String getIndexPath();

  void setIndexPath(String path);

  boolean isWatchEnabled();

  void setWatchEnabled(boolean watch);
}
