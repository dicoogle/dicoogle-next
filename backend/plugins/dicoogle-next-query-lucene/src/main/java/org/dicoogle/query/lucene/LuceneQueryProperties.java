package org.dicoogle.query.lucene;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.query.lucene")
public class LuceneQueryProperties {

  private boolean enabled = true;
  private String rootDir = "./data/index";
  private String indexName = "dicoogle-lucene";
  private String storageRootDir = "./data/storage";
  private boolean autoReindexOnStartup = true;
  private boolean watchStorage = true;
  private int searchLimit = 10000;
  private int maxBooleanClauses = 2048;

  public boolean isEnabled() {
    return enabled;
  }

  public void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  public String getRootDir() {
    return rootDir;
  }

  public void setRootDir(String rootDir) {
    this.rootDir = rootDir;
  }

  public String getIndexName() {
    return indexName;
  }

  public void setIndexName(String indexName) {
    this.indexName = indexName;
  }

  public String getStorageRootDir() {
    return storageRootDir;
  }

  public void setStorageRootDir(String storageRootDir) {
    this.storageRootDir = storageRootDir;
  }

  public boolean isAutoReindexOnStartup() {
    return autoReindexOnStartup;
  }

  public void setAutoReindexOnStartup(boolean autoReindexOnStartup) {
    this.autoReindexOnStartup = autoReindexOnStartup;
  }

  public boolean isWatchStorage() {
    return watchStorage;
  }

  public void setWatchStorage(boolean watchStorage) {
    this.watchStorage = watchStorage;
  }

  public int getSearchLimit() {
    return searchLimit;
  }

  public void setSearchLimit(int searchLimit) {
    this.searchLimit = searchLimit;
  }

  public int getMaxBooleanClauses() {
    return maxBooleanClauses;
  }

  public void setMaxBooleanClauses(int maxBooleanClauses) {
    this.maxBooleanClauses = maxBooleanClauses;
  }
}
