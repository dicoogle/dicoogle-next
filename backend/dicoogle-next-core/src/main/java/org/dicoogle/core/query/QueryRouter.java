package org.dicoogle.core.query;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.dcm4che3.data.Tag;
import org.dicoogle.sdk.query.QueryMoveService;
import org.dicoogle.sdk.query.QueryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Central dispatcher for DICOM queries and move-resolution requests.
 *
 * <p>Matches the legacy {@code PluginController.query(holder, querySources, query, params)}
 * pattern: the caller provides a list of <em>query plugin names</em> (e.g. {@code ["lucene"]}), and
 * the router looks up each plugin by name, dispatches queries to all of them in parallel, and
 * merges the deduplicated results.
 *
 * <p>Storage providers are <em>not</em> selected here. Each {@link QueryService} returns a {@link
 * QueryService.QueryResult} whose {@code storageUri()} carries the storage URI. The URI scheme
 * implicitly selects the storage provider at retrieve time via {@code StorageRouter}.
 *
 * @see QueryService
 * @see QueryMoveService
 */
public class QueryRouter {

  private static final Logger LOG = LoggerFactory.getLogger(QueryRouter.class);

  private final Map<String, QueryService> queryServices;
  private final Map<String, QueryMoveService> moveServices;
  private final ExecutorService executor;
  private final int maxResults;

  /** Builds the router from the given plugin collections and configuration. */
  public QueryRouter(
      List<QueryService> queryServices,
      List<QueryMoveService> moveServices,
      int threadPoolSize,
      int maxResults) {
    this.queryServices = indexByName(queryServices, QueryService.class);
    this.moveServices = indexByName(moveServices, QueryMoveService.class);
    this.executor = Executors.newFixedThreadPool(Math.max(1, threadPoolSize));
    this.maxResults = Math.max(1, maxResults);
  }

  // -----------------------------------------------------------------------
  // Query (C-FIND / QIDO-RS)
  // -----------------------------------------------------------------------

  /**
   * Queries the providers whose names appear in {@code providerNames}. If the list is empty, all
   * registered {@link QueryService} providers are queried.
   */
  public List<QueryService.QueryResult> query(
      QueryService.QueryRequest request, List<String> providerNames) {
    List<QueryService> selected = resolve(providerNames, queryServices);
    if (selected.isEmpty()) {
      return List.of();
    }
    return fanOut(selected, plugin -> safeCall(() -> plugin.query(request)));
  }

  /**
   * Queries <em>all</em> registered {@link QueryService} providers in parallel. Equivalent to
   * calling {@code query(request, List.of())}.
   */
  public List<QueryService.QueryResult> queryAll(QueryService.QueryRequest request) {
    return query(request, List.of());
  }

  // -----------------------------------------------------------------------
  // Move resolution (C-MOVE)
  // -----------------------------------------------------------------------

  /**
   * Resolves a move request against the providers whose names appear in {@code providerNames}. If
   * the list is empty, all registered {@link QueryMoveService} providers are queried.
   */
  public List<QueryMoveService.MoveCandidate> resolve(
      QueryMoveService.MoveRequest request, List<String> providerNames) {
    List<QueryMoveService> selected = resolve(providerNames, moveServices);
    if (selected.isEmpty()) {
      return List.of();
    }
    return fanOut(selected, plugin -> safeCall(() -> plugin.resolve(request)));
  }

  /**
   * Resolves a move request against <em>all</em> registered {@link QueryMoveService} providers in
   * parallel.
   */
  public List<QueryMoveService.MoveCandidate> resolveAll(QueryMoveService.MoveRequest request) {
    return resolve(request, List.of());
  }

  // -----------------------------------------------------------------------
  // Shutdown
  // -----------------------------------------------------------------------

  /** Shuts down the internal thread pool. Call during application shutdown. */
  public void shutdown() {
    executor.shutdown();
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private <T> List<T> resolve(List<String> names, Map<String, T> registry) {
    if (names == null || names.isEmpty()) {
      return List.copyOf(registry.values());
    }
    return names.stream().map(registry::get).filter(Objects::nonNull).collect(Collectors.toList());
  }

  private <T, R> List<R> fanOut(List<T> plugins, Function<T, List<R>> call) {
    List<CompletableFuture<List<R>>> futures =
        plugins.stream()
            .map(p -> CompletableFuture.supplyAsync(() -> call.apply(p), executor))
            .toList();

    List<R> merged = new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    for (var future : futures) {
      List<R> partial;
      try {
        partial = future.get();
      } catch (InterruptedException ex) {
        Thread.currentThread().interrupt();
        return merged;
      } catch (ExecutionException ex) {
        LOG.warn("Query plugin threw an exception", ex.getCause());
        continue;
      }
      if (partial == null) {
        continue;
      }
      for (R item : partial) {
        if (item == null) {
          continue;
        }
        String key = dedupKey(item);
        if (key == null || seen.add(key)) {
          merged.add(item);
          if (merged.size() >= maxResults) {
            return merged;
          }
        }
      }
    }
    return merged;
  }

  private <T> List<T> safeCall(java.util.concurrent.Callable<List<T>> callable) {
    try {
      return callable.call();
    } catch (Exception ex) {
      LOG.warn("Query plugin call failed", ex);
      return List.of();
    }
  }

  /** Builds a dedup key from a query or move result. Returns null if no UIDs are available. */
  private String dedupKey(Object result) {
    if (result instanceof QueryService.QueryResult qr) {
      String study = qr.attributes().getString(Tag.StudyInstanceUID, "");
      String series = qr.attributes().getString(Tag.SeriesInstanceUID, "");
      String sop = qr.attributes().getString(Tag.SOPInstanceUID, "");
      if (study.isBlank() && series.isBlank() && sop.isBlank()) {
        return qr.storageUri() != null ? qr.storageUri().toString() : null;
      }
      return study + "|" + series + "|" + sop;
    }
    if (result instanceof QueryMoveService.MoveCandidate mc) {
      return mc.location() != null
          ? mc.sopInstanceUid() + "|" + mc.location()
          : mc.sopInstanceUid();
    }
    return null;
  }

  private static <T> Map<String, T> indexByName(List<T> plugins, Class<?> type) {
    Map<String, T> map = new LinkedHashMap<>();
    for (T plugin : plugins) {
      String name = nameOf(plugin);
      if (name != null) {
        map.put(name, plugin);
      }
    }
    return Map.copyOf(map);
  }

  private static String nameOf(Object plugin) {
    if (plugin instanceof org.dicoogle.sdk.DicooglePlugin dp) {
      return dp.metadata().id();
    }
    return null;
  }
}
