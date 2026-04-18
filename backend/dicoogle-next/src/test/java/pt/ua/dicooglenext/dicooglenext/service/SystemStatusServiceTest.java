package org.dicoogle.app.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.mock.env.MockEnvironment;

class SystemStatusServiceTest {

  @Test
  void returnsCurrentProfileInStatus() {
    MockEnvironment environment = new MockEnvironment();
    environment.setActiveProfiles("test");

    StaticListableBeanFactory factory = new StaticListableBeanFactory();

    SystemStatusService service =
        new SystemStatusService(
            environment, factory.getBeanProvider(DimseTransferCapabilityService.class));

    assertThat(service.currentStatus().environment()).isEqualTo("test");
    assertThat(service.currentStatus().status()).isEqualTo("ok");
  }
}
