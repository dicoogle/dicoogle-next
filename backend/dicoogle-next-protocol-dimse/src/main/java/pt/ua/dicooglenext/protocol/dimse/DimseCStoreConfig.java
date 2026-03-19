package pt.ua.dicooglenext.protocol.dimse;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import pt.ua.dicooglenext.core.storage.StorageRouter;
import pt.ua.dicooglenext.sdk.query.StorageIngestEventListener;

@Configuration
@EnableConfigurationProperties(DimseCStoreProperties.class)
public class DimseCStoreConfig {

  @Bean
  CStoreService cStoreService(
      StorageRouter storageRouter,
      List<StorageIngestEventListener> storageIngestEventListeners,
      MeterRegistry meterRegistry) {
    return new CStoreService(storageRouter, storageIngestEventListeners, meterRegistry);
  }

  @Bean
  @ConditionalOnProperty(prefix = "app.dimse.cstore", name = "enabled", havingValue = "true")
  DimseCStoreServer dimseCStoreServer(
      CStoreService cStoreService,
      DimseCStoreProperties properties,
      @org.springframework.beans.factory.annotation.Qualifier("primaryStorageScheme")
          String primaryStorageScheme) {
    return new DimseCStoreServer(cStoreService, properties, primaryStorageScheme);
  }
}
