package pt.ua.dicooglenext.dicooglenext.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pt.ua.dicooglenext.core.plugins.PluginRegistry;
import pt.ua.dicooglenext.dicooglenext.dto.PluginStatusResponse;

@RestController
@RequestMapping("/system/plugins")
public class PluginController {

  private final PluginRegistry pluginRegistry;

  public PluginController(PluginRegistry pluginRegistry) {
    this.pluginRegistry = pluginRegistry;
  }

  @GetMapping
  @Operation(summary = "List loaded plugins", security = @SecurityRequirement(name = "basicAuth"))
  public List<PluginStatusResponse> listPlugins() {
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
}
