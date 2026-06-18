package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.List;
import org.dicoogle.app.dto.QueryIndexDtos.QueryIndexPathItem;
import org.dicoogle.app.dto.QueryIndexDtos.QueryIndexPathRequest;
import org.dicoogle.app.dto.QueryIndexDtos.QueryIndexReindexItem;
import org.dicoogle.app.dto.QueryIndexDtos.QueryIndexStatusItem;
import org.dicoogle.app.service.QueryIndexMaintenanceService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/system/index")
public class QueryIndexController {

  private final QueryIndexMaintenanceService service;

  public QueryIndexController(QueryIndexMaintenanceService service) {
    this.service = service;
  }

  @GetMapping("/status")
  @Operation(
      summary = "List query index status",
      security = @SecurityRequirement(name = "bearerAuth"))
  public List<QueryIndexStatusItem> status() {
    if (!service.hasIndexes()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    return service.status().stream()
        .map(it -> new QueryIndexStatusItem(it.pluginId(), it.documents()))
        .toList();
  }

  @PostMapping("/reindex")
  @Operation(
      summary = "Trigger query index reindex",
      security = @SecurityRequirement(name = "bearerAuth"))
  public List<QueryIndexReindexItem> reindex() {
    if (!service.hasIndexes()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    return service.reindexAll().stream()
        .map(it -> new QueryIndexReindexItem(it.pluginId(), it.indexedDocuments()))
        .toList();
  }

  @PostMapping("/index")
  @Operation(
      summary = "Index file/directory URIs",
      security = @SecurityRequirement(name = "bearerAuth"))
  public List<QueryIndexPathItem> index(@RequestBody QueryIndexPathRequest request) {
    if (!service.hasIndexes()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    try {
      return service.indexPaths(request.uris(), request.pluginId()).stream()
          .map(it -> new QueryIndexPathItem(it.pluginId(), it.affectedItems()))
          .toList();
    } catch (IllegalArgumentException ex) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage());
    }
  }

  @PostMapping("/unindex")
  @Operation(
      summary = "Unindex file/directory URIs",
      security = @SecurityRequirement(name = "bearerAuth"))
  public List<QueryIndexPathItem> unindex(@RequestBody QueryIndexPathRequest request) {
    if (!service.hasIndexes()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED, "No query index plugin is configured");
    }
    try {
      return service.unindexPaths(request.uris(), request.pluginId()).stream()
          .map(it -> new QueryIndexPathItem(it.pluginId(), it.affectedItems()))
          .toList();
    } catch (IllegalArgumentException ex) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage());
    }
  }
}
