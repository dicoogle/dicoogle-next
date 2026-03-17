package pt.ua.dicooglenext.sdk.storage;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import pt.ua.dicooglenext.sdk.DicooglePlugin;

public interface StoragePlugin extends DicooglePlugin {

  String scheme();

  boolean canRead();

  boolean canWrite();

  InputStream openForRead(URI location) throws IOException;

  default StoredObject store(InputStream data, String contentType) throws IOException {
    throw new UnsupportedOperationException("Storage plugin is read-only");
  }
}
