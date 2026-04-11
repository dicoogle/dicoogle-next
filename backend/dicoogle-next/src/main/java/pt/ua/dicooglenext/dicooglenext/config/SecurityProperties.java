package org.dicoogle.app.config;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.security")
public class SecurityProperties {

  private boolean docsEnabled;
  private List<String> allowedOrigins = new ArrayList<>();
  private final BasicAuth basicAuth = new BasicAuth();

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

  public BasicAuth getBasicAuth() {
    return basicAuth;
  }

  public static class BasicAuth {

    private String username;
    private String password;

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
