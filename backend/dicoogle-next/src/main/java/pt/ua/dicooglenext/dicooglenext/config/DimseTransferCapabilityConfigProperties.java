package pt.ua.dicooglenext.dicooglenext.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.dimse.cstore.config")
public class DimseTransferCapabilityConfigProperties {

  public enum Source {
    YAML,
    JDBC
  }

  private Source source = Source.YAML;
  private long syncIntervalMs = 5000;
  private Jdbc jdbc = new Jdbc();

  public Source getSource() {
    return source;
  }

  public void setSource(Source source) {
    this.source = source == null ? Source.YAML : source;
  }

  public long getSyncIntervalMs() {
    return syncIntervalMs;
  }

  public void setSyncIntervalMs(long syncIntervalMs) {
    this.syncIntervalMs = Math.max(1000, syncIntervalMs);
  }

  public Jdbc getJdbc() {
    return jdbc;
  }

  public void setJdbc(Jdbc jdbc) {
    this.jdbc = jdbc == null ? new Jdbc() : jdbc;
  }

  public static class Jdbc {
    private boolean autoCreateTable = true;
    private String tableName = "dimse_transfer_capability_config";
    private String configKey = "dimse.cstore.acceptedTransferCapabilities";
    private String nodeId = "dicoogle-next-node";
    private String url;
    private String username;
    private String password;

    public boolean isAutoCreateTable() {
      return autoCreateTable;
    }

    public void setAutoCreateTable(boolean autoCreateTable) {
      this.autoCreateTable = autoCreateTable;
    }

    public String getTableName() {
      return tableName;
    }

    public void setTableName(String tableName) {
      this.tableName = tableName;
    }

    public String getConfigKey() {
      return configKey;
    }

    public void setConfigKey(String configKey) {
      this.configKey = configKey;
    }

    public String getNodeId() {
      return nodeId;
    }

    public void setNodeId(String nodeId) {
      this.nodeId = nodeId;
    }

    public String getUrl() {
      return url;
    }

    public void setUrl(String url) {
      this.url = url;
    }

    public String getUsername() {
      return username;
    }

    public void setUsername(String username) {
      this.username = username;
    }

    public String getPassword() {
      return password;
    }

    public void setPassword(String password) {
      this.password = password;
    }
  }
}
