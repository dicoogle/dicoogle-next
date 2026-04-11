package org.dicoogle.app.service;

import java.util.Arrays;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.dicoogle.app.dto.SystemStatusResponse;

@Service
public class SystemStatusService {

  private final Environment environment;
  private final ObjectProvider<DimseTransferCapabilityService> transferCapabilityServiceProvider;

  public SystemStatusService(
      Environment environment,
      ObjectProvider<DimseTransferCapabilityService> transferCapabilityServiceProvider) {
    this.environment = environment;
    this.transferCapabilityServiceProvider = transferCapabilityServiceProvider;
  }

  public SystemStatusResponse currentStatus() {
    String[] activeProfiles = environment.getActiveProfiles();
    String profile = activeProfiles.length == 0 ? "default" : String.join(",", activeProfiles);
    DimseTransferCapabilityService transferCapabilityService =
        transferCapabilityServiceProvider.getIfAvailable();
    String source = transferCapabilityService == null ? "n/a" : transferCapabilityService.sourceName();
    long version = transferCapabilityService == null ? -1 : transferCapabilityService.appliedVersion();
    String appliedAt =
        transferCapabilityService == null ? "n/a" : transferCapabilityService.lastAppliedAt();

    return new SystemStatusResponse(
        "dicoogle-next", profile, "ok", source, version, appliedAt);
  }

  public String ping() {
    return Arrays.stream(environment.getActiveProfiles()).findFirst().orElse("default");
  }
}
