package org.dicoogle.protocol.dimse;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.dimse.cmove")
public class DimseCMoveProperties {

  private boolean enabled = true;
  private int maxResults = 1000;
  private Map<String, Destination> destinations = new LinkedHashMap<>();

  public boolean isEnabled() {
    return enabled;
  }

  public void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  public int getMaxResults() {
    return maxResults;
  }

  public void setMaxResults(int maxResults) {
    this.maxResults = maxResults;
  }

  public Map<String, Destination> getDestinations() {
    return destinations;
  }

  public void setDestinations(Map<String, Destination> destinations) {
    this.destinations =
        destinations == null ? new LinkedHashMap<>() : new LinkedHashMap<>(destinations);
  }

  public static class Destination {

    private String host;
    private int port;
    private String aeTitle;

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

    public String getAeTitle() {
      return aeTitle;
    }

    public void setAeTitle(String aeTitle) {
      this.aeTitle = aeTitle;
    }
  }
}
