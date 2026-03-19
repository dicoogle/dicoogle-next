package pt.ua.dicooglenext.dicooglenext.service;

import java.util.Arrays;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import pt.ua.dicooglenext.dicooglenext.dto.SystemStatusResponse;

@Service
public class SystemStatusService {

  private final Environment environment;

  public SystemStatusService(Environment environment) {
    this.environment = environment;
  }

  public SystemStatusResponse currentStatus() {
    String[] activeProfiles = environment.getActiveProfiles();
    String profile = activeProfiles.length == 0 ? "default" : String.join(",", activeProfiles);
    return new SystemStatusResponse("dicoogle-next", profile, "ok");
  }

  public String ping() {
    return Arrays.stream(environment.getActiveProfiles()).findFirst().orElse("default");
  }
}
