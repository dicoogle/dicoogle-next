package pt.ua.dicooglenext.sdk.service;

import pt.ua.dicooglenext.sdk.storage.StorageRetrieveFailureEvent;
import pt.ua.dicooglenext.sdk.storage.StorageRetrieveSuccessEvent;

public interface StorageRetrieveEventListener extends ServicePlugin {

  default void onRetrieveSuccess(StorageRetrieveSuccessEvent event) {}

  default void onRetrieveFailure(StorageRetrieveFailureEvent event) {}
}
