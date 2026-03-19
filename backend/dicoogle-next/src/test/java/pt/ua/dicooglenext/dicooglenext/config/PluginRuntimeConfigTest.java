package pt.ua.dicooglenext.dicooglenext.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.InputStream;
import java.net.URI;
import java.util.List;
import org.junit.jupiter.api.Test;
import pt.ua.dicooglenext.sdk.PluginMetadata;
import pt.ua.dicooglenext.sdk.storage.StoragePlugin;

class PluginRuntimeConfigTest {

  private final PluginRuntimeConfig config = new PluginRuntimeConfig();

  @Test
  void filtersByEnabledSchemes() {
    PluginRuntimeProperties properties = new PluginRuntimeProperties();
    properties.getStorage().setEnabledSchemes(List.of("s3"));

    ActiveStoragePlugins active =
        config.activeStoragePlugins(
            List.of(new SimpleStoragePlugin("file"), new SimpleStoragePlugin("s3")), properties);

    assertEquals(1, active.plugins().size());
    assertEquals("s3", active.plugins().getFirst().scheme());
  }

  @Test
  void throwsWhenFilteringRemovesAllPlugins() {
    PluginRuntimeProperties properties = new PluginRuntimeProperties();
    properties.getStorage().setDisabledSchemes(List.of("file"));

    assertThrows(
        IllegalStateException.class,
        () -> config.activeStoragePlugins(List.of(new SimpleStoragePlugin("file")), properties));
  }

  @Test
  void exposesConfiguredPrimaryScheme() {
    PluginRuntimeProperties properties = new PluginRuntimeProperties();
    properties.getStorage().setPrimaryScheme("s3");

    assertEquals("s3", config.primaryStorageScheme(properties));
  }

  private static final class SimpleStoragePlugin implements StoragePlugin {

    private final String scheme;

    private SimpleStoragePlugin(String scheme) {
      this.scheme = scheme;
    }

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("id-" + scheme, "plugin-" + scheme, "1", "storage");
    }

    @Override
    public String scheme() {
      return scheme;
    }

    @Override
    public boolean canRead() {
      return true;
    }

    @Override
    public boolean canWrite() {
      return true;
    }

    @Override
    public InputStream openForRead(URI location) {
      throw new UnsupportedOperationException();
    }
  }
}
