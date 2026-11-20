package org.dicoogle.protocol.dimse.store;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * DIMSE TLS Storage server properties. This is a subset of {@link DimseCStoreProperties}
 * specifically for DICOM TLS.
 */
@ConfigurationProperties(prefix = "app.dimse.cstore.tls")
public class DimseTlsCStoreProperties {
  private boolean enabled = false;

  /** The AE title (optional, defaults to app.dimse.cstore.aeTitle) */
  private String aeTitle = null;

  /** The bind address (optional, defaults to app.dimse.cstore.bindAddress) */
  private String bindAddress = null;

  /** The TCP port */
  private int port = 41112;

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
}
