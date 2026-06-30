package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.dicoogle.app.dto.PluginStatusResponse;
import org.dicoogle.core.plugins.PluginRegistry;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PluginController {

  private final PluginRegistry pluginRegistry;
  private final Set<String> disabledPlugins = new HashSet<>();

  public PluginController(PluginRegistry pluginRegistry) {
    this.pluginRegistry = pluginRegistry;
  }

  @GetMapping("/plugins")
  @Operation(summary = "List loaded plugins", security = @SecurityRequirement(name = "bearerAuth"))
  public Map<String, List<Map<String, Object>>> listPlugins() {
    List<Map<String, Object>> plugins =
        pluginRegistry.all().stream()
            .map(
                plugin -> {
                  Map<String, Object> entry = new LinkedHashMap<>();
                  entry.put("name", plugin.metadata().id());
                  entry.put("type", plugin.metadata().type());
                  entry.put("enabled", !disabledPlugins.contains(plugin.metadata().id()));
                  return entry;
                })
            .toList();
    return Map.of("plugins", plugins);
  }

  @GetMapping("/system/plugins")
  @Operation(
      summary = "List loaded plugins (system path)",
      security = @SecurityRequirement(name = "bearerAuth"))
  public List<PluginStatusResponse> listSystemPlugins() {
    return pluginRegistry.all().stream()
        .map(
            plugin ->
                new PluginStatusResponse(
                    plugin.metadata().id(),
                    plugin.metadata().name(),
                    plugin.metadata().version(),
                    plugin.metadata().type()))
        .toList();
  }

  @PostMapping("/plugins/{type}/{id}/disable")
  @Operation(summary = "Disable a plugin", security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, Object>> disablePlugin(
      @PathVariable("type") String type, @PathVariable("id") String id) {
    disabledPlugins.add(id);
    return ResponseEntity.ok(Map.of("success", true, "name", id, "enabled", false));
  }

  @PostMapping("/plugins/{type}/{id}/enable")
  @Operation(summary = "Enable a plugin", security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, Object>> enablePlugin(
      @PathVariable("type") String type, @PathVariable("id") String id) {
    disabledPlugins.remove(id);
    return ResponseEntity.ok(Map.of("success", true, "name", id, "enabled", true));
  }
}
