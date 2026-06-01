package org.dicoogle.app.config;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.security")
public class SecurityProperties {

  private boolean docsEnabled;
  private List<String> allowedOrigins = new ArrayList<>();

  public boolean isDocsEnabled() {
    return docsEnabled;
  }

  public void setDocsEnabled(boolean docsEnabled) {
    this.docsEnabled = docsEnabled;
  }

  public List<String> getAllowedOrigins() {
    return allowedOrigins;
  }

  public void setAllowedOrigins(List<String> allowedOrigins) {
    this.allowedOrigins = allowedOrigins;
  }
}
