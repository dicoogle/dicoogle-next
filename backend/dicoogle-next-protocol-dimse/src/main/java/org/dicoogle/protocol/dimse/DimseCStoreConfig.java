package org.dicoogle.protocol.dimse;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.List;
import org.dicoogle.core.query.QueryRouter;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.protocol.legacyproxy.LegacyProxyService;
import org.dicoogle.protocol.legacyproxy.config.LegacyProxyProperties;
import org.dicoogle.sdk.query.DimseAccessPolicy;
import org.dicoogle.sdk.query.DimseAssociationEventListener;
import org.dicoogle.sdk.query.QueryMoveService;
import org.dicoogle.sdk.query.QueryService;
import org.dicoogle.sdk.query.StorageIngestEventListener;
import org.dicoogle.sdk.storage.DimseAssociationAcceptedEvent;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({
  DimseCStoreProperties.class,
  DimseCFindProperties.class,
  DimseCMoveProperties.class,
  DimseProperties.class,
  DimseQueryRetrieveProperties.class
})
public class DimseCStoreConfig {

  @Bean
  CStoreService cStoreService(
      StorageRouter storageRouter,
      List<StorageIngestEventListener> storageIngestEventListeners,
      MeterRegistry meterRegistry,
      @Autowired(required = false) LegacyProxyService legacyProxyService,
      @Autowired(required = false) LegacyProxyProperties legacyProxyProperties) {
    return new CStoreService(
        storageRouter,
        storageIngestEventListeners,
        meterRegistry,
        legacyProxyService,
        legacyProxyProperties);
  }

  @Bean
  CFindService cFindService(
      QueryRouter queryRouter,
      List<DimseAccessPolicy<QueryService.QueryRequest>> cfindAccessPolicies,
      DimseCFindProperties cfindProperties,
      DimseProperties dimseProperties,
      MeterRegistry meterRegistry,
      @Autowired(required = false) LegacyProxyService legacyProxyService,
      @Autowired(required = false) LegacyProxyProperties legacyProxyProperties) {
    return new CFindService(
        queryRouter,
        cfindAccessPolicies,
        cfindProperties,
        dimseProperties,
        meterRegistry,
        legacyProxyService,
        legacyProxyProperties);
  }

  @Bean
  CMoveService cMoveService(
      QueryRouter queryRouter,
      List<DimseAccessPolicy<QueryMoveService.MoveRequest>> cmoveAccessPolicies,
      DimseCFindProperties cfindProperties,
      DimseCMoveProperties cmoveProperties,
      DimseProperties dimseProperties,
      MeterRegistry meterRegistry,
      @Autowired(required = false) LegacyProxyService legacyProxyService,
      @Autowired(required = false) LegacyProxyProperties legacyProxyProperties) {
    return new CMoveService(
        queryRouter,
        cmoveAccessPolicies,
        cfindProperties,
        cmoveProperties,
        dimseProperties,
        meterRegistry,
        legacyProxyService,
        legacyProxyProperties);
  }

  @Bean
  DimseCStoreServer dimseCStoreServer(
      CStoreService cStoreService,
      StorageRouter storageRouter,
      DimseCStoreProperties properties,
      List<DimseAssociationEventListener> associationEventListeners,
      List<DimseAccessPolicy<DimseAssociationAcceptedEvent>> associationAccessPolicies,
      @org.springframework.beans.factory.annotation.Qualifier("primaryStorageScheme")
          String primaryStorageScheme,
      @Autowired(required = false) LegacyProxyService legacyProxyService) {
    return new DimseCStoreServer(
        cStoreService,
        storageRouter,
        properties,
        primaryStorageScheme,
        associationEventListeners,
        associationAccessPolicies,
        legacyProxyService);
  }

  @Bean
  DimseQueryRetrieveServer dimseQueryRetrieveServer(
      CFindService cFindService,
      CMoveService cMoveService,
      StorageRouter storageRouter,
      DimseQueryRetrieveProperties qrProperties,
      DimseCStoreProperties cStoreProperties,
      @Autowired(required = false) LegacyProxyService legacyProxyService) {
    return new DimseQueryRetrieveServer(
        cFindService,
        cMoveService,
        storageRouter,
        qrProperties,
        cStoreProperties,
        legacyProxyService);
  }
}
