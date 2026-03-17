package pt.ua.dicooglenext.sdk;

public interface DicooglePlugin {

  PluginMetadata metadata();

  default void start() {}

  default void stop() {}
}
