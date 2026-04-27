package org.dicoogle.sdk.service;

import org.dicoogle.sdk.storage.StorageRetrieveFailureEvent;
import org.dicoogle.sdk.storage.StorageRetrieveSuccessEvent;

public interface StorageRetrieveEventListener extends ServicePlugin {

  default void onRetrieveSuccess(StorageRetrieveSuccessEvent event) {}

  default void onRetrieveFailure(StorageRetrieveFailureEvent event) {}
}
