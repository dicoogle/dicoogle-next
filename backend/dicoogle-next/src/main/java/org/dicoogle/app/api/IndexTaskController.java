package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.Map;
import org.dicoogle.app.dto.IndexTaskDtos.TaskResults;
import org.dicoogle.app.service.IndexTaskService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/index/task")
public class IndexTaskController {

  private final IndexTaskService taskService;

  public IndexTaskController(IndexTaskService taskService) {
    this.taskService = taskService;
  }

  @GetMapping
  @Operation(summary = "Get indexing tasks", security = @SecurityRequirement(name = "basicAuth"))
  public TaskResults listTasks() {
    return taskService.listTasks();
  }

  @PostMapping
  @Operation(
      summary = "Change an indexing task",
      security = @SecurityRequirement(name = "basicAuth"))
  public ResponseEntity<Map<String, Object>> changeTask(
      @RequestParam String action, @RequestParam String type, @RequestParam String uid) {
    if (!"delete".equals(action)) {
      return ResponseEntity.badRequest()
          .body(Map.of("error", "action param needed: only delete is supported"));
    }
    if ("close".equals(type)) {
      boolean removed = taskService.removeTask(uid);
      return ResponseEntity.ok(Map.of("removed", removed));
    } else if ("stop".equals(type)) {
      boolean stopped = taskService.stopTask(uid);
      return ResponseEntity.ok(Map.of("stopped", stopped));
    } else {
      return ResponseEntity.badRequest().body(Map.of("error", "unknown type: " + type));
    }
  }
}
