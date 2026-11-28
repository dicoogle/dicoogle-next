package org.dicoogle.core.storage;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.util.List;
import org.dicoogle.sdk.PluginMetadata;
import org.dicoogle.sdk.storage.DeletableStoragePlugin;
import org.dicoogle.sdk.storage.StoragePlugin;
import org.junit.jupiter.api.Test;

class StorageRouterTest {

  private static final PluginMetadata META =
      new PluginMetadata("storage-test", "Test Storage", "0.1.0", "storage");

  @Test
  void findsDeletablePluginByScheme() {
    DeletableStoragePlugin blob = deletable("azblob");
    StorageRouter router = new StorageRouter(List.of(plain("file"), blob));

    assertSame(blob, router.findDeletable("AZBLOB").orElseThrow());
  }

  @Test
  void pluginThatCannotDeleteIsNotReturned() {
    StorageRouter router = new StorageRouter(List.of(plain("file"), deletable("azblob")));

    assertTrue(router.findDeletable("file").isEmpty());
    assertTrue(router.findDeletable("s3").isEmpty());
  }

  private static StoragePlugin plain(String scheme) {
    return new StoragePlugin() {
      @Override
      public PluginMetadata metadata() {
        return META;
      }

      @Override
      public String scheme() {
        return scheme;
      }
    };
  }

  private static DeletableStoragePlugin deletable(String scheme) {
    return new DeletableStoragePlugin() {
      @Override
      public PluginMetadata metadata() {
        return META;
      }

      @Override
      public String scheme() {
        return scheme;
      }

      @Override
      public int delete(URI location) {
        return 1;
      }
    };
  }
}
