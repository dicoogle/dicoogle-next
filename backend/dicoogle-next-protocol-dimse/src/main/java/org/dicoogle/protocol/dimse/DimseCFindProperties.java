package org.dicoogle.protocol.dimse;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.dimse.cfind")
public class DimseCFindProperties {

  private boolean enabled = true;
  private List<String> supportedQueryLevels = List.of("STUDY", "SERIES", "IMAGE");

  public boolean isEnabled() {
    return enabled;
  }

  public void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  public List<String> getSupportedQueryLevels() {
    return supportedQueryLevels;
  }

  public void setSupportedQueryLevels(List<String> supportedQueryLevels) {
    this.supportedQueryLevels =
        supportedQueryLevels == null || supportedQueryLevels.isEmpty()
            ? List.of("STUDY", "SERIES", "IMAGE")
            : supportedQueryLevels;
  }
}
