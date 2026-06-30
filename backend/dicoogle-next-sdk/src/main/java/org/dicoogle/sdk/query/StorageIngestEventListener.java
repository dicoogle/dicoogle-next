package org.dicoogle.sdk.query;

import org.dicoogle.sdk.storage.StorageIngestFailureEvent;
import org.dicoogle.sdk.storage.StorageIngestSuccessEvent;

/**
 * The <em>indexing</em> side of the query/index plugin split.
 *
 * <p>Implementations are notified asynchronously after each C-STORE (or equivalent) operation
 * completes. A successful ingest delivers a {@link StorageIngestSuccessEvent} containing the stored
 * instance's DICOM hierarchy identifiers and its storage {@link java.net.URI}, which is sufficient
 * for an index plugin to record the mapping without having to re-read the file.
 *
 * <p>Both methods have empty default implementations so that plugins that only care about one
 * outcome (e.g. only successes) do not need to override the other.
 *
 * <p>Implementations should be non-blocking. Long-running indexing work should be dispatched to a
 * background thread or executor rather than performed inline in these callbacks.
 */
public interface StorageIngestEventListener extends QueryIndexPlugin {

  /**
   * Called after an instance has been successfully stored.
   *
   * @param event details of the stored instance, including its location URI and DICOM identifiers
   */
  default void onIngestSuccess(StorageIngestSuccessEvent event) {}

  /**
   * Called when an attempt to store an instance has failed.
   *
   * @param event details of the failure, including the association context
   */
  default void onIngestFailure(StorageIngestFailureEvent event) {}
}
