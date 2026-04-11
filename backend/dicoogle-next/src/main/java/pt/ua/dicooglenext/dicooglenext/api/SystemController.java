package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.dicoogle.app.dto.SystemStatusResponse;
import org.dicoogle.app.service.SystemStatusService;

@RestController
@RequestMapping("/system")
public class SystemController {

  private final SystemStatusService systemStatusService;

  public SystemController(SystemStatusService systemStatusService) {
    this.systemStatusService = systemStatusService;
  }

  @GetMapping("/ping")
  @Operation(
      summary = "Public ping endpoint",
      security = {})
  public SystemStatusResponse ping() {
    return systemStatusService.currentStatus();
  }

  @GetMapping("/status")
  @Operation(
      summary = "Protected system status",
      security = @SecurityRequirement(name = "basicAuth"))
  public SystemStatusResponse status() {
    return systemStatusService.currentStatus();
  }
}
