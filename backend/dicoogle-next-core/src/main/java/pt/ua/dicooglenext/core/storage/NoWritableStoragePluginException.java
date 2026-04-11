package org.dicoogle.core.storage;

public class NoWritableStoragePluginException extends RuntimeException {

  public NoWritableStoragePluginException(String scheme) {
    super("No writable storage plugin available for scheme '%s'".formatted(scheme));
  }
}
