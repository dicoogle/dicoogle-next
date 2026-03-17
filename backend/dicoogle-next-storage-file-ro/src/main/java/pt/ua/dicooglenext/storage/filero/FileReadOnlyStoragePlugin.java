package pt.ua.dicooglenext.storage.filero;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import pt.ua.dicooglenext.sdk.PluginMetadata;
import pt.ua.dicooglenext.sdk.storage.StoragePlugin;

public class FileReadOnlyStoragePlugin implements StoragePlugin {

  private static final PluginMetadata METADATA =
      new PluginMetadata("storage-file-ro", "Filesystem Read-Only Storage", "0.1.0", "storage");

  @Override
  public PluginMetadata metadata() {
    return METADATA;
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
  public InputStream openForRead(URI location) throws IOException {
    Path path = Path.of(location);
    return Files.newInputStream(path);
  }
}
