package org.dicoogle.protocol.dimse;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.dimse.cfind")
public class DimseCFindProperties {

  private List<String> supportedQueryLevels = List.of("PATIENT", "STUDY", "SERIES", "IMAGE");
  private int maxResults = 1000;

  public List<String> getSupportedQueryLevels() {
    return supportedQueryLevels;
  }

  public void setSupportedQueryLevels(List<String> supportedQueryLevels) {
    this.supportedQueryLevels =
        supportedQueryLevels == null || supportedQueryLevels.isEmpty()
            ? List.of("PATIENT", "STUDY", "SERIES", "IMAGE")
            : supportedQueryLevels;
  }

  public int getMaxResults() {
    return maxResults;
  }

  public void setMaxResults(int maxResults) {
    this.maxResults = Math.max(1, maxResults);
  }
}
