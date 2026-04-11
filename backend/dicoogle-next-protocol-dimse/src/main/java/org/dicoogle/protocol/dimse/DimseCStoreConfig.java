package org.dicoogle.protocol.dimse;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.List;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.query.DimseAssociationAccessPolicy;
import org.dicoogle.sdk.query.DimseAssociationEventListener;
import org.dicoogle.sdk.query.StorageIngestEventListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({DimseCStoreProperties.class, DimseCFindProperties.class})
public class DimseCStoreConfig {

  @Bean
  CStoreService cStoreService(
      StorageRouter storageRouter,
      List<StorageIngestEventListener> storageIngestEventListeners,
      MeterRegistry meterRegistry) {
    return new CStoreService(storageRouter, storageIngestEventListeners, meterRegistry);
  }

  @Bean
  CFindService cFindService(
      List<org.dicoogle.sdk.query.DimseFindServicePlugin> queryPlugins,
      DimseCFindProperties properties) {
    return new CFindService(queryPlugins, properties);
  }

  @Bean
  @ConditionalOnProperty(prefix = "app.dimse.cstore", name = "enabled", havingValue = "true")
  DimseCStoreServer dimseCStoreServer(
      CStoreService cStoreService,
      CFindService cFindService,
      DimseCStoreProperties properties,
      DimseCFindProperties cfindProperties,
      List<DimseAssociationEventListener> associationEventListeners,
      List<DimseAssociationAccessPolicy> associationAccessPolicies,
      @org.springframework.beans.factory.annotation.Qualifier("primaryStorageScheme")
          String primaryStorageScheme) {
    return new DimseCStoreServer(
        cStoreService,
        cFindService,
        properties,
        cfindProperties,
        primaryStorageScheme,
        associationEventListeners,
        associationAccessPolicies);
  }
}
