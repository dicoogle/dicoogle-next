package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import org.dicoogle.app.settings.RuntimeSettings;
import org.dicoogle.app.settings.RuntimeSettingsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/management/settings/storage/dicom")
public class StorageDestinationsController {

  private final RuntimeSettingsService settingsService;

  public StorageDestinationsController(RuntimeSettingsService settingsService) {
    this.settingsService = settingsService;
  }

  @GetMapping
  @Operation(
      summary = "List move destinations",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Collection<Map<String, Object>>> list() {
    Collection<RuntimeSettings.MoveDestinationSetting> values =
        settingsService.getCurrent().getDimse().getMoveDestinations().values();
    var result = new ArrayList<Map<String, Object>>(values.size());
    for (RuntimeSettings.MoveDestinationSetting dest : values) {
      Map<String, Object> map = new LinkedHashMap<>();
      map.put("AETitle", dest.getAeTitle());
      map.put("ipAddrs", dest.getHost());
      map.put("port", dest.getPort());
      map.put("description", dest.getDescription());
      map.put("isPublic", dest.isPublic());
      result.add(map);
    }
    return ResponseEntity.ok(result);
  }

  @PostMapping
  @Operation(
      summary = "Add or remove a move destination",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, Boolean>> update(
      @RequestParam("type") String type,
      @RequestParam("aetitle") String aeTitle,
      @RequestParam(value = "ip", required = false) String host,
      @RequestParam(value = "port", required = false) Integer port,
      @RequestParam(value = "public", required = false, defaultValue = "false") boolean isPublic,
      @RequestParam(value = "description", required = false) String description) {
    if ("add".equalsIgnoreCase(type)) {
      if (host == null || port == null) {
        throw new IllegalArgumentException("ip and port are required to add a destination");
      }
      settingsService.addMoveDestination(aeTitle, host, port, isPublic, description);
      return ResponseEntity.ok(Map.of("added", true));
    }
    if ("remove".equalsIgnoreCase(type)) {
      settingsService.removeMoveDestination(aeTitle);
      return ResponseEntity.ok(Map.of("removed", true));
    }
    throw new IllegalArgumentException("type must be add or remove");
  }
}
