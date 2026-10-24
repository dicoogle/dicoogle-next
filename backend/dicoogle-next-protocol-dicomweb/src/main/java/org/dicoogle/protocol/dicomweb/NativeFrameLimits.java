package org.dicoogle.protocol.dicomweb;

public record NativeFrameLimits(
    long maxStoredInstanceBytes, long maxFrameBytes, long maxResponseBytes, int maxFramesPerRequest) {

  public NativeFrameLimits {
    if (maxStoredInstanceBytes <= 0
        || maxFrameBytes <= 0
        || maxResponseBytes <= 0
        || maxFramesPerRequest <= 0) {
      throw new IllegalArgumentException("Native-frame limits must be positive");
    }
  }

  public static NativeFrameLimits defaults() {
    return new NativeFrameLimits(64L * 1024 * 1024, 16L * 1024 * 1024, 64L * 1024 * 1024, 8);
  }
}
