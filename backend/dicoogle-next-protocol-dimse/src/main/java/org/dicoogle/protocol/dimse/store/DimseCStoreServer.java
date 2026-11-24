package org.dicoogle.protocol.dimse.store;

import java.util.List;
import org.dicoogle.sdk.query.DimseAccessPolicy;
import org.dicoogle.sdk.query.DimseAssociationEventListener;
import org.dicoogle.sdk.storage.DimseAssociationAcceptedEvent;

/** DIMSE Store server (without TLS) */
public class DimseCStoreServer extends BaseDimseCStoreServer {

  public DimseCStoreServer(
      CStoreService cStoreService, DimseCStoreProperties properties, String primaryStorageScheme) {
    super(cStoreService, properties, primaryStorageScheme, List.of(), List.of());
  }

  public DimseCStoreServer(
      CStoreService cStoreService,
      DimseCStoreProperties properties,
      String primaryStorageScheme,
      List<DimseAssociationEventListener> associationEventListeners,
      List<DimseAccessPolicy<DimseAssociationAcceptedEvent>> associationAccessPolicies) {
    super(
        cStoreService,
        properties,
        primaryStorageScheme,
        associationEventListeners,
        associationAccessPolicies);
  }
}
