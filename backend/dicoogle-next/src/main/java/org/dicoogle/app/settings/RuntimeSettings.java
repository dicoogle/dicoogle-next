package org.dicoogle.app.settings;

import java.util.LinkedHashMap;
import java.util.Map;
import org.dicoogle.protocol.dimse.DimseCMoveProperties;
import org.dicoogle.protocol.dimse.DimseCStoreProperties;

public class RuntimeSettings {

  private DimseSettings dimse = new DimseSettings();

  public DimseSettings getDimse() {
    return dimse;
  }

  public void setDimse(DimseSettings dimse) {
    this.dimse = dimse == null ? new DimseSettings() : dimse;
  }

  public static RuntimeSettings fromProperties(
      DimseCStoreProperties cstoreProperties, DimseCMoveProperties moveProperties) {
    RuntimeSettings settings = new RuntimeSettings();
    DimseSettings dimse = settings.getDimse();

    DimseCStoreSettings cstore = new DimseCStoreSettings();
    cstore.setEnabled(cstoreProperties.isEnabled());
    cstore.setAeTitle(cstoreProperties.getAeTitle());
    cstore.setBindAddress(cstoreProperties.getBindAddress());
    cstore.setPort(cstoreProperties.getPort());
    cstore.setStorageScheme(cstoreProperties.getStorageScheme());
    dimse.setCstore(cstore);

    Map<String, MoveDestinationSetting> destinations = new LinkedHashMap<>();
    for (Map.Entry<String, DimseCMoveProperties.Destination> entry :
        moveProperties.getDestinations().entrySet()) {
      MoveDestinationSetting setting = new MoveDestinationSetting();
      setting.setAeTitle(entry.getKey());
      setting.setHost(entry.getValue().getHost());
      setting.setPort(entry.getValue().getPort());
      destinations.put(entry.getKey(), setting);
    }
    dimse.setMoveDestinations(destinations);
    return settings;
  }

  public static class DimseSettings {

    private DimseCStoreSettings cstore = new DimseCStoreSettings();
    private DicomQueryRetrieveSettings queryRetrieve = new DicomQueryRetrieveSettings();
    private Map<String, MoveDestinationSetting> moveDestinations = new LinkedHashMap<>();

    public DimseCStoreSettings getCstore() {
      return cstore;
    }

    public void setCstore(DimseCStoreSettings cstore) {
      this.cstore = cstore == null ? new DimseCStoreSettings() : cstore;
    }

    public DicomQueryRetrieveSettings getQueryRetrieve() {
      return queryRetrieve;
    }

    public void setQueryRetrieve(DicomQueryRetrieveSettings queryRetrieve) {
      this.queryRetrieve = queryRetrieve == null ? new DicomQueryRetrieveSettings() : queryRetrieve;
    }

    public Map<String, MoveDestinationSetting> getMoveDestinations() {
      return moveDestinations;
    }

    public void setMoveDestinations(Map<String, MoveDestinationSetting> moveDestinations) {
      this.moveDestinations =
          moveDestinations == null ? new LinkedHashMap<>() : new LinkedHashMap<>(moveDestinations);
    }
  }

  public static class DimseCStoreSettings {

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

  public static class MoveDestinationSetting {

    private String aeTitle;
    private String host;
    private int port;
    private boolean isPublic;
    private String description;

    public String getAeTitle() {
      return aeTitle;
    }

    public void setAeTitle(String aeTitle) {
      this.aeTitle = aeTitle;
    }

    public String getHost() {
      return host;
    }

    public void setHost(String host) {
      this.host = host;
    }

    public int getPort() {
      return port;
    }

    public void setPort(int port) {
      this.port = port;
    }

    public boolean isPublic() {
      return isPublic;
    }

    public void setPublic(boolean isPublic) {
      this.isPublic = isPublic;
    }

    public String getDescription() {
      return description;
    }

    public void setDescription(String description) {
      this.description = description;
    }
  }

  public static class DicomQueryRetrieveSettings {

    private int responseTimeout = 30;
    private int connectionTimeout = 10;
    private int idleTimeout = 60;
    private int acceptTimeout = 1;
    private int maxPduSend = 16378;
    private int maxPduReceive = 16378;
    private int maxAssociations = 10;

    public int getResponseTimeout() {
      return responseTimeout;
    }

    public void setResponseTimeout(int responseTimeout) {
      this.responseTimeout = responseTimeout;
    }

    public int getConnectionTimeout() {
      return connectionTimeout;
    }

    public void setConnectionTimeout(int connectionTimeout) {
      this.connectionTimeout = connectionTimeout;
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

    public int getMaxPduSend() {
      return maxPduSend;
    }

    public void setMaxPduSend(int maxPduSend) {
      this.maxPduSend = maxPduSend;
    }

    public int getMaxPduReceive() {
      return maxPduReceive;
    }

    public void setMaxPduReceive(int maxPduReceive) {
      this.maxPduReceive = maxPduReceive;
    }

    public int getMaxAssociations() {
      return maxAssociations;
    }

    public void setMaxAssociations(int maxAssociations) {
      this.maxAssociations = maxAssociations;
    }
  }
}
