package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.LinkedHashMap;
import java.util.Map;
import org.dicoogle.app.settings.RuntimeSettings;
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
    RuntimeSettings.DicomQueryRetrieveSettings qr =
        settingsService.getCurrent().getDimse().getQueryRetrieve();
    Map<String, Object> settings = new LinkedHashMap<>();
    settings.put("responseTimeout", qr.getResponseTimeout());
    settings.put("connectionTimeout", qr.getConnectionTimeout());
    settings.put("idleTimeout", qr.getIdleTimeout());
    settings.put("acceptTimeout", qr.getAcceptTimeout());
    settings.put("maxPduSend", qr.getMaxPduSend());
    settings.put("maxPduReceive", qr.getMaxPduReceive());
    settings.put("maxAssociations", qr.getMaxAssociations());
    return ResponseEntity.ok(settings);
  }

  @PostMapping("/query")
  @Operation(
      summary = "Update DICOM query (C-FIND) service settings",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<Map<String, Object>> updateQuerySettings(
      @RequestParam(required = false) Integer responseTimeout,
      @RequestParam(required = false) Integer connectionTimeout,
      @RequestParam(required = false) Integer idleTimeout,
      @RequestParam(required = false) Integer acceptTimeout,
      @RequestParam(required = false) Integer maxPduSend,
      @RequestParam(required = false) Integer maxPduReceive,
      @RequestParam(required = false) Integer maxAssociations) {
    settingsService.updateQueryRetrieveSettings(
        responseTimeout,
        connectionTimeout,
        idleTimeout,
        acceptTimeout,
        maxPduSend,
        maxPduReceive,
        maxAssociations);
    RuntimeSettings.DicomQueryRetrieveSettings qr =
        settingsService.getCurrent().getDimse().getQueryRetrieve();
    Map<String, Object> settings = new LinkedHashMap<>();
    settings.put("responseTimeout", qr.getResponseTimeout());
    settings.put("connectionTimeout", qr.getConnectionTimeout());
    settings.put("idleTimeout", qr.getIdleTimeout());
    settings.put("acceptTimeout", qr.getAcceptTimeout());
    settings.put("maxPduSend", qr.getMaxPduSend());
    settings.put("maxPduReceive", qr.getMaxPduReceive());
    settings.put("maxAssociations", qr.getMaxAssociations());
    return ResponseEntity.ok(settings);
  }
}
