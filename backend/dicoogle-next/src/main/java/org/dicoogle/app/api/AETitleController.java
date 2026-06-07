package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.Map;
import org.dicoogle.app.settings.RuntimeSettingsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/management/settings/dicom")
public class AETitleController {

  private final RuntimeSettingsService settingsService;

  public AETitleController(RuntimeSettingsService settingsService) {
    this.settingsService = settingsService;
  }

  @GetMapping
  @Operation(summary = "Get AE title", security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, String>> getAeTitle() {
    String aeTitle = settingsService.getCurrent().getDimse().getCstore().getAeTitle();
    return ResponseEntity.ok(Map.of("aetitle", aeTitle));
  }

  @PutMapping
  @Operation(summary = "Update AE title", security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, Boolean>> updateAeTitle(
      @RequestParam("aetitle") String aeTitle) {
    settingsService.updateAETitle(aeTitle);
    return ResponseEntity.ok(Map.of("success", true));
  }

  @GetMapping("/query")
  @Operation(
      summary = "Get DICOM query (C-FIND) service settings",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, Object>> getQuerySettings() {
    Map<String, Object> settings = new java.util.LinkedHashMap<>();
    settings.put("isRunning", false);
    settings.put("port", 0);
    settings.put("autostart", false);
    settings.put("hostname", "");
    return ResponseEntity.ok(settings);
  }

  @PostMapping("/query")
  @Operation(
      summary = "Update DICOM query (C-FIND) service settings",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, Object>> updateQuerySettings(
      @RequestParam(required = false) Integer port,
      @RequestParam(required = false) Boolean autostart,
      @RequestParam(required = false) Boolean running,
      @RequestParam(required = false) String hostname) {
    Map<String, Object> settings = new java.util.LinkedHashMap<>();
    settings.put("isRunning", false);
    settings.put("port", 0);
    settings.put("autostart", false);
    settings.put("hostname", "");
    return ResponseEntity.ok(settings);
  }
}
