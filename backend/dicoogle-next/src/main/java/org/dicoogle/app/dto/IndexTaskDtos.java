package org.dicoogle.app.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class IndexTaskDtos {

  public record TaskResult(
      String taskUid,
      String taskName,
      float taskProgress,
      String taskTimeCreated,
      Boolean complete,
      Boolean canceled,
      Long elapsedTime,
      Integer nIndexed,
      Integer nErrors) {}

  public record TaskResults(List<TaskResult> results, int count) {}
}
