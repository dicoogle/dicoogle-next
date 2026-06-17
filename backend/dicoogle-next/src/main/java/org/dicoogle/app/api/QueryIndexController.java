package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.List;
import java.util.Map;
import org.dicoogle.app.dto.QueryIndexDtos.QueryIndexPathItem;
import org.dicoogle.app.dto.QueryIndexDtos.QueryIndexPathRequest;
import org.dicoogle.app.dto.QueryIndexDtos.QueryIndexReindexItem;
import org.dicoogle.app.dto.QueryIndexDtos.QueryIndexStatusItem;
import org.dicoogle.app.service.QueryIndexMaintenanceService;
import org.dicoogle.protocol.legacyproxy.LegacyProxyService;
import org.dicoogle.protocol.legacyproxy.config.LegacyProxyProperties;
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
  private final LegacyProxyService legacyProxyService;
  private final LegacyProxyProperties legacyProxyProperties;

  public QueryIndexController(
      QueryIndexMaintenanceService service,
      @org.springframework.beans.factory.annotation.Autowired(required = false)
          LegacyProxyService legacyProxyService,
      @org.springframework.beans.factory.annotation.Autowired(required = false)
          LegacyProxyProperties legacyProxyProperties) {
    this.service = service;
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
      summary = "Trigger query index reindex",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<?> reindex() {
    if (shouldFallbackToLegacy()) {
      if (legacyProxyService != null) {
        return fallbackReindex();
      }
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    return ResponseEntity.ok(
        service.reindexAll().stream()
            .map(it -> new QueryIndexReindexItem(it.pluginId(), it.indexedDocuments()))
            .toList());
  }

  @PostMapping("/index")
  @Operation(
      summary = "Index file/directory URIs",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<?> index(@RequestBody QueryIndexPathRequest request) {
    if (shouldFallbackToLegacy()) {
      if (legacyProxyService != null) {
        return fallbackIndex(request.uris());
      }
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    try {
      return ResponseEntity.ok(
          service.indexPaths(request.uris(), request.pluginId()).stream()
              .map(it -> new QueryIndexPathItem(it.pluginId(), it.affectedItems()))
              .toList());
    } catch (IllegalArgumentException ex) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage());
    }
  }

  @PostMapping("/unindex")
  @Operation(
      summary = "Unindex file/directory URIs",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<?> unindex(@RequestBody QueryIndexPathRequest request) {
    if (!service.hasIndexes()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    try {
      return ResponseEntity.ok(
          service.unindexPaths(request.uris(), request.pluginId()).stream()
              .map(it -> new QueryIndexPathItem(it.pluginId(), it.affectedItems()))
              .toList());
    } catch (IllegalArgumentException ex) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage());
    }
  }

  @SuppressWarnings("unchecked")
  private ResponseEntity<?> fallbackStatus() {
    log.info("No local index plugin, falling back to legacy for index status");
    Map<?, ?> response = legacyProxyService.searchQuery("index:status", null, 100);
    if (response != null) {
      return ResponseEntity.ok(response);
    }
    return ResponseEntity.ok(List.of());
  }

  @SuppressWarnings("unchecked")
  private ResponseEntity<?> fallbackReindex() {
    log.info("No local index plugin, falling back to legacy for reindex");
    Map<?, ?> response = legacyProxyService.searchQuery("reindex", null, 100);
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
