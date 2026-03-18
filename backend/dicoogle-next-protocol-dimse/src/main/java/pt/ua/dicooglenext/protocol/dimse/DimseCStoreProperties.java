package pt.ua.dicooglenext.protocol.dimse;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.dimse.cstore")
public class DimseCStoreProperties {

  private boolean enabled;
  private String aeTitle = "DICOOGLE";
  private String bindAddress = "0.0.0.0";
  private int port = 11112;
  private String storageScheme = "file";

  public boolean isEnabled() {
    return enabled;
  }

  public void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  public String getAeTitle() {
    return aeTitle;
  }

  public void setAeTitle(String aeTitle) {
    this.aeTitle = aeTitle;
  }

  public String getBindAddress() {
    return bindAddress;
  }

  public void setBindAddress(String bindAddress) {
    this.bindAddress = bindAddress;
  }

  public int getPort() {
    return port;
  }

  public void setPort(int port) {
    this.port = port;
  }

  public String getStorageScheme() {
    return storageScheme;
  }

  public void setStorageScheme(String storageScheme) {
    this.storageScheme = storageScheme;
  }
}
