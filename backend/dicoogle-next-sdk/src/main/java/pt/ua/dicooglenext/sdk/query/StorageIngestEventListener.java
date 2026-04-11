package org.dicoogle.sdk.query;

import org.dicoogle.sdk.storage.StorageIngestFailureEvent;
import org.dicoogle.sdk.storage.StorageIngestSuccessEvent;

public interface StorageIngestEventListener extends QueryIndexPlugin {

  default void onIngestSuccess(StorageIngestSuccessEvent event) {}

  default void onIngestFailure(StorageIngestFailureEvent event) {}
}
