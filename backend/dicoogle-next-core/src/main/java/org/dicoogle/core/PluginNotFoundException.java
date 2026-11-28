package org.dicoogle.core;

/**
 * An exception for when it is not possible to retrieve a Dicoogle plugin with the requested
 * criteria.
 *
 * <p>More specific exceptions exist depending on the kind of plugin requested.
 */
public class PluginNotFoundException extends RuntimeException {

  public PluginNotFoundException() {
    super("Could not retrieve a plugin with the requested criteria");
  }

  public PluginNotFoundException(String message) {
    super(message);
  }
}
