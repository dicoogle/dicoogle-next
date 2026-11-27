package org.dicoogle.core.storage;

import org.dicoogle.core.PluginNotFoundException;

/**
 * An exception for when at least one storage plugin for the requested scheme is available, but none
 * of them are writable.
 */
public class NoWritableStoragePluginException extends PluginNotFoundException {

  public NoWritableStoragePluginException(String scheme) {
    super("No writable storage plugin available for scheme '%s'".formatted(scheme));
  }
}
