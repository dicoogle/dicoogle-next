package org.dicoogle.protocol.legacyproxy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import org.dicoogle.protocol.legacyproxy.config.LegacyProxyProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;

class LegacyProxyAuthServiceTest {

  private MockWebServer mockServer;
  private LegacyProxyAuthService authService;

  @BeforeEach
  void setUp() throws Exception {
    mockServer = new MockWebServer();
    mockServer.start();

    LegacyProxyProperties properties = new LegacyProxyProperties();
    properties.setBaseUrl(mockServer.url("/").toString());
    properties.setTimeout(Duration.ofSeconds(5));
    properties.getAuth().setUsername("admin");
    properties.getAuth().setPassword("admin");

    WebClient webClient = WebClient.builder().baseUrl(mockServer.url("/").toString()).build();
    authService = new LegacyProxyAuthService(webClient, properties);
  }

  @AfterEach
  void tearDown() throws Exception {
    mockServer.shutdown();
  }

  @Test
  void getToken_authenticatesOnFirstCall() throws InterruptedException {
    mockServer.enqueue(
        new MockResponse()
            .setBody("{\"token\":\"test-token-123\"}")
            .addHeader("Content-Type", "application/json"));

    String token = authService.getToken();

    assertThat(token).isEqualTo("test-token-123");
    RecordedRequest request = mockServer.takeRequest();
    assertThat(request.getPath()).isEqualTo("/login");
    assertThat(request.getMethod()).isEqualTo("POST");
  }

  @Test
  void getToken_returnsCachedTokenOnSubsequentCalls() {
    mockServer.enqueue(
        new MockResponse()
            .setBody("{\"token\":\"cached-token\"}")
            .addHeader("Content-Type", "application/json"));

    String first = authService.getToken();
    String second = authService.getToken();

    assertThat(first).isEqualTo(second).isEqualTo("cached-token");
    // Only one request should have been made to /login
    assertThat(mockServer.getRequestCount()).isEqualTo(1);
  }

  @Test
  void refreshToken_reauthenticates() throws InterruptedException {
    mockServer.enqueue(
        new MockResponse()
            .setBody("{\"token\":\"old-token\"}")
            .addHeader("Content-Type", "application/json"));
    mockServer.enqueue(
        new MockResponse()
            .setBody("{\"token\":\"new-token\"}")
            .addHeader("Content-Type", "application/json"));

    authService.getToken();
    String refreshed = authService.refreshToken();

    assertThat(refreshed).isEqualTo("new-token");
    assertThat(authService.getToken()).isEqualTo("new-token");
  }

  @Test
  void getToken_throwsWhenCredentialsNotConfigured() {
    LegacyProxyProperties properties = new LegacyProxyProperties();
    properties.setBaseUrl(mockServer.url("/").toString());
    properties.setTimeout(Duration.ofSeconds(5));
    // No username/password set

    WebClient webClient = WebClient.builder().baseUrl(mockServer.url("/").toString()).build();
    LegacyProxyAuthService service = new LegacyProxyAuthService(webClient, properties);

    assertThatThrownBy(service::getToken)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("credentials not configured");
  }
}
