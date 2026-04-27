package org.dicoogle.sdk.storage;

import java.io.IOException;
import java.io.InputStream;

public interface WritableStoragePlugin extends StoragePlugin {

  StoredObject store(InputStream data, String contentType) throws IOException;
}
