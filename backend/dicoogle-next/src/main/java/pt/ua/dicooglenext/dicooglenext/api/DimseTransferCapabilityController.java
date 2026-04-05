package pt.ua.dicooglenext.dicooglenext.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import java.security.Principal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pt.ua.dicooglenext.dicooglenext.dto.DimseTransferCapabilityDtos.TransferCapabilityListResponse;
import pt.ua.dicooglenext.dicooglenext.dto.DimseTransferCapabilityDtos.TransferCapabilityReplaceRequest;
import pt.ua.dicooglenext.dicooglenext.dto.DimseTransferCapabilityDtos.TransferCapabilityUpsertRequest;
import pt.ua.dicooglenext.dicooglenext.service.DimseTransferCapabilityService;

@RestController
@RequestMapping("/system/config/dimse/transfer-capabilities")
public class DimseTransferCapabilityController {

  private final DimseTransferCapabilityService service;

  public DimseTransferCapabilityController(DimseTransferCapabilityService service) {
    this.service = service;
  }

  @GetMapping
  @Operation(
      summary = "List effective DIMSE transfer capabilities",
      security = @SecurityRequirement(name = "basicAuth"))
  public TransferCapabilityListResponse list() {
    return service.getCurrent();
  }

  @PutMapping("/{sopClassUid}")
  @Operation(
      summary = "Create or replace one SOP capability",
      security = @SecurityRequirement(name = "basicAuth"))
  public TransferCapabilityListResponse upsert(
      @PathVariable String sopClassUid,
      @Valid @RequestBody TransferCapabilityUpsertRequest request,
      Principal principal) {
    return service.upsertOne(sopClassUid, request.transferSyntaxUids(), actor(principal));
  }

  @DeleteMapping("/{sopClassUid}")
  @Operation(
      summary = "Delete one SOP capability",
      security = @SecurityRequirement(name = "basicAuth"))
  public TransferCapabilityListResponse delete(@PathVariable String sopClassUid, Principal principal) {
    return service.deleteOne(sopClassUid, actor(principal));
  }

  @PostMapping("/replace")
  @Operation(
      summary = "Replace all DIMSE transfer capabilities",
      security = @SecurityRequirement(name = "basicAuth"))
  public TransferCapabilityListResponse replaceAll(
      @Valid @RequestBody TransferCapabilityReplaceRequest request, Principal principal) {
    return service.replaceAll(
        request.acceptedTransferCapabilities(), request.expectedVersion(), actor(principal));
  }

  private static String actor(Principal principal) {
    return principal == null ? "api" : principal.getName();
  }
}
