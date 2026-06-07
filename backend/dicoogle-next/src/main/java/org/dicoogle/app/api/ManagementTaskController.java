package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.net.URI;
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
}
