package org.dicoogle.protocol.dimse;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.dimse.query-retrieve")
public class DimseQueryRetrieveProperties {

  private boolean enabled;
  private String aeTitle = "DICOOGLE";
  private String bindAddress = "0.0.0.0";
  private int port = 1045;
  private int dimseRspTimeout = 18000000;
  private int idleTimeout = 18000000;
  private int acceptTimeout = 5000;
  private int connectTimeout = 5000;
  private int maxPduLengthReceive = 16378;
  private int maxPduLengthSend = 16378;
  private int maxClientAssoc = 50;

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

  public int getDimseRspTimeout() {
    return dimseRspTimeout;
  }

  public void setDimseRspTimeout(int dimseRspTimeout) {
    this.dimseRspTimeout = dimseRspTimeout;
  }

  public int getIdleTimeout() {
    return idleTimeout;
  }

  public void setIdleTimeout(int idleTimeout) {
    this.idleTimeout = idleTimeout;
  }

  public int getAcceptTimeout() {
    return acceptTimeout;
  }

  public void setAcceptTimeout(int acceptTimeout) {
    this.acceptTimeout = acceptTimeout;
  }

  public int getConnectTimeout() {
    return connectTimeout;
  }

  public void setConnectTimeout(int connectTimeout) {
    this.connectTimeout = connectTimeout;
  }

  public int getMaxPduLengthReceive() {
    return maxPduLengthReceive;
  }

  public void setMaxPduLengthReceive(int maxPduLengthReceive) {
    this.maxPduLengthReceive = maxPduLengthReceive;
  }

  public int getMaxPduLengthSend() {
    return maxPduLengthSend;
  }

  public void setMaxPduLengthSend(int maxPduLengthSend) {
    this.maxPduLengthSend = maxPduLengthSend;
  }

  public int getMaxClientAssoc() {
    return maxClientAssoc;
  }

  public void setMaxClientAssoc(int maxClientAssoc) {
    this.maxClientAssoc = maxClientAssoc;
  }
}
