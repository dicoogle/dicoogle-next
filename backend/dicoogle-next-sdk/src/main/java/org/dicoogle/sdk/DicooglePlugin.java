package org.dicoogle.sdk;

/**
 * Root interface for all Dicoogle plugins.
 *
 * <p>Every plugin must implement this interface (usually indirectly, through a more specific
 * sub-interface such as {@link org.dicoogle.sdk.storage.StoragePlugin} or
 * {@link org.dicoogle.sdk.query.QueryIndexPlugin}). The framework discovers plugins on the
 * classpath and calls {@link #start()} once when the plugin is activated and {@link #stop()} when
 * it is deactivated or the application shuts down.
 *
 * <p>Both lifecycle methods have empty default implementations; override only the ones your plugin
 * needs.
 */
public interface DicooglePlugin {

  /**
   * Returns the static metadata describing this plugin.
   *
   * <p>The returned object must be non-null and stable — the same instance (or an equal one) must
   * be returned on every call.
   *
   * @return the plugin's metadata; never {@code null}
   */
  PluginMetadata metadata();

  /**
   * Called by the framework after the plugin has been loaded and before it is used.
   *
   * <p>Implementations may open resources, start background threads, or perform any other
   * initialisation that must happen before the plugin handles its first request. If initialisation
   * fails, implementations should throw an unchecked exception to prevent the plugin from being
   * registered.
   */
  default void start() {}

  /**
   * Called by the framework when the plugin is being deactivated or the application is shutting
   * down.
   *
   * <p>Implementations should release any resources acquired in {@link #start()} — close file
   * handles, stop threads, flush buffers, etc. After this method returns the plugin will not
   * receive any further requests.
   */
  default void stop() {}
}
