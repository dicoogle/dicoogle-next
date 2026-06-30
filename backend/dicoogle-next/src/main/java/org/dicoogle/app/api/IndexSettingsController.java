package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.dicoogle.sdk.query.QueryIndexPlugin;
import org.dicoogle.sdk.query.QueryIndexSettings;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/management/settings/index")
public class IndexSettingsController {

  private final QueryIndexSettings indexSettings;

  public IndexSettingsController(List<QueryIndexPlugin> queryPlugins) {
    this.indexSettings =
        queryPlugins.stream()
            .filter(p -> p instanceof QueryIndexSettings)
            .map(p -> (QueryIndexSettings) p)
            .findFirst()
            .orElse(null);
  }

  @GetMapping
  @Operation(
      summary = "Get all index settings",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<?> getAll() {
    if (indexSettings == null) {
      return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
    Map<String, Object> all = new LinkedHashMap<>();
    all.put("path", indexSettings.getIndexPath());
    all.put("watcher", indexSettings.isWatchEnabled());
    return ResponseEntity.ok(all);
  }

  @GetMapping("/path")
  @Operation(summary = "Get index path", security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<?> getPath() {
    if (indexSettings == null) {
      return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
    return ResponseEntity.ok(Map.of("path", indexSettings.getIndexPath()));
  }

  @PutMapping("/path")
  @Operation(summary = "Update index path", security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<?> updatePath(@RequestParam String path) {
    if (indexSettings == null) {
      return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
    if (path == null || path.isBlank()) {
      throw new IllegalArgumentException("path must not be empty");
    }
    indexSettings.setIndexPath(path.trim());
    return ResponseEntity.ok(Map.of("success", true, "path", indexSettings.getIndexPath()));
  }

  @GetMapping("/watcher")
  @Operation(summary = "Get watcher state", security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<?> getWatcher() {
    if (indexSettings == null) {
      return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
    return ResponseEntity.ok(Map.of("watcher", indexSettings.isWatchEnabled()));
  }

  @PutMapping("/watcher")
  @Operation(summary = "Update watcher state", security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<?> updateWatcher(@RequestParam boolean watcher) {
    if (indexSettings == null) {
      return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }
    indexSettings.setWatchEnabled(watcher);
    return ResponseEntity.ok(Map.of("success", true, "watcher", indexSettings.isWatchEnabled()));
  }
}
