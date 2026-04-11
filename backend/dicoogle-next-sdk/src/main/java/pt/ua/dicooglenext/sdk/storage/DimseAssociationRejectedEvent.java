package org.dicoogle.sdk.storage;

public record DimseAssociationRejectedEvent(
    int associationSerialNo,
    String callingAet,
    String calledAet,
    String remoteHost,
    String localHost,
    String reason,
    String rejectedAt) {}
