package org.dicoogle.sdk.storage;

public record DimseAssociationClosedEvent(
    int associationSerialNo,
    String callingAet,
    String calledAet,
    String remoteHost,
    String localHost,
    String closedAt) {}
