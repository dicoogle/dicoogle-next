package org.dicoogle.sdk.query;

import org.dicoogle.sdk.storage.DimseAssociationAcceptedEvent;
import org.dicoogle.sdk.storage.DimseAssociationClosedEvent;
import org.dicoogle.sdk.storage.DimseAssociationFailedEvent;
import org.dicoogle.sdk.storage.DimseAssociationRejectedEvent;

public interface DimseAssociationEventListener extends QueryIndexPlugin {

  default void onAssociationAccepted(DimseAssociationAcceptedEvent event) {}

  default void onAssociationRejected(DimseAssociationRejectedEvent event) {}

  default void onAssociationFailed(DimseAssociationFailedEvent event) {}

  default void onAssociationClosed(DimseAssociationClosedEvent event) {}
}
