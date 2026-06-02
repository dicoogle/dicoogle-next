package org.dicoogle.app.service;

import java.net.URI;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.dicoogle.app.dto.IndexTaskDtos.TaskResult;
import org.dicoogle.app.dto.IndexTaskDtos.TaskResults;
import org.dicoogle.sdk.query.QueryIndexMaintenance;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class IndexTaskService {

  private static final Logger LOG = LoggerFactory.getLogger(IndexTaskService.class);

  private static final DateTimeFormatter ISO_FMT = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

  private final Map<String, TrackedTask> tasks = new ConcurrentHashMap<>();
  private final ExecutorService executor = Executors.newCachedThreadPool();

  public String submitReindex(QueryIndexMaintenance plugin) {
    String uid = UUID.randomUUID().toString();
    var task = new TrackedTask(uid, taskName(plugin.indexId(), "reindex"));
    tasks.put(uid, task);
    Callable<Integer> call =
        () -> {
          long start = System.currentTimeMillis();
          try {
            int n = plugin.reindex();
            task.elapsedTime = System.currentTimeMillis() - start;
            task.nIndexed = n;
            task.nErrors = 0;
            task.complete = true;
            task.progress = 1.0f;
            return n;
          } catch (Exception ex) {
            task.elapsedTime = System.currentTimeMillis() - start;
            task.nErrors = 1;
            task.complete = true;
            task.progress = 1.0f;
            LOG.warn("Reindex task {} failed: {}", uid, ex.getMessage());
            return 0;
          }
        };
    task.future = executor.submit(call);
    LOG.info("Submitted reindex task {} for plugin {}", uid, plugin.indexId());
    return uid;
  }

  public String submitReindexAll(List<QueryIndexMaintenance> plugins) {
    String uid = UUID.randomUUID().toString();
    var task = new TrackedTask(uid, taskName("all", "reindex"));
    task.total = plugins.size();
    tasks.put(uid, task);
    Callable<Integer> call =
        () -> {
          long start = System.currentTimeMillis();
          int indexed = 0;
          int errors = 0;
          for (int i = 0; i < plugins.size(); i++) {
            if (Thread.currentThread().isInterrupted()) {
              task.canceled = true;
              task.progress = plugins.size() > 0 ? (float) i / plugins.size() : 1.0f;
              task.elapsedTime = System.currentTimeMillis() - start;
              task.nIndexed = indexed;
              task.nErrors = errors;
              return indexed;
            }
            try {
              indexed += plugins.get(i).reindex();
            } catch (Exception ex) {
              errors++;
              LOG.warn(
                  "Reindex failed for plugin {}: {}", plugins.get(i).indexId(), ex.getMessage());
            }
            task.progress = (float) (i + 1) / plugins.size();
          }
          task.complete = true;
          task.progress = 1.0f;
          task.elapsedTime = System.currentTimeMillis() - start;
          task.nIndexed = indexed;
          task.nErrors = errors;
          return indexed;
        };
    task.future = executor.submit(call);
    LOG.info("Submitted reindex-all task {} for {} plugins", uid, plugins.size());
    return uid;
  }

  public String submitIndexPaths(QueryIndexMaintenance plugin, List<URI> uris) {
    String uid = UUID.randomUUID().toString();
    var task = new TrackedTask(uid, taskName(plugin.indexId(), "index"));
    task.total = uris.size();
    tasks.put(uid, task);
    Callable<Integer> call =
        () -> {
          long start = System.currentTimeMillis();
          int indexed = 0;
          int errors = 0;
          for (int i = 0; i < uris.size(); i++) {
            if (Thread.currentThread().isInterrupted()) {
              task.canceled = true;
              task.progress = uris.size() > 0 ? (float) i / uris.size() : 1.0f;
              task.elapsedTime = System.currentTimeMillis() - start;
              task.nIndexed = indexed;
              task.nErrors = errors;
              return indexed;
            }
            try {
              indexed += plugin.indexPath(uris.get(i));
            } catch (Exception ex) {
              errors++;
              LOG.warn("Index failed for {}: {}", uris.get(i), ex.getMessage());
            }
            task.progress = (float) (i + 1) / uris.size();
          }
          task.complete = true;
          task.progress = 1.0f;
          task.elapsedTime = System.currentTimeMillis() - start;
          task.nIndexed = indexed;
          task.nErrors = errors;
          return indexed;
        };
    task.future = executor.submit(call);
    LOG.info("Submitted index-paths task {} for plugin {}", uid, plugin.indexId());
    return uid;
  }

  public String submitUnindexPaths(QueryIndexMaintenance plugin, List<URI> uris) {
    String uid = UUID.randomUUID().toString();
    var task = new TrackedTask(uid, taskName(plugin.indexId(), "unindex"));
    task.total = uris.size();
    tasks.put(uid, task);
    Callable<Integer> call =
        () -> {
          long start = System.currentTimeMillis();
          int unindexed = 0;
          int errors = 0;
          for (int i = 0; i < uris.size(); i++) {
            if (Thread.currentThread().isInterrupted()) {
              task.canceled = true;
              task.progress = uris.size() > 0 ? (float) i / uris.size() : 1.0f;
              task.elapsedTime = System.currentTimeMillis() - start;
              task.nIndexed = unindexed;
              task.nErrors = errors;
              return unindexed;
            }
            try {
              unindexed += plugin.unindexPath(uris.get(i));
            } catch (Exception ex) {
              errors++;
              LOG.warn("Unindex failed for {}: {}", uris.get(i), ex.getMessage());
            }
            task.progress = (float) (i + 1) / uris.size();
          }
          task.complete = true;
          task.progress = 1.0f;
          task.elapsedTime = System.currentTimeMillis() - start;
          task.nIndexed = unindexed;
          task.nErrors = errors;
          return unindexed;
        };
    task.future = executor.submit(call);
    LOG.info("Submitted unindex-paths task {} for plugin {}", uid, plugin.indexId());
    return uid;
  }

  public boolean stopTask(String taskUid) {
    TrackedTask task = tasks.get(taskUid);
    if (task == null) return false;
    if (task.complete || task.canceled) return false;
    boolean stopped = task.future.cancel(true);
    if (stopped) {
      task.canceled = true;
    }
    return stopped;
  }

  public boolean removeTask(String taskUid) {
    TrackedTask task = tasks.remove(taskUid);
    return task != null;
  }

  public String getTaskUid(String taskUid) {
    TrackedTask task = tasks.get(taskUid);
    if (task == null) return null;
    reconcileState(task);
    return taskUid;
  }

  public TaskResults listTasks() {
    List<TrackedTask> snapshot;
    synchronized (tasks) {
      snapshot = new ArrayList<>(tasks.values());
    }
    int running = 0;
    List<TaskResult> results = new ArrayList<>(snapshot.size());
    for (var task : snapshot) {
      reconcileState(task);
      results.add(toResult(task));
      if (!task.complete && !task.canceled) {
        running++;
      }
    }
    return new TaskResults(results, running);
  }

  public TaskResult getTask(String taskUid) {
    TrackedTask task = tasks.get(taskUid);
    if (task == null) return null;
    reconcileState(task);
    return toResult(task);
  }

  private TaskResult toResult(TrackedTask task) {
    return new TaskResult(
        task.uid,
        task.name,
        task.progress,
        task.createdAt.format(ISO_FMT),
        task.complete ? Boolean.TRUE : null,
        task.canceled ? Boolean.TRUE : null,
        task.elapsedTime,
        task.nIndexed,
        task.nErrors);
  }

  private void reconcileState(TrackedTask task) {
    if (!task.complete && !task.canceled && task.future != null && task.future.isDone()) {
      try {
        task.future.get();
        task.complete = true;
      } catch (ExecutionException ex) {
        task.complete = true;
      } catch (InterruptedException ex) {
        task.canceled = true;
        Thread.currentThread().interrupt();
      }
    }
  }

  private static String taskName(String pluginId, String operation) {
    return "[" + pluginId + "]" + operation;
  }

  static class TrackedTask {
    final String uid;
    final String name;
    final LocalDateTime createdAt = LocalDateTime.now();
    volatile float progress = -1f;
    volatile boolean complete;
    volatile boolean canceled;
    volatile long elapsedTime;
    volatile Integer nIndexed;
    volatile Integer nErrors;
    volatile int total;
    volatile Future<Integer> future;

    TrackedTask(String uid, String name) {
      this.uid = uid;
      this.name = name;
    }
  }
}
