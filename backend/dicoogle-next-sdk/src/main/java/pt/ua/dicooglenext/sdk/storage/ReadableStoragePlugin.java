package pt.ua.dicooglenext.sdk.storage;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;

public interface ReadableStoragePlugin extends StoragePlugin {

  InputStream openForRead(URI location) throws IOException;
}
