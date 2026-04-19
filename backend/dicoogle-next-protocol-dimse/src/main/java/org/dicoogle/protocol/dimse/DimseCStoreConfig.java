package org.dicoogle.protocol.dimse;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.List;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.query.DimseAssociationAccessPolicy;
import org.dicoogle.sdk.query.DimseAssociationEventListener;
import org.dicoogle.sdk.query.DimseFindAccessPolicy;
import org.dicoogle.sdk.query.DimseMoveAccessPolicy;
import org.dicoogle.sdk.query.StorageIngestEventListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({
  DimseCStoreProperties.class,
  DimseCFindProperties.class,
  DimseCMoveProperties.class
})
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
      List<DimseFindAccessPolicy> cfindAccessPolicies,
      DimseCFindProperties properties,
      MeterRegistry meterRegistry) {
    return new CFindService(queryPlugins, cfindAccessPolicies, properties, meterRegistry);
  }

  @Bean
  CMoveService cMoveService(
      List<org.dicoogle.sdk.query.DimseMoveServicePlugin> movePlugins,
      List<DimseMoveAccessPolicy> cmoveAccessPolicies,
      DimseCFindProperties cfindProperties,
      DimseCMoveProperties properties,
      MeterRegistry meterRegistry) {
    return new CMoveService(
        movePlugins, cmoveAccessPolicies, cfindProperties, properties, meterRegistry);
  }

  @Bean
  @ConditionalOnProperty(prefix = "app.dimse.cstore", name = "enabled", havingValue = "true")
  DimseCStoreServer dimseCStoreServer(
      CStoreService cStoreService,
      CFindService cFindService,
      CMoveService cMoveService,
      StorageRouter storageRouter,
      DimseCStoreProperties properties,
      List<DimseAssociationEventListener> associationEventListeners,
      List<DimseAssociationAccessPolicy> associationAccessPolicies,
      @org.springframework.beans.factory.annotation.Qualifier("primaryStorageScheme")
          String primaryStorageScheme) {
    return new DimseCStoreServer(
        cStoreService,
        cFindService,
        cMoveService,
        storageRouter,
        properties,
        primaryStorageScheme,
        associationEventListeners,
        associationAccessPolicies);
  }
}
