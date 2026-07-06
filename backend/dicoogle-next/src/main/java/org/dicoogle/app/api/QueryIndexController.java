package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.net.URI;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.dicoogle.app.dto.QueryIndexDtos.QueryIndexPathRequest;
import org.dicoogle.app.dto.QueryIndexDtos.QueryIndexStatusItem;
import org.dicoogle.app.service.IndexTaskService;
import org.dicoogle.app.service.QueryIndexMaintenanceService;
import org.dicoogle.protocol.legacyproxy.LegacyProxyService;
import org.dicoogle.protocol.legacyproxy.config.LegacyProxyProperties;
import org.dicoogle.sdk.query.QueryIndexMaintenance;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/system/index")
public class QueryIndexController {

  private static final Logger log = LoggerFactory.getLogger(QueryIndexController.class);

  private final QueryIndexMaintenanceService service;
  private final IndexTaskService taskService;
  private final LegacyProxyService legacyProxyService;
  private final LegacyProxyProperties legacyProxyProperties;

  public QueryIndexController(
      QueryIndexMaintenanceService service,
      IndexTaskService taskService,
      @org.springframework.beans.factory.annotation.Autowired(required = false)
          LegacyProxyService legacyProxyService,
      @org.springframework.beans.factory.annotation.Autowired(required = false)
          LegacyProxyProperties legacyProxyProperties) {
    this.service = service;
    this.taskService = taskService;
    this.legacyProxyService = legacyProxyService;
    this.legacyProxyProperties = legacyProxyProperties;
  }

  private boolean shouldFallbackToLegacy() {
    boolean hasIndexPlugin = service.hasIndexes();
    return legacyProxyProperties != null
        && legacyProxyProperties.shouldUseLegacyForQueryIndex(hasIndexPlugin);
  }

  @GetMapping("/status")
  @Operation(
      summary = "List query index status",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<?> status() {
    if (shouldFallbackToLegacy()) {
      if (legacyProxyService != null) {
        return fallbackStatus();
      }
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    return ResponseEntity.ok(
        service.status().stream()
            .map(it -> new QueryIndexStatusItem(it.pluginId(), it.documents()))
            .toList());
  }

  @PostMapping("/reindex")
  @Operation(
      summary = "Trigger query index reindex (async task)",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<?> reindex() {
    if (shouldFallbackToLegacy()) {
      if (legacyProxyService != null) {
        return fallbackReindex();
      }
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    if (!service.hasIndexes()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    String taskUid = taskService.submitReindexAll(service.getAllPlugins());
    return ResponseEntity.ok(Map.of("taskUid", taskUid));
  }

  @PostMapping("/index")
  @Operation(
      summary = "Index file/directory URIs (async task)",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<?> index(@RequestBody QueryIndexPathRequest request) {
    if (shouldFallbackToLegacy()) {
      if (legacyProxyService != null) {
        return fallbackIndex(request.uris());
      }
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    if (!service.hasIndexes()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    if (request.uris() == null || request.uris().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one URI is required");
    }
    List<URI> uris = parseUris(request.uris());
    QueryIndexMaintenance plugin = resolvePlugin(request.pluginId());
    String taskUid = taskService.submitIndexPaths(plugin, uris);
    return ResponseEntity.ok(Map.of("taskUid", taskUid));
  }

  @PostMapping("/unindex")
  @Operation(
      summary = "Unindex file/directory URIs (async task)",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<?> unindex(@RequestBody QueryIndexPathRequest request) {
    if (shouldFallbackToLegacy()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "Unindex is not supported in legacy fallback mode");
    }
    if (!service.hasIndexes()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    if (request.uris() == null || request.uris().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one URI is required");
    }
    List<URI> uris = parseUris(request.uris());
    QueryIndexMaintenance plugin = resolvePlugin(request.pluginId());
    String taskUid = taskService.submitUnindexPaths(plugin, uris);
    return ResponseEntity.ok(Map.of("taskUid", taskUid));
  }

  private QueryIndexMaintenance resolvePlugin(String pluginId) {
    if (!service.hasIndexes()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    if (pluginId == null || pluginId.isBlank()) {
      return service.getAllPlugins().getFirst();
    }
    return service.getPlugin(pluginId);
  }

  private List<URI> parseUris(List<String> rawUris) {
    if (rawUris == null || rawUris.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one URI is required");
    }
    List<URI> uris = new ArrayList<>(rawUris.size());
    for (String raw : rawUris) {
      if (raw == null || raw.isBlank()) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "URI values must not be blank");
      }
      uris.add(parseUriOrPath(raw.trim()));
    }
    return uris;
  }

  private URI parseUriOrPath(String raw) {
    try {
      URI uri = URI.create(raw);
      if (uri.getScheme() != null && !uri.getScheme().isBlank() && !looksLikeWindowsPath(raw)) {
        return uri;
      }
    } catch (IllegalArgumentException ignored) {
    }
    try {
      return Path.of(raw).toAbsolutePath().normalize().toUri();
    } catch (InvalidPathException ex) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid URI/path: " + raw);
    }
  }

  private boolean looksLikeWindowsPath(String value) {
    return value.length() >= 3
        && Character.isLetter(value.charAt(0))
        && value.charAt(1) == ':'
        && (value.charAt(2) == '\\' || value.charAt(2) == '/');
  }

  @SuppressWarnings("unchecked")
  private ResponseEntity<?> fallbackStatus() {
    log.info("No local index plugin, falling back to legacy for index status");
    Map<?, ?> response = legacyProxyService.searchQuery("index:status", null, 100, 0);
    if (response != null) {
      return ResponseEntity.ok(response);
    }
    return ResponseEntity.ok(List.of());
  }

  @SuppressWarnings("unchecked")
  private ResponseEntity<?> fallbackReindex() {
    log.info("No local index plugin, falling back to legacy for reindex");
    Map<?, ?> response = legacyProxyService.searchQuery("reindex", null, 100, 0);
    if (response != null) {
      return ResponseEntity.ok(response);
    }
    return ResponseEntity.ok(List.of());
  }

  @SuppressWarnings("unchecked")
  private ResponseEntity<?> fallbackIndex(List<String> uris) {
    log.info("No local index plugin, falling back to legacy for indexing: uris={}", uris);
    for (String uri : uris) {
      legacyProxyService.postIndex(uri);
    }
    return ResponseEntity.ok(List.of());
  }
}
