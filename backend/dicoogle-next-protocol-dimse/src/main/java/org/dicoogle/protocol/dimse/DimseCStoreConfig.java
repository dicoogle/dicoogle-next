package org.dicoogle.protocol.dimse;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.List;
import org.dicoogle.core.query.QueryRouter;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.query.DimseAccessPolicy;
import org.dicoogle.sdk.query.DimseAssociationEventListener;
import org.dicoogle.sdk.query.QueryMoveService;
import org.dicoogle.sdk.query.QueryService;
import org.dicoogle.sdk.query.StorageIngestEventListener;
import org.dicoogle.sdk.storage.DimseAssociationAcceptedEvent;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({
  DimseCStoreProperties.class,
  DimseCFindProperties.class,
  DimseCMoveProperties.class,
  DimseProperties.class
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
      QueryRouter queryRouter,
      List<DimseAccessPolicy<QueryService.QueryRequest>> cfindAccessPolicies,
      DimseCFindProperties cfindProperties,
      DimseProperties dimseProperties,
      MeterRegistry meterRegistry) {
    return new CFindService(
        queryRouter, cfindAccessPolicies, cfindProperties, dimseProperties, meterRegistry);
  }

  @Bean
  CMoveService cMoveService(
      QueryRouter queryRouter,
      List<DimseAccessPolicy<QueryMoveService.MoveRequest>> cmoveAccessPolicies,
      DimseCFindProperties cfindProperties,
      DimseCMoveProperties cmoveProperties,
      DimseProperties dimseProperties,
      MeterRegistry meterRegistry) {
    return new CMoveService(
        queryRouter,
        cmoveAccessPolicies,
        cfindProperties,
        cmoveProperties,
        dimseProperties,
        meterRegistry);
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
      List<DimseAccessPolicy<DimseAssociationAcceptedEvent>> associationAccessPolicies,
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
