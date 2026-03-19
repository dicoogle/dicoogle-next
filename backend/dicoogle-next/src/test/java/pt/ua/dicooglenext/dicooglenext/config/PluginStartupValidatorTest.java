package pt.ua.dicooglenext.dicooglenext.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.InputStream;
import java.net.URI;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import pt.ua.dicooglenext.sdk.PluginMetadata;
import pt.ua.dicooglenext.sdk.storage.StoragePlugin;

class PluginStartupValidatorTest {

  @Test
  void throwsWhenWritableProviderIsRequiredButMissing() {
    PluginRuntimeProperties properties = new PluginRuntimeProperties();
    properties.getStartupValidation().setRequireWritableProvider(true);
    properties.getStartupValidation().setWritableScheme("file");

    PluginStartupValidator validator =
        new PluginStartupValidator(List.of(new ReadOnlyStoragePlugin()), properties);

    assertThrows(
        IllegalStateException.class,
        () -> validator.run(new DefaultApplicationArguments(new String[0])));
  }

  @Test
  void doesNotThrowWhenWritableProviderExists() {
    PluginRuntimeProperties properties = new PluginRuntimeProperties();
    properties.getStartupValidation().setRequireWritableProvider(true);
    properties.getStartupValidation().setWritableScheme("file");

    PluginStartupValidator validator =
        new PluginStartupValidator(List.of(new WritableStoragePlugin()), properties);

    assertDoesNotThrow(() -> validator.run(new DefaultApplicationArguments(new String[0])));
  }

  private static class ReadOnlyStoragePlugin implements StoragePlugin {

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("ro", "ro", "1", "storage");
    }

    @Override
    public String scheme() {
      return "file";
    }

    @Override
    public boolean canRead() {
      return true;
    }

    @Override
    public boolean canWrite() {
      return false;
    }

    @Override
    public InputStream openForRead(URI location) {
      throw new UnsupportedOperationException();
    }
  }

  private static final class WritableStoragePlugin extends ReadOnlyStoragePlugin {

    @Override
    public boolean canWrite() {
      return true;
    }
  }
}
