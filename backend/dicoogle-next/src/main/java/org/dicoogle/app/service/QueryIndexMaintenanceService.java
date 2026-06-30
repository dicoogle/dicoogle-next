package org.dicoogle.app.service;

import java.io.IOException;
import java.net.URI;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.dicoogle.sdk.query.QueryIndexMaintenance;
import org.springframework.stereotype.Service;

@Service
public class QueryIndexMaintenanceService {

  private final List<QueryIndexMaintenance> plugins;

  public QueryIndexMaintenanceService(List<QueryIndexMaintenance> plugins) {
    this.plugins = List.copyOf(plugins);
  }

  public List<IndexStatus> status() {
    List<IndexStatus> out = new ArrayList<>(plugins.size());
    for (QueryIndexMaintenance plugin : plugins) {
      try {
        out.add(new IndexStatus(plugin.indexId(), plugin.indexedDocuments()));
      } catch (IOException ex) {
        throw new IllegalStateException("Failed to read index status", ex);
      }
    }
    return out;
  }

  public List<ReindexResult> reindexAll() {
    List<ReindexResult> out = new ArrayList<>(plugins.size());
    for (QueryIndexMaintenance plugin : plugins) {
      try {
        out.add(new ReindexResult(plugin.indexId(), plugin.reindex()));
      } catch (IOException ex) {
        throw new IllegalStateException("Failed to reindex " + plugin.indexId(), ex);
      }
    }
    return out;
  }

  public boolean hasIndexes() {
    return !plugins.isEmpty();
  }

  public List<PathIndexResult> indexPaths(List<String> uris, String pluginId) {
    return mutatePaths(uris, pluginId, true);
  }

  public List<PathIndexResult> unindexPaths(List<String> uris, String pluginId) {
    return mutatePaths(uris, pluginId, false);
  }

  private List<PathIndexResult> mutatePaths(List<String> uris, String pluginId, boolean index) {
    List<URI> parsedUris = parseUris(uris);
    List<QueryIndexMaintenance> targets = selectTargets(pluginId);
    List<PathIndexResult> out = new ArrayList<>(targets.size());

    for (QueryIndexMaintenance plugin : targets) {
      int affected = 0;
      for (URI uri : parsedUris) {
        try {
          affected += index ? plugin.indexPath(uri) : plugin.unindexPath(uri);
        } catch (IOException ex) {
          throw new IllegalStateException(
              (index ? "Failed to index " : "Failed to unindex ")
                  + uri
                  + " with plugin "
                  + plugin.indexId(),
              ex);
        }
      }
      out.add(new PathIndexResult(plugin.indexId(), affected));
    }
    return out;
  }

  private List<URI> parseUris(List<String> uris) {
    if (uris == null || uris.isEmpty()) {
      throw new IllegalArgumentException("At least one URI is required");
    }
    List<URI> parsed = new ArrayList<>(uris.size());
    for (String raw : uris) {
      if (raw == null || raw.isBlank()) {
        throw new IllegalArgumentException("URI values must not be blank");
      }
      parsed.add(parseUriOrPath(raw.trim()));
    }
    return parsed;
  }

  private URI parseUriOrPath(String raw) {
    try {
      URI uri = URI.create(raw);
      if (uri.getScheme() != null && !uri.getScheme().isBlank() && !looksLikeWindowsPath(raw)) {
        return uri;
      }
    } catch (IllegalArgumentException ignored) {
      // Fallback to path parsing below.
    }

    try {
      return Path.of(raw).toAbsolutePath().normalize().toUri();
    } catch (InvalidPathException ex) {
      throw new IllegalArgumentException("Invalid URI/path: " + raw, ex);
    }
  }

  private boolean looksLikeWindowsPath(String value) {
    return value.length() >= 3
        && Character.isLetter(value.charAt(0))
        && value.charAt(1) == ':'
        && (value.charAt(2) == '\\' || value.charAt(2) == '/');
  }

  public QueryIndexMaintenance getPlugin(String pluginId) {
    List<QueryIndexMaintenance> selected = selectTargets(pluginId);
    return selected.getFirst();
  }

  public List<QueryIndexMaintenance> getAllPlugins() {
    return plugins;
  }

  private List<QueryIndexMaintenance> selectTargets(String pluginId) {
    if (pluginId == null || pluginId.isBlank()) {
      return plugins;
    }
    List<QueryIndexMaintenance> selected =
        plugins.stream().filter(p -> p.indexId().equals(pluginId)).toList();
    if (selected.isEmpty()) {
      throw new IllegalArgumentException("Unknown index plugin id: " + pluginId);
    }
    return selected;
  }

  public record IndexStatus(String pluginId, int documents) {}

  public record ReindexResult(String pluginId, int indexedDocuments) {}

  public record PathIndexResult(String pluginId, int affectedItems) {}
}
