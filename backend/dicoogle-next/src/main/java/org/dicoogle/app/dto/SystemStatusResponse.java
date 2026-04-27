package org.dicoogle.app.dto;

public record SystemStatusResponse(
    String name,
    String environment,
    String status,
    String dimseTransferConfigSource,
    long dimseTransferConfigVersion,
    String dimseTransferConfigAppliedAt) {}
