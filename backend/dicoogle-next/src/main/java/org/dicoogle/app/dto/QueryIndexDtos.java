package org.dicoogle.app.dto;

import java.util.List;

public class QueryIndexDtos {

  public record QueryIndexStatusItem(String pluginId, int documents) {}

  public record QueryIndexReindexItem(String pluginId, int indexedDocuments) {}

  public record QueryIndexPathRequest(List<String> uris, String pluginId) {}

  public record QueryIndexPathItem(String pluginId, int affectedItems) {}
}
