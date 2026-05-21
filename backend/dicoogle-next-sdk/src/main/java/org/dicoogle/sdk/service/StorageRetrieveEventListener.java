package org.dicoogle.sdk.service;

import org.dicoogle.sdk.storage.StorageRetrieveFailureEvent;
import org.dicoogle.sdk.storage.StorageRetrieveSuccessEvent;

/**
 * Receives callbacks for storage retrieval operations such as C-MOVE or WADO-RS transfers.
 *
 * <p>Implementations may use these events for audit logging, transfer metrics, or notifications.
 * Both callbacks have empty default implementations; override only the ones you need.
 */
public interface StorageRetrieveEventListener extends ServicePlugin {

  /**
   * Called after an instance has been successfully retrieved and streamed to the requester.
   *
   * @param event details of the retrieved instance and transfer; never {@code null}
   */
  default void onRetrieveSuccess(StorageRetrieveSuccessEvent event) {}

  /**
   * Called when a retrieval attempt fails.
   *
   * @param event details of the failure; never {@code null}
   */
  default void onRetrieveFailure(StorageRetrieveFailureEvent event) {}
}
