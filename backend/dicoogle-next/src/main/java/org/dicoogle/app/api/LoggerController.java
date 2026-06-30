package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LoggerController {

  private static final Logger log = LoggerFactory.getLogger(LoggerController.class);

  @Value("${logging.file.path:#{null}}")
  private String logFilePath;

  @Value("${logging.file.name:#{null}}")
  private String logFileName;

  @GetMapping(value = "/logger", produces = MediaType.TEXT_PLAIN_VALUE)
  @Operation(
      summary = "Get server log output",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<String> getLog() {
    Path path = resolveLogPath();
    if (path == null || !Files.exists(path)) {
      return ResponseEntity.ok(
          "No log file found. Check logging.file.path or logging.file.name configuration.");
    }
    try {
      long size = Files.size(path);
      long maxSize = 512 * 1024;
      long start = Math.max(0, size - maxSize);
      byte[] bytes;
      if (start > 0) {
        try (var channel = Files.newByteChannel(path, java.nio.file.StandardOpenOption.READ)) {
          channel.position(start);
          bytes = new byte[(int) (size - start)];
          var buf = java.nio.ByteBuffer.wrap(bytes);
          while (buf.hasRemaining()) {
            if (channel.read(buf) == -1) break;
          }
        }
      } else {
        bytes = Files.readAllBytes(path);
      }
      return ResponseEntity.ok(new String(bytes, StandardCharsets.UTF_8));
    } catch (IOException e) {
      log.warn("Failed to read log file: {}", path, e);
      return ResponseEntity.ok("Failed to read log file: " + e.getMessage());
    }
  }

  @GetMapping(
      value = "/logger",
      params = "action=getadvancedsettings",
      produces = MediaType.APPLICATION_JSON_VALUE)
  @Operation(
      summary = "Get logger configuration (legacy compatible)",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, Object>> getLoggerConfig() {
    ch.qos.logback.classic.Logger root =
        (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
    Map<String, Object> result = new java.util.LinkedHashMap<>();
    result.put("configuredLevel", root.getLevel() != null ? root.getLevel().toString() : "INFO");
    result.put("effectiveLevel", root.getEffectiveLevel().toString());
    return ResponseEntity.ok(result);
  }

  private Path resolveLogPath() {
    if (logFilePath != null && !logFilePath.isBlank()) {
      Path dir = Paths.get(logFilePath);
      if (Files.isDirectory(dir)) {
        String name = logFileName != null ? logFileName : "dicoogle-next.log";
        return dir.resolve(name);
      }
      return dir;
    }
    if (logFileName != null && !logFileName.isBlank()) {
      return Paths.get(logFileName);
    }
    return null;
  }
}
