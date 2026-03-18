package pt.ua.dicooglenext.protocol.dimse;

public record CStoreRequest(
    String storageScheme,
    byte[] payload,
    String contentType,
    String callingAet,
    String calledAet) {}
