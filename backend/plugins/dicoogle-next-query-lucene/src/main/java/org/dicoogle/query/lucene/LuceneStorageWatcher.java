package org.dicoogle.query.lucene;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.FileVisitor;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardWatchEventKinds;
import java.nio.file.WatchEvent;
import java.nio.file.WatchKey;
import java.nio.file.WatchService;
import java.nio.file.attribute.BasicFileAttributes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

final class LuceneStorageWatcher {

  private static final Logger LOGGER = LoggerFactory.getLogger(LuceneStorageWatcher.class);

  private final Path root;
  private final LuceneQueryIndexPlugin index;
  private final boolean enabled;
  private Thread worker;
  private WatchService watchService;
  private volatile boolean running;

  LuceneStorageWatcher(Path root, LuceneQueryIndexPlugin index, boolean enabled) {
    this.root = root;
    this.index = index;
    this.enabled = enabled;
  }

  void start() {
    if (!enabled || running) {
      return;
    }
    try {
      Files.createDirectories(root);
      watchService = root.getFileSystem().newWatchService();
      registerTree(root);
    } catch (IOException ex) {
      LOGGER.warn("Cannot start lucene watcher: {}", ex.getMessage());
      return;
    }

    running = true;
    worker = new Thread(this::watchLoop, "lucene-storage-watcher");
    worker.setDaemon(true);
    worker.start();
    LOGGER.info("Lucene storage watcher started at {}", root);
  }

  void stop() {
    running = false;
    if (worker != null) {
      worker.interrupt();
      worker = null;
    }
    if (watchService != null) {
      try {
        watchService.close();
      } catch (IOException ex) {
        LOGGER.debug("Failed to close watcher", ex);
      }
      watchService = null;
    }
  }

  private void watchLoop() {
    while (running) {
      WatchKey key;
      try {
        key = watchService.take();
      } catch (InterruptedException ex) {
        Thread.currentThread().interrupt();
        return;
      } catch (Exception ex) {
        LOGGER.debug("Watcher loop interrupted", ex);
        return;
      }

      Path watchedDir = (Path) key.watchable();
      for (WatchEvent<?> event : key.pollEvents()) {
        WatchEvent.Kind<?> kind = event.kind();
        if (kind == StandardWatchEventKinds.OVERFLOW) {
          continue;
        }

        Path relative = (Path) event.context();
        Path affected = watchedDir.resolve(relative).toAbsolutePath().normalize();

        if (kind == StandardWatchEventKinds.ENTRY_CREATE) {
          handleCreate(affected);
        } else if (kind == StandardWatchEventKinds.ENTRY_MODIFY) {
          handleModify(affected);
        } else if (kind == StandardWatchEventKinds.ENTRY_DELETE) {
          handleDelete(affected);
        }
      }

      if (!key.reset()) {
        LOGGER.debug("Watcher key no longer valid for {}", watchedDir);
      }
    }
  }

  private void handleCreate(Path path) {
    try {
      if (Files.isDirectory(path)) {
        registerTree(path);
        return;
      }
      if (index.isIndexablePath(path)) {
        index.indexPath(path);
      }
    } catch (Exception ex) {
      LOGGER.debug("Failed to index created file {}", path, ex);
    }
  }

  private void handleModify(Path path) {
    try {
      if (Files.isRegularFile(path) && index.isIndexablePath(path)) {
        index.indexPath(path);
      }
    } catch (Exception ex) {
      LOGGER.debug("Failed to index modified file {}", path, ex);
    }
  }

  private void handleDelete(Path path) {
    try {
      if (isLikelyDicomName(path)) {
        index.removePath(path);
      }
    } catch (Exception ex) {
      LOGGER.debug("Failed to remove deleted file {} from index", path, ex);
    }
  }

  private void registerTree(Path rootPath) throws IOException {
    Files.walkFileTree(
        rootPath,
        new FileVisitor<>() {
          @Override
          public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs)
              throws IOException {
            dir.register(
                watchService,
                StandardWatchEventKinds.ENTRY_CREATE,
                StandardWatchEventKinds.ENTRY_MODIFY,
                StandardWatchEventKinds.ENTRY_DELETE);
            return FileVisitResult.CONTINUE;
          }

          @Override
          public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
            return FileVisitResult.CONTINUE;
          }

          @Override
          public FileVisitResult visitFileFailed(Path file, IOException exc) {
            return FileVisitResult.CONTINUE;
          }

          @Override
          public FileVisitResult postVisitDirectory(Path dir, IOException exc) {
            return FileVisitResult.CONTINUE;
          }
        });
  }

  private boolean isLikelyDicomName(Path path) {
    String name = path.getFileName() == null ? "" : path.getFileName().toString();
    return name.toLowerCase().endsWith(".dcm");
  }
}
