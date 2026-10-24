package org.dicoogle.protocol.dicomweb;

import java.util.List;

public record NativeFrameResponse(
    byte[] body,
    String boundary,
    String transferSyntaxUID,
    List<Integer> frameNumbers,
    long serverInstanceBytesRead,
    long responseFrameBytes,
    int backendInstanceReads) {

  public NativeFrameResponse {
    body = body.clone();
    frameNumbers = List.copyOf(frameNumbers);
  }
}
