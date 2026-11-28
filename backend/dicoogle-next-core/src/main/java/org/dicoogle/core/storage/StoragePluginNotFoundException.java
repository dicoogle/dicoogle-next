package org.dicoogle.core.storage;

import org.dicoogle.core.PluginNotFoundException;

/** An exception for when no storage plugins for the requested scheme are available. */
public class StoragePluginNotFoundException extends PluginNotFoundException {

  public StoragePluginNotFoundException(String scheme) {
    super("No storage plugin available for scheme '%s'".formatted(scheme));
  }
}
