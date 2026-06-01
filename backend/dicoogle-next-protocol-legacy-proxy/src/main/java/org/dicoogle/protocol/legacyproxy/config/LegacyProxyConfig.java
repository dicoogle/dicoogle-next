package org.dicoogle.protocol.legacyproxy.config;

import io.netty.channel.ChannelOption;
import java.time.Duration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

@Configuration
@EnableConfigurationProperties(LegacyProxyProperties.class)
@ConditionalOnProperty(
    prefix = "dicoogle.legacy-proxy",
    name = "enabled",
    havingValue = "true",
    matchIfMissing = true)
public class LegacyProxyConfig {

  private final LegacyProxyProperties properties;

  public LegacyProxyConfig(LegacyProxyProperties properties) {
    this.properties = properties;
  }

  @Bean
  public WebClient legacyDicoogleWebClient() {
    Duration timeout = properties.getTimeout();

    HttpClient httpClient =
        HttpClient.create()
            .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, (int) timeout.toMillis())
            .responseTimeout(timeout);

    return WebClient.builder()
        .baseUrl(properties.getBaseUrl())
        .clientConnector(new ReactorClientHttpConnector(httpClient))
        .build();
  }
}
