package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.dicoogle.app.service.DimseTransferCapabilityService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/management/settings/transfer")
public class TransferOptionsController {

  private final DimseTransferCapabilityService service;

  public TransferOptionsController(DimseTransferCapabilityService service) {
    this.service = service;
  }

  @GetMapping
  @Operation(
      summary = "List transfer capabilities",
      security = @SecurityRequirement(name = "basicAuth"))
  public ResponseEntity<?> list() {
    return ResponseEntity.ok(service.getCurrent());
  }

  @PostMapping
  @Operation(
      summary = "Update transfer capability",
      security = @SecurityRequirement(name = "basicAuth"))
  public ResponseEntity<?> update(
      @RequestParam("uid") String sopClassUid,
      @RequestParam("option") String option,
      @RequestParam("value") boolean value) {
    return ResponseEntity.ok(service.applyLegacyToggle(sopClassUid, option, value, "legacy"));
  }
}
