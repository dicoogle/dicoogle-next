package org.dicoogle.protocol.legacyproxy;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.Collections;
import java.util.Map;
import java.util.Set;
import org.dicoogle.protocol.legacyproxy.config.LegacyProxyProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Forwards HTTP requests to legacy Dicoogle and returns their responses.
 *
 * <p>Handles token injection and automatic re-authentication on 401.
 */
@Service
@ConditionalOnProperty(
    prefix = "dicoogle.legacy-proxy",
    name = "enabled",
    havingValue = "true",
    matchIfMissing = true)
public class LegacyProxyService {

  private static final Logger log = LoggerFactory.getLogger(LegacyProxyService.class);

  /** Hop-by-hop headers that must not be forwarded to the upstream server per RFC 7230. */
  private static final Set<String> HOP_BY_HOP_HEADERS =
      Set.of(
          "connection",
          "keep-alive",
          "proxy-authenticate",
          "proxy-authorization",
          "te",
          "trailers",
          "transfer-encoding",
          "upgrade",
          "host");

  private final WebClient webClient;
  private final LegacyProxyAuthService authService;
  private final LegacyProxyProperties properties;

  public LegacyProxyService(
      WebClient legacyDicoogleWebClient,
      LegacyProxyAuthService authService,
      LegacyProxyProperties properties) {
    this.webClient = legacyDicoogleWebClient;
    this.authService = authService;
    this.properties = properties;
  }

  /**
   * Forwards the incoming servlet request to legacy Dicoogle.
   *
   * @param request the original incoming HTTP request
   * @return the response from legacy Dicoogle as a ResponseEntity
   */
  public ResponseEntity<byte[]> forward(HttpServletRequest request) {
    return forwardWithToken(request, authService.getToken(), false);
  }

  /**
   * Stores raw DICOM bytes on legacy Dicoogle via POST /storage.
   *
   * @param dicomBytes the raw DICOM Part 10 bytes to store
   * @return the URI assigned by legacy storage, or null on failure
   */
  public URI postStorage(byte[] dicomBytes) {
    return postStorageWithToken(dicomBytes, authService.getToken(), false);
  }

  private URI postStorageWithToken(byte[] dicomBytes, String token, boolean isRetry) {
    try {
      String path = "/storage?scheme=file";
      log.debug("Proxying POST {} to legacy Dicoogle ({} bytes)", path, dicomBytes.length);

      Map<?, ?> response =
          webClient
              .method(HttpMethod.POST)
              .uri(path)
              .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
              .contentType(MediaType.APPLICATION_OCTET_STREAM)
              .bodyValue(dicomBytes)
              .retrieve()
              .bodyToMono(Map.class)
              .block(properties.getTimeout());

      if (response != null && response.containsKey("uri")) {
        return URI.create((String) response.get("uri"));
      }
      log.warn("Legacy Dicoogle POST /storage returned no URI: {}", response);
      return null;

    } catch (WebClientResponseException e) {
      if (e.getStatusCode() == HttpStatus.UNAUTHORIZED && !isRetry) {
        log.warn("Received 401 from legacy Dicoogle — refreshing token and retrying");
        String freshToken = authService.refreshToken();
        return postStorageWithToken(dicomBytes, freshToken, true);
      }
      log.error("Legacy Dicoogle POST /storage returned error: HTTP {}", e.getStatusCode());
      return null;

    } catch (Exception e) {
      log.error("Failed to proxy POST /storage to legacy Dicoogle", e);
      return null;
    }
  }

  private ResponseEntity<byte[]> forwardWithToken(
      HttpServletRequest request, String token, boolean isRetry) {
    try {
      String uri = buildUri(request);
      HttpMethod method = HttpMethod.valueOf(request.getMethod());
      HttpHeaders headers = extractHeaders(request, token);

      log.debug("Proxying {} {} to legacy Dicoogle", method, uri);

      byte[] body = request.getInputStream().readAllBytes();

      WebClient.RequestBodySpec requestSpec =
          webClient.method(method).uri(uri).headers(h -> h.addAll(headers));

      byte[] responseBody =
          (body.length > 0 ? requestSpec.bodyValue(body) : requestSpec)
              .retrieve()
              .bodyToMono(byte[].class)
              .block(properties.getTimeout());

      return ResponseEntity.ok(responseBody);

    } catch (WebClientResponseException e) {
      if (e.getStatusCode() == HttpStatus.UNAUTHORIZED && !isRetry) {
        log.warn("Received 401 from legacy Dicoogle — refreshing token and retrying");
        String freshToken = authService.refreshToken();
        return forwardWithToken(request, freshToken, true);
      }
      log.error("Legacy Dicoogle returned error: HTTP {}", e.getStatusCode());
      return ResponseEntity.status(e.getStatusCode())
          .headers(e.getHeaders())
          .body(e.getResponseBodyAsByteArray());

    } catch (Exception e) {
      log.error("Failed to proxy request to legacy Dicoogle", e);
      return ResponseEntity.status(HttpStatus.BAD_GATEWAY).build();
    }
  }

  private String buildUri(HttpServletRequest request) {
    String rawPath = request.getRequestURI();
    String contextPath = request.getContextPath();
    String path = rawPath;
    if (contextPath != null && !contextPath.isBlank() && rawPath.startsWith(contextPath)) {
      path = rawPath.substring(contextPath.length());
      if (path.isEmpty()) {
        path = "/";
      }
    }

    UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(path);
    String queryString = request.getQueryString();
    if (queryString != null) {
      builder.query(queryString);
    }
    return builder.build().toUriString();
  }

  private HttpHeaders extractHeaders(HttpServletRequest request, String token) {
    HttpHeaders headers = new HttpHeaders();

    Collections.list(request.getHeaderNames()).stream()
        .filter(name -> !HOP_BY_HOP_HEADERS.contains(name.toLowerCase()))
        // Strip incoming Authorization — we manage it ourselves
        .filter(name -> !"authorization".equalsIgnoreCase(name))
        .forEach(name -> headers.addAll(name, Collections.list(request.getHeaders(name))));

    headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    return headers;
  }
}
