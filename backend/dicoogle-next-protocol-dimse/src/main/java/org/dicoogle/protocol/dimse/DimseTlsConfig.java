package org.dicoogle.protocol.dimse;

import java.util.List;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.protocol.dimse.store.CStoreService;
import org.dicoogle.protocol.dimse.store.DimseCStoreProperties;
import org.dicoogle.protocol.dimse.store.DimseTlsCStoreProperties;
import org.dicoogle.protocol.dimse.store.DimseTlsCStoreServer;
import org.dicoogle.sdk.query.DimseAccessPolicy;
import org.dicoogle.sdk.query.DimseAssociationEventListener;
import org.dicoogle.sdk.storage.DimseAssociationAcceptedEvent;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({
  DimseCStoreProperties.class,
  DimseProperties.class,
  DimseTlsProperties.class,
  DimseTlsCStoreProperties.class
})
public class DimseTlsConfig {

  @Bean
  DimseTlsCStoreServer dimseTlsCStoreServer(
      CStoreService cStoreService,
      StorageRouter storageRouter,
      DimseTlsProperties tlsProperties,
      DimseCStoreProperties cstoreProperties,
      DimseTlsCStoreProperties tlsCstoreProperties,
      List<DimseAssociationEventListener> associationEventListeners,
      List<DimseAccessPolicy<DimseAssociationAcceptedEvent>> associationAccessPolicies,
      @org.springframework.beans.factory.annotation.Qualifier("primaryStorageScheme")
          String primaryStorageScheme) {
    return new DimseTlsCStoreServer(
        cStoreService,
        tlsProperties,
        cstoreProperties,
        tlsCstoreProperties,
        primaryStorageScheme,
        associationEventListeners,
        associationAccessPolicies);
  }
}
