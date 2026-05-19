package org.dicoogle.protocol.legacyproxy;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.OutputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Catch-all fallback that proxies unhandled requests to legacy Dicoogle.
 *
 * <p>Spring MVC throws {@link NoResourceFoundException} (HTTP 404) when no handler is mapped for a
 * request. This resolver intercepts those exceptions and forwards the request transparently to the
 * configured legacy Dicoogle instance, effectively making dicoogle-next a superset of legacy
 * Dicoogle for any paths not yet implemented.
 *
 * <p>Ordering is set to {@link Ordered#LOWEST_PRECEDENCE} so that all other exception resolvers
 * (e.g. {@code ResponseEntityExceptionHandler}, {@code DefaultHandlerExceptionResolver}) run first
 * and this resolver only activates as a last resort.
 */
@Component
@ConditionalOnProperty(prefix = "app.legacy-proxy", name = "enabled", havingValue = "true")
public class LegacyProxyExceptionResolver implements HandlerExceptionResolver, Ordered {

  private static final Logger log = LoggerFactory.getLogger(LegacyProxyExceptionResolver.class);

  private final LegacyProxyService proxyService;

  public LegacyProxyExceptionResolver(LegacyProxyService proxyService) {
    this.proxyService = proxyService;
  }

  @Override
  public int getOrder() {
    return Ordered.LOWEST_PRECEDENCE;
  }

  /**
   * Intercepts {@link NoResourceFoundException} and proxies the request to legacy Dicoogle.
   * All other exception types are ignored so that normal Spring MVC error handling takes over.
   *
   * @return an empty (already-committed) {@link ModelAndView} when the request was proxied,
   *     or {@code null} to let other resolvers handle the exception.
   */
  @Override
  public ModelAndView resolveException(
      HttpServletRequest request,
      HttpServletResponse response,
      Object handler,
      Exception ex) {

    if (!(ex instanceof NoResourceFoundException)) {
      return null;
    }

    log.debug(
        "No handler found for {} {} — forwarding to legacy Dicoogle",
        request.getMethod(),
        request.getRequestURI());

    try {
      ResponseEntity<byte[]> proxied = proxyService.forward(request);
      writeResponse(proxied, response);
    } catch (LegacyProxyAuthException authEx) {
      log.error("Could not authenticate with legacy Dicoogle: {}", authEx.getMessage());
      sendError(response, HttpStatus.BAD_GATEWAY, "Legacy proxy authentication failed");
    } catch (IOException ioEx) {
      log.error("IO error while proxying to legacy Dicoogle", ioEx);
      sendError(response, HttpStatus.BAD_GATEWAY, "Legacy proxy IO error");
    }

    // Return empty ModelAndView to signal that the exception has been handled
    // and the response has already been written.
    return new ModelAndView();
  }

  private void writeResponse(ResponseEntity<byte[]> entity, HttpServletResponse response)
      throws IOException {
    response.setStatus(entity.getStatusCode().value());
    entity
        .getHeaders()
        .forEach(
            (name, values) -> values.forEach(value -> response.addHeader(name, value)));

    byte[] body = entity.getBody();
    if (body != null && body.length > 0) {
      try (OutputStream out = response.getOutputStream()) {
        out.write(body);
      }
    }
  }

  private void sendError(HttpServletResponse response, HttpStatus status, String message) {
    try {
      response.sendError(status.value(), message);
    } catch (IOException e) {
      log.error("Failed to send error response", e);
    }
  }
}
