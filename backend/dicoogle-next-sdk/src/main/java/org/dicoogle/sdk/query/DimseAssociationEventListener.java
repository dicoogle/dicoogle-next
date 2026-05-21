package org.dicoogle.sdk.query;

import org.dicoogle.sdk.storage.DimseAssociationAcceptedEvent;
import org.dicoogle.sdk.storage.DimseAssociationClosedEvent;
import org.dicoogle.sdk.storage.DimseAssociationFailedEvent;
import org.dicoogle.sdk.storage.DimseAssociationRejectedEvent;

/**
 * Receives lifecycle notifications for incoming DIMSE associations.
 *
 * <p>Plugins that need to react to association events — for example to maintain connection
 * metrics, enforce per-AE quotas, or write audit logs — implement this interface. All four
 * callback methods have empty default implementations; override only the events you care about.
 *
 * <p>Callbacks are invoked on the association thread managed by the DIMSE server. Implementations
 * should be non-blocking; any long-running work should be dispatched to a background thread.
 *
 * <p>This interface extends {@link QueryIndexPlugin} so that it participates in the same plugin
 * registry as other query/index extensions, even though it has no indexing or query
 * responsibilities of its own.
 */
public interface DimseAssociationEventListener extends QueryIndexPlugin {

  /**
   * Called after an association has been successfully negotiated and accepted.
   *
   * @param event the accepted-association context; never {@code null}
   */
  default void onAssociationAccepted(DimseAssociationAcceptedEvent event) {}

  /**
   * Called when an association request was rejected by the server's access policy.
   *
   * @param event the rejection context including the reason; never {@code null}
   */
  default void onAssociationRejected(DimseAssociationRejectedEvent event) {}

  /**
   * Called when an association attempt failed due to a network or protocol error before it could
   * be accepted or rejected.
   *
   * @param event the failure context including the reason; never {@code null}
   */
  default void onAssociationFailed(DimseAssociationFailedEvent event) {}

  /**
   * Called after a previously accepted association has been released or aborted.
   *
   * @param event the closed-association context; never {@code null}
   */
  default void onAssociationClosed(DimseAssociationClosedEvent event) {}
}
