package pt.ua.dicooglenext.sdk.storage;

public record DimseAssociationAcceptedEvent(
    int associationSerialNo,
    String callingAet,
    String calledAet,
    String remoteHost,
    String localHost,
    String acceptedAt) {}
