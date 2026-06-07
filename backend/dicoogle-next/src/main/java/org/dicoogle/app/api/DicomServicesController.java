package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.dicoogle.app.settings.RuntimeSettings;
import org.dicoogle.app.settings.RuntimeSettingsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/management/dicom")
public class DicomServicesController {

  private final RuntimeSettingsService settingsService;

  public DicomServicesController(RuntimeSettingsService settingsService) {
    this.settingsService = settingsService;
  }

  @GetMapping("/storage")
  @Operation(
      summary = "Get C-STORE service state",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<ServiceStatusResponse> getStorage() {
    RuntimeSettings.DimseCStoreSettings cstore =
        settingsService.getCurrent().getDimse().getCstore();
    return ResponseEntity.ok(
        new ServiceStatusResponse(
            settingsService.isCStoreRunning(),
            cstore.getPort(),
            cstore.isEnabled(),
            cstore.getBindAddress()));
  }

  @PostMapping("/storage")
  @Operation(
      summary = "Update C-STORE service state",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<ServiceStatusResponse> updateStorage(
      @RequestParam(required = false) Integer port,
      @RequestParam(required = false) Boolean autostart,
      @RequestParam(required = false) Boolean running,
      @RequestParam(required = false) String hostname) {
    RuntimeSettings updated = settingsService.updateCStore(port, hostname, autostart, running);
    RuntimeSettings.DimseCStoreSettings cstore = updated.getDimse().getCstore();
    return ResponseEntity.ok(
        new ServiceStatusResponse(
            settingsService.isCStoreRunning(),
            cstore.getPort(),
            cstore.isEnabled(),
            cstore.getBindAddress()));
  }

  @GetMapping("/query")
  @Operation(
      summary = "Get C-FIND service state",
      description = "C-FIND runs on the same DIMSE server as C-STORE; returns the same status",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<ServiceStatusResponse> getQuery() {
    RuntimeSettings.DimseCStoreSettings cstore =
        settingsService.getCurrent().getDimse().getCstore();
    return ResponseEntity.ok(
        new ServiceStatusResponse(
            settingsService.isCStoreRunning(),
            cstore.getPort(),
            cstore.isEnabled(),
            cstore.getBindAddress()));
  }

  @PostMapping("/query")
  @Operation(
      summary = "Update C-FIND service state",
      description =
          "C-FIND runs on the same DIMSE server as C-STORE; starts/stops the shared server",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<ServiceStatusResponse> updateQuery(
      @RequestParam(required = false) Integer port,
      @RequestParam(required = false) Boolean autostart,
      @RequestParam(required = false) Boolean running,
      @RequestParam(required = false) String hostname) {
    RuntimeSettings updated = settingsService.updateCStore(port, hostname, autostart, running);
    RuntimeSettings.DimseCStoreSettings cstore = updated.getDimse().getCstore();
    return ResponseEntity.ok(
        new ServiceStatusResponse(
            settingsService.isCStoreRunning(),
            cstore.getPort(),
            cstore.isEnabled(),
            cstore.getBindAddress()));
  }

  private record ServiceStatusResponse(
      boolean isRunning, int port, boolean autostart, String hostname) {}
}
