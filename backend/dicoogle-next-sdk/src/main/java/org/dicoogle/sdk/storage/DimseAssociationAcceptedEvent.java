package org.dicoogle.sdk.storage;

public record DimseAssociationAcceptedEvent(
    int associationSerialNo,
    String callingAet,
    String calledAet,
    String remoteHost,
    String localHost,
    String acceptedAt) {}
