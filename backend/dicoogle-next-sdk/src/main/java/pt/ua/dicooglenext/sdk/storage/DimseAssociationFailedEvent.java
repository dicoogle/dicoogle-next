package pt.ua.dicooglenext.sdk.storage;

public record DimseAssociationFailedEvent(
    int associationSerialNo,
    String callingAet,
    String calledAet,
    String remoteHost,
    String localHost,
    String reason,
    String failedAt) {}
