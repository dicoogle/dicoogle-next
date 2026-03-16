package pt.ua.dicooglenext.dicooglenext.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class SystemStatusServiceTest {

  @Test
  void returnsCurrentProfileInStatus() {
    MockEnvironment environment = new MockEnvironment();
    environment.setActiveProfiles("test");

    SystemStatusService service = new SystemStatusService(environment);

    assertThat(service.currentStatus().environment()).isEqualTo("test");
    assertThat(service.currentStatus().status()).isEqualTo("ok");
  }
}
