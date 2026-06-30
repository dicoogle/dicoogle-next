package org.dicoogle.protocol.legacyproxy.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "dicoogle.legacy-proxy")
public class LegacyProxyProperties {

  public enum Mode {
    /** Auto-detect: use local plugins when present, fallback to legacy when missing. */
    AUTO,
    /** Always route to legacy for this domain group. */
    LEGACY,
    /** Always use new backend plugins for this domain group (fail if missing). */
    NEW
  }

  private boolean enabled = true;
  private Mode storageRetrieveMode = Mode.AUTO;
  private Mode queryIndexMode = Mode.AUTO;
  private String baseUrl = "http://localhost:8081";
  private Duration timeout = Duration.ofSeconds(30);
  private final Auth auth = new Auth();

  public boolean isEnabled() {
    return enabled;
  }

  public void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  public Mode getStorageRetrieveMode() {
    return storageRetrieveMode;
  }

  public void setStorageRetrieveMode(Mode storageRetrieveMode) {
    this.storageRetrieveMode = storageRetrieveMode;
  }

  public Mode getQueryIndexMode() {
    return queryIndexMode;
  }

  public void setQueryIndexMode(Mode queryIndexMode) {
    this.queryIndexMode = queryIndexMode;
  }

  /** Returns true when legacy proxy should be used for a storage/retrieve operation. */
  public boolean shouldUseLegacyForStorageRetrieve(boolean hasLocalPlugin) {
    if (!enabled) {
      return false;
    }
    return switch (storageRetrieveMode) {
      case LEGACY -> true;
      case NEW -> false;
      case AUTO -> !hasLocalPlugin;
    };
  }

  /** Returns true when legacy proxy should be used for a query/index operation. */
  public boolean shouldUseLegacyForQueryIndex(boolean hasLocalPlugin) {
    if (!enabled) {
      return false;
    }
    return switch (queryIndexMode) {
      case LEGACY -> true;
      case NEW -> false;
      case AUTO -> !hasLocalPlugin;
    };
  }

  public String getBaseUrl() {
    return baseUrl;
  }

  public void setBaseUrl(String baseUrl) {
    this.baseUrl = baseUrl;
  }

  public Duration getTimeout() {
    return timeout;
  }

  public void setTimeout(Duration timeout) {
    this.timeout = timeout;
  }

  public Auth getAuth() {
    return auth;
  }

  public static class Auth {

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
