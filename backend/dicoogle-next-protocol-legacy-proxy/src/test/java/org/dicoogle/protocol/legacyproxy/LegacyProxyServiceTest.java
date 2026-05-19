package org.dicoogle.protocol.legacyproxy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.time.Duration;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import org.dicoogle.protocol.legacyproxy.config.LegacyProxyProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.reactive.function.client.WebClient;

class LegacyProxyServiceTest {

  private MockWebServer mockServer;
  private LegacyProxyService proxyService;
  private LegacyProxyAuthService authService;

  @BeforeEach
  void setUp() throws Exception {
    mockServer = new MockWebServer();
    mockServer.start();

    LegacyProxyProperties properties = new LegacyProxyProperties();
    properties.setBaseUrl(mockServer.url("/").toString());
    properties.setTimeout(Duration.ofSeconds(5));

    WebClient webClient = WebClient.builder().baseUrl(mockServer.url("/").toString()).build();

    authService = mock(LegacyProxyAuthService.class);
    when(authService.getToken()).thenReturn("test-token");

    proxyService = new LegacyProxyService(webClient, authService, properties);
  }

  @AfterEach
  void tearDown() throws Exception {
    mockServer.shutdown();
  }

  @Test
  void forward_sendsRequestToLegacyDicoogle() throws InterruptedException {
    mockServer.enqueue(
        new MockResponse()
            .setBody("{\"result\":\"ok\"}")
            .addHeader("Content-Type", "application/json")
            .setResponseCode(200));

    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/DICOMWeb/Studies");
    request.setQueryString("PatientName=FELIX");

    ResponseEntity<byte[]> response = proxyService.forward(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

    RecordedRequest recorded = mockServer.takeRequest();
    assertThat(recorded.getPath()).isEqualTo("/DICOMWeb/Studies?PatientName=FELIX");
    assertThat(recorded.getHeader("Authorization")).isEqualTo("Bearer test-token");
  }

  @Test
  void forward_stripsHopByHopHeaders() throws InterruptedException {
    mockServer.enqueue(new MockResponse().setResponseCode(200));

    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/some/path");
    request.addHeader("Connection", "keep-alive");
    request.addHeader("Transfer-Encoding", "chunked");
    request.addHeader("X-Custom-Header", "should-pass");

    proxyService.forward(request);

    RecordedRequest recorded = mockServer.takeRequest();
    assertThat(recorded.getHeader("Connection")).isNull();
    assertThat(recorded.getHeader("Transfer-Encoding")).isNull();
    assertThat(recorded.getHeader("X-Custom-Header")).isEqualTo("should-pass");
  }

  @Test
  void forward_retriesOnce_whenLegacyReturns401() throws InterruptedException {
    mockServer.enqueue(new MockResponse().setResponseCode(401));
    mockServer.enqueue(
        new MockResponse()
            .setBody("{\"result\":\"ok\"}")
            .addHeader("Content-Type", "application/json")
            .setResponseCode(200));

    when(authService.refreshToken()).thenReturn("refreshed-token");

    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/some/path");

    ResponseEntity<byte[]> response = proxyService.forward(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(authService, times(1)).refreshToken();

    // First request with old token, second with refreshed token
    mockServer.takeRequest();
    RecordedRequest retryRequest = mockServer.takeRequest();
    assertThat(retryRequest.getHeader("Authorization")).isEqualTo("Bearer refreshed-token");
  }

  @Test
  void forward_returnsBadGateway_whenLegacyIsUnreachable() {
    // No response enqueued — server will refuse connection after shutdown
    try {
      mockServer.shutdown();
    } catch (Exception ignored) {
    }

    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/some/path");
    ResponseEntity<byte[]> response = proxyService.forward(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
  }
}
