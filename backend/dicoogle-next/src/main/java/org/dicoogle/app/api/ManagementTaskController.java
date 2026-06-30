package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.dicoogle.app.service.IndexTaskService;
import org.dicoogle.app.service.QueryIndexMaintenanceService;
import org.dicoogle.sdk.query.QueryIndexMaintenance;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/management/tasks")
public class ManagementTaskController {

  private final QueryIndexMaintenanceService queryIndexService;
  private final IndexTaskService taskService;

  public ManagementTaskController(
      QueryIndexMaintenanceService queryIndexService, IndexTaskService taskService) {
    this.queryIndexService = queryIndexService;
    this.taskService = taskService;
  }

  @PostMapping("/index")
  @Operation(
      summary = "Index a file or directory by URI",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, Object>> index(
      @RequestParam("uri") String uri,
      @RequestParam(value = "pluginId", required = false) String pluginId) {
    if (!queryIndexService.hasIndexes()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    QueryIndexMaintenance plugin;
    if (pluginId != null && !pluginId.isBlank()) {
      plugin = queryIndexService.getPlugin(pluginId);
    } else {
      plugin = queryIndexService.getAllPlugins().getFirst();
    }
    URI parsedUri;
    try {
      parsedUri = URI.create(uri);
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().body(Map.of("error", "Invalid URI: " + uri));
    }
    String taskUid = taskService.submitIndexPaths(plugin, List.of(parsedUri));
    return ResponseEntity.ok(Map.of("taskUid", taskUid));
  }

  @PostMapping("/unindex")
  @Operation(
      summary = "Remove a file or directory from the index",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, Object>> unindex(
      @RequestParam("uri") String uri,
      @RequestParam(value = "provider", required = false) String provider) {
    if (!queryIndexService.hasIndexes()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    QueryIndexMaintenance plugin;
    if (provider != null && !provider.isBlank()) {
      plugin = queryIndexService.getPlugin(provider);
    } else {
      plugin = queryIndexService.getAllPlugins().getFirst();
    }
    URI parsedUri;
    try {
      parsedUri = URI.create(uri);
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().body(Map.of("error", "Invalid URI: " + uri));
    }
    String taskUid = taskService.submitUnindexPaths(plugin, List.of(parsedUri));
    return ResponseEntity.ok(Map.of("taskUid", taskUid));
  }

  @PostMapping("/remove")
  @Operation(
      summary = "Permanently delete a file by URI",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, Object>> remove(@RequestParam("uri") String uri) {
    URI parsedUri;
    try {
      parsedUri = URI.create(uri);
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().body(Map.of("error", "Invalid URI: " + uri));
    }
    if (!"file".equals(parsedUri.getScheme())) {
      return ResponseEntity.badRequest()
          .body(Map.of("error", "Only file:/// URIs are supported for removal"));
    }
    Path path;
    try {
      path = Path.of(parsedUri);
    } catch (Exception e) {
      return ResponseEntity.badRequest().body(Map.of("error", "Bad path: " + uri));
    }
    try {
      if (Files.isDirectory(path)) {
        try (var stream = Files.walk(path)) {
          stream
              .sorted(java.util.Comparator.reverseOrder())
              .forEach(
                  p -> {
                    try {
                      Files.delete(p);
                    } catch (IOException ex) {
                      // ignore per-file errors
                    }
                  });
        }
      } else {
        Files.deleteIfExists(path);
      }
    } catch (IOException e) {
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
          .body(Map.of("error", "Failed to delete: " + e.getMessage()));
    }
    return ResponseEntity.ok(Map.of("success", true));
  }
}
