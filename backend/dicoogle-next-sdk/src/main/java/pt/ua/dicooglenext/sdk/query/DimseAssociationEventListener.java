package pt.ua.dicooglenext.sdk.query;

import pt.ua.dicooglenext.sdk.storage.DimseAssociationAcceptedEvent;
import pt.ua.dicooglenext.sdk.storage.DimseAssociationClosedEvent;
import pt.ua.dicooglenext.sdk.storage.DimseAssociationFailedEvent;
import pt.ua.dicooglenext.sdk.storage.DimseAssociationRejectedEvent;

public interface DimseAssociationEventListener extends QueryIndexPlugin {

  default void onAssociationAccepted(DimseAssociationAcceptedEvent event) {}

  default void onAssociationRejected(DimseAssociationRejectedEvent event) {}

  default void onAssociationFailed(DimseAssociationFailedEvent event) {}

  default void onAssociationClosed(DimseAssociationClosedEvent event) {}
}
