package org.dicoogle.sdk;

public interface DicooglePlugin {

  PluginMetadata metadata();

  default void start() {}

  default void stop() {}
}
