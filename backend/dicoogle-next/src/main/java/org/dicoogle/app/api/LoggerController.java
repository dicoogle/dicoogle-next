package org.dicoogle.app.api;

import ch.qos.logback.classic.Logger;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LoggerController {

  @GetMapping("/logger")
  @Operation(
      summary = "Get logger configuration",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, Object>> getLogger() {
    Logger root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("configuredLevel", root.getLevel() != null ? root.getLevel().toString() : "INFO");
    result.put("effectiveLevel", root.getEffectiveLevel().toString());
    return ResponseEntity.ok(result);
  }
}
