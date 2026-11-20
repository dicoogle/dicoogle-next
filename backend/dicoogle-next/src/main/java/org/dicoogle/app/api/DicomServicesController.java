package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.dicoogle.app.settings.RuntimeSettings;
import org.dicoogle.app.settings.RuntimeSettings.DimseTlsCStoreSettings;
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
      summary = "Get DICOM Storage (C-STORE without TLS) service state",
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
      summary = "Update DICOM Storage (C-STORE without TLS) service state",
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

  @GetMapping("/storage-tls")
  @Operation(
      summary = "Get TLS DICOM Storage (C-STORE with TLS) service state",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<ServiceStatusResponse> getStorageTls() {
    DimseTlsCStoreSettings cstore = settingsService.getCurrent().getDimse().getCstoreTls();
    return ResponseEntity.ok(
        new ServiceStatusResponse(
            settingsService.isTlsCStoreRunning(),
            cstore.getPort(),
            cstore.isEnabled(),
            cstore.getBindAddress()));
  }

  @PostMapping("/storage-tls")
  @Operation(
      summary = "Update TLS DICOM Storage (C-STORE with TLS) service state",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<ServiceStatusResponse> updateStorageTls(
      @RequestParam(required = false) Integer port,
      @RequestParam(required = false) Boolean autostart,
      @RequestParam(required = false) Boolean running,
      @RequestParam(required = false) String hostname) {
    RuntimeSettings updated = settingsService.updateCStoreTls(port, hostname, autostart, running);
    var cstore = updated.getDimse().getCstoreTls();
    return ResponseEntity.ok(
        new ServiceStatusResponse(
            settingsService.isTlsCStoreRunning(),
            cstore.getPort(),
            cstore.isEnabled(),
            cstore.getBindAddress()));
  }

  @GetMapping("/query")
  @Operation(
      summary = "Get C-FIND/C-MOVE (DICOM Query-Retrieve) service state",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<ServiceStatusResponse> getQuery() {
    RuntimeSettings.DimseQueryRetrieveSettings qr =
        settingsService.getCurrent().getDimse().getQueryRetrieveServer();
    return ResponseEntity.ok(
        new ServiceStatusResponse(
            settingsService.isQueryRetrieveRunning(),
            qr.getPort(),
            qr.isEnabled(),
            qr.getBindAddress()));
  }

  @PostMapping("/query")
  @Operation(
      summary = "Update C-FIND/C-MOVE (DICOM Query-Retrieve) service state",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<ServiceStatusResponse> updateQuery(
      @RequestParam(required = false) Integer port,
      @RequestParam(required = false) Boolean autostart,
      @RequestParam(required = false) Boolean running,
      @RequestParam(required = false) String hostname) {
    RuntimeSettings updated =
        settingsService.updateQueryRetrieveServer(port, hostname, autostart, running);
    RuntimeSettings.DimseQueryRetrieveSettings qr = updated.getDimse().getQueryRetrieveServer();
    return ResponseEntity.ok(
        new ServiceStatusResponse(
            settingsService.isQueryRetrieveRunning(),
            qr.getPort(),
            qr.isEnabled(),
            qr.getBindAddress()));
  }

  private record ServiceStatusResponse(
      boolean isRunning, int port, boolean autostart, String hostname) {}
}
