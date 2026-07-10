package org.dicoogle.app.config;

import java.io.IOException;
import java.net.URI;
import java.nio.file.FileVisitResult;
import java.nio.file.FileVisitor;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardWatchEventKinds;
import java.nio.file.WatchEvent;
import java.nio.file.WatchKey;
import java.nio.file.WatchService;
import java.nio.file.attribute.BasicFileAttributes;
import org.dicoogle.app.service.QueryIndexMaintenanceService;
import org.dicoogle.sdk.query.QueryIndexMaintenance;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;

class StorageWatcherService implements SmartLifecycle {

  private static final Logger LOGGER = LoggerFactory.getLogger(StorageWatcherService.class);

  private final Path root;
  private final QueryIndexMaintenanceService indexService;
  private Thread worker;
  private WatchService watchService;
  private volatile boolean running;

  StorageWatcherService(Path root, QueryIndexMaintenanceService indexService) {
    this.root = root;
    this.indexService = indexService;
  }

  @Override
  public synchronized void start() {
    if (running || !indexService.hasIndexes()) {
      return;
    }
    try {
      Files.createDirectories(root);
      watchService = root.getFileSystem().newWatchService();
      registerTree(root);
    } catch (IOException ex) {
      LOGGER.warn("Cannot start storage watcher: {}", ex.getMessage());
      return;
    }

    running = true;
    worker = new Thread(this::watchLoop, "storage-watcher");
    worker.setDaemon(true);
    worker.start();
    LOGGER.info("Storage watcher started at {}", root);
  }

  @Override
  public synchronized void stop() {
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

  @Override
  public boolean isRunning() {
    return running;
  }

  @Override
  public int getPhase() {
    return 0;
  }

  @Override
  public boolean isAutoStartup() {
    return true;
  }

  private void watchLoop() {
    LOGGER.info("Watcher loop started, waiting for events on {}", root);
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
      java.util.List<WatchEvent<?>> events = key.pollEvents();
      LOGGER.debug("Watcher got {} events for {}", events.size(), watchedDir);
      for (WatchEvent<?> event : events) {
        WatchEvent.Kind<?> kind = event.kind();
        if (kind == StandardWatchEventKinds.OVERFLOW) {
          continue;
        }

        Path relative = (Path) event.context();
        Path affected = watchedDir.resolve(relative).toAbsolutePath().normalize();

        LOGGER.debug("Watcher event: {} -> {}", kind, affected);

        if (kind == StandardWatchEventKinds.ENTRY_CREATE) {
          handleCreate(affected);
        } else if (kind == StandardWatchEventKinds.ENTRY_MODIFY) {
          handleModify(affected);
        } else if (kind == StandardWatchEventKinds.ENTRY_DELETE) {
          handleDelete(affected);
        }
      }

      if (!key.reset()) {
        LOGGER.warn("Watcher key no longer valid for {}", watchedDir);
      }
    }
  }

  private void handleCreate(Path path) {
    try {
      if (Files.isDirectory(path)) {
        registerTree(path);
        return;
      }
      if (Files.isRegularFile(path)) {
        dispatchIndex(path.toUri());
      }
    } catch (Exception ex) {
      LOGGER.debug("Failed to index created file {}", path, ex);
    }
  }

  private void handleModify(Path path) {
    try {
      if (Files.isRegularFile(path)) {
        dispatchIndex(path.toUri());
      }
    } catch (Exception ex) {
      LOGGER.debug("Failed to index modified file {}", path, ex);
    }
  }

  private void handleDelete(Path path) {
    try {
      if (isLikelyDicomName(path)) {
        dispatchUnindex(path.toUri());
      }
    } catch (Exception ex) {
      LOGGER.debug("Failed to remove deleted file {} from index", path, ex);
    }
  }

  private void dispatchIndex(URI uri) {
    LOGGER.debug("Dispatching index for {}", uri);
    for (QueryIndexMaintenance plugin : indexService.getAllPlugins()) {
      try {
        int indexed = plugin.indexPath(uri);
        LOGGER.debug("Plugin {} indexed {} documents for {}", plugin.indexId(), indexed, uri);
      } catch (Exception ex) {
        LOGGER.warn("Plugin {} failed to index {}", plugin.indexId(), uri, ex);
      }
    }
  }

  private void dispatchUnindex(URI uri) {
    LOGGER.debug("Dispatching unindex for {}", uri);
    for (QueryIndexMaintenance plugin : indexService.getAllPlugins()) {
      try {
        int removed = plugin.unindexPath(uri);
        LOGGER.debug("Plugin {} unindexed {} documents for {}", plugin.indexId(), removed, uri);
      } catch (Exception ex) {
        LOGGER.warn("Plugin {} failed to unindex {}", plugin.indexId(), uri, ex);
      }
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
            LOGGER.debug("Registered watcher for directory: {}", dir);
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
