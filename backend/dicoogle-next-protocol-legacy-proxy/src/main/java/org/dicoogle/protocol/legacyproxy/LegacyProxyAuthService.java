package org.dicoogle.protocol.legacyproxy;

import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.dicoogle.protocol.legacyproxy.config.LegacyProxyProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

/**
 * Manages authentication with legacy Dicoogle.
 *
 * <p>Authenticates lazily on first use via POST /login, stores the token in memory, and
 * re-authenticates automatically if a 401 is encountered during proxying.
 */
@Service
@ConditionalOnProperty(
    prefix = "dicoogle.legacy-proxy",
    name = "enabled",
    havingValue = "true",
    matchIfMissing = true)
public class LegacyProxyAuthService {

  private static final Logger log = LoggerFactory.getLogger(LegacyProxyAuthService.class);

  private static final String LOGIN_PATH = "/login";
  private static final String TOKEN_FIELD = "token";

  private final WebClient webClient;
  private final LegacyProxyProperties properties;
  private final AtomicReference<String> cachedToken = new AtomicReference<>();

  public LegacyProxyAuthService(
      WebClient legacyDicoogleWebClient, LegacyProxyProperties properties) {
    this.webClient = legacyDicoogleWebClient;
    this.properties = properties;
  }

  /**
   * Returns a valid token, authenticating first if none is cached.
   *
   * @throws IllegalStateException if authentication fails
   */
  public String getToken() {
    String token = cachedToken.get();
    if (token == null) {
      token = authenticate();
      cachedToken.set(token);
    }
    return token;
  }

  /**
   * Forces re-authentication, replacing any cached token. Called by LegacyProxyService when a 401
   * is received from legacy Dicoogle.
   */
  public String refreshToken() {
    log.info("Refreshing legacy Dicoogle authentication token");
    String token = authenticate();
    cachedToken.set(token);
    return token;
  }

  /** Clears the cached token (e.g. on shutdown or forced reset). */
  public void invalidateToken() {
    cachedToken.set(null);
  }

  private String authenticate() {
    LegacyProxyProperties.Auth auth = properties.getAuth();

    if (auth.getUsername() == null || auth.getPassword() == null) {
      throw new IllegalStateException(
          "Legacy Dicoogle credentials not configured. "
              + "Set dicoogle.legacy-proxy.auth.username and dicoogle.legacy-proxy.auth.password");
    }

    log.info("Authenticating with legacy Dicoogle as user '{}'", auth.getUsername());

    MultiValueMap<String, String> formData = new LinkedMultiValueMap<>();
    formData.add("username", auth.getUsername());
    formData.add("password", auth.getPassword());

    try {
      Map<?, ?> response =
          webClient
              .post()
              .uri(LOGIN_PATH)
              .contentType(MediaType.APPLICATION_FORM_URLENCODED)
              .body(BodyInserters.fromFormData(formData))
              .retrieve()
              .bodyToMono(Map.class)
              .block(properties.getTimeout());

      if (response == null || !response.containsKey(TOKEN_FIELD)) {
        throw new IllegalStateException(
            "Legacy Dicoogle login response did not contain a '" + TOKEN_FIELD + "' field");
      }

      String token = (String) response.get(TOKEN_FIELD);
      log.info("Successfully authenticated with legacy Dicoogle");
      return token;

    } catch (WebClientResponseException e) {
      throw new IllegalStateException(
          "Failed to authenticate with legacy Dicoogle: HTTP " + e.getStatusCode(), e);
    }
  }
}
