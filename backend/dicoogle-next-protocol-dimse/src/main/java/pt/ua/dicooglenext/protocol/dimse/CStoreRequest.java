package org.dicoogle.protocol.dimse;

public record CStoreRequest(
    int associationSerialNo,
    String storageScheme,
    byte[] payload,
    String contentType,
    String callingAet,
    String calledAet,
    String affectedSopClassUid,
    String affectedSopInstanceUid,
    String transferSyntaxUid) {}
