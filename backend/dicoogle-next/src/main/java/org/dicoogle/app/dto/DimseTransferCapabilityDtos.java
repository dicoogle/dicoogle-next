package org.dicoogle.app.dto;

import java.util.List;

public final class DimseTransferCapabilityDtos {

  private DimseTransferCapabilityDtos() {}

  public record TransferCapabilityItem(String sopClassUid, List<String> transferSyntaxUids) {}

  public record TransferCapabilityListResponse(
      String source,
      long version,
      String updatedBy,
      String updatedAt,
      String nodeId,
      List<TransferCapabilityItem> acceptedTransferCapabilities) {}

  public record TransferCapabilityUpsertRequest(List<String> transferSyntaxUids) {}

  public record TransferCapabilityReplaceRequest(
      List<TransferCapabilityItem> acceptedTransferCapabilities, Long expectedVersion) {}
}
