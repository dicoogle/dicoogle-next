package org.dicoogle.protocol.legacyproxy;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Fallback exception resolver that proxies unhandled requests to legacy Dicoogle.
 *
 * <p>When Spring MVC cannot find a handler for an incoming request it throws {@link
 * NoResourceFoundException}. This resolver intercepts that exception and forwards the request
 * transparently to the configured legacy Dicoogle instance, allowing dicoogle-next to serve as a
 * drop-in replacement while features are being migrated.
 *
 * <p>Registered at {@link Ordered#LOWEST_PRECEDENCE} so all native handlers are attempted first.
 */
@Component
@ConditionalOnProperty(prefix = "dicoogle.legacy-proxy", name = "enabled", havingValue = "true")
public class LegacyProxyFallbackResolver implements HandlerExceptionResolver, Ordered {

  private static final Logger log = LoggerFactory.getLogger(LegacyProxyFallbackResolver.class);

  private final LegacyProxyService proxyService;

  public LegacyProxyFallbackResolver(LegacyProxyService proxyService) {
    this.proxyService = proxyService;
  }

  @Override
  public int getOrder() {
    return Ordered.LOWEST_PRECEDENCE;
  }

  @Override
  public ModelAndView resolveException(
      HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {

    if (!(ex instanceof NoResourceFoundException)) {
      // Only handle "no route found" — let everything else propagate normally
      return null;
    }

    log.debug(
        "No handler found for {} {} — falling back to legacy Dicoogle",
        request.getMethod(),
        request.getRequestURI());

    try {
      ResponseEntity<byte[]> proxyResponse = proxyService.forward(request);

      response.setStatus(proxyResponse.getStatusCode().value());

      proxyResponse
          .getHeaders()
          .forEach((name, values) -> values.forEach(value -> response.addHeader(name, value)));

      byte[] body = proxyResponse.getBody();
      if (body != null && body.length > 0) {
        response.getOutputStream().write(body);
        response.getOutputStream().flush();
      }

    } catch (Exception e) {
      log.error(
          "Legacy proxy fallback failed for {} {}",
          request.getMethod(),
          request.getRequestURI(),
          e);
      response.setStatus(HttpServletResponse.SC_BAD_GATEWAY);
    }

    // Return an empty ModelAndView to signal the exception has been handled
    return new ModelAndView();
  }
}
