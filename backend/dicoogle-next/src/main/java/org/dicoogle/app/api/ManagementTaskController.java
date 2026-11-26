package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.dicoogle.app.service.IndexTaskService;
import org.dicoogle.app.service.QueryIndexMaintenanceService;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.query.QueryIndexMaintenance;
import org.dicoogle.sdk.storage.DeletableStoragePlugin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

  private static final Logger log = LoggerFactory.getLogger(ManagementTaskController.class);

  private final QueryIndexMaintenanceService queryIndexService;
  private final IndexTaskService taskService;
  private final StorageRouter storageRouter;

  public ManagementTaskController(
      QueryIndexMaintenanceService queryIndexService,
      IndexTaskService taskService,
      StorageRouter storageRouter) {
    this.queryIndexService = queryIndexService;
    this.taskService = taskService;
    this.storageRouter = storageRouter;
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
      description =
          "Deletes through the storage plugin that handles the URI's scheme, then removes the"
              + " deleted location from every query index.",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, Object>> remove(@RequestParam("uri") String uri) {
    URI parsedUri;
    try {
      parsedUri = URI.create(uri);
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().body(Map.of("error", "Invalid URI: " + uri));
    }
    String scheme = parsedUri.getScheme();
    if (scheme == null || scheme.isBlank()) {
      return ResponseEntity.badRequest().body(Map.of("error", "URI has no scheme: " + uri));
    }

    Optional<DeletableStoragePlugin> plugin = storageRouter.findDeletable(scheme);
    int deleted;
    try {
      if (plugin.isPresent()) {
        deleted = plugin.get().delete(parsedUri);
      } else if ("file".equalsIgnoreCase(scheme)) {
        deleted = deleteLocalPath(parsedUri); // no file plugin can delete: previous behaviour
      } else {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
            .body(Map.of("error", "No storage plugin can delete " + scheme + ": URIs"));
      }
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().body(Map.of("error", "Bad path: " + uri));
    } catch (IOException e) {
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
          .body(Map.of("error", "Failed to delete: " + e.getMessage()));
    }

    return ResponseEntity.ok(
        Map.of("success", true, "deleted", deleted, "unindexed", unindexEverywhere(parsedUri)));
  }

  /** Removes the location from every query index; a failing index does not undo the delete. */
  private int unindexEverywhere(URI location) {
    if (!queryIndexService.hasIndexes()) {
      return 0;
    }
    int total = 0;
    for (QueryIndexMaintenance index : queryIndexService.getAllPlugins()) {
      try {
        total += index.unindexPath(location);
      } catch (IOException | RuntimeException e) {
        log.warn("Deleted {} but could not unindex it from {}", location, index.indexId(), e);
      }
    }
    return total;
  }

  private static int deleteLocalPath(URI location) throws IOException {
    Path path = Path.of(location);
    if (!Files.isDirectory(path)) {
      return Files.deleteIfExists(path) ? 1 : 0;
    }
    int[] count = {0};
    try (var stream = Files.walk(path)) {
      stream
          .sorted(Comparator.reverseOrder())
          .forEach(
              p -> {
                try {
                  boolean isFile = Files.isRegularFile(p);
                  if (Files.deleteIfExists(p) && isFile) {
                    count[0]++;
                  }
                } catch (IOException ex) {
                  // ignore per-file errors
                }
              });
    }
    return count[0];
  }
}
