package org.dicoogle.core.storage;

public class StoragePluginNotFoundException extends RuntimeException {

  public StoragePluginNotFoundException(String scheme) {
    super("No storage plugin available for scheme '%s'".formatted(scheme));
  }
}
