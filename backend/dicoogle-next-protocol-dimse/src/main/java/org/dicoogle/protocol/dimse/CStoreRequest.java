package org.dicoogle.protocol.dimse;

import java.io.InputStream;

public record CStoreRequest(
    int associationSerialNo,
    String storageScheme,
    InputStream payload,
    String contentType,
    String callingAet,
    String calledAet,
    String affectedSopClassUid,
    String affectedSopInstanceUid,
    String transferSyntaxUid) {

  /** Legacy constructor accepting a byte array. The caller is responsible for closing it. */
  public static CStoreRequest ofBytes(
      int associationSerialNo,
      String storageScheme,
      byte[] payload,
      String contentType,
      String callingAet,
      String calledAet,
      String affectedSopClassUid,
      String affectedSopInstanceUid,
      String transferSyntaxUid) {
    return new CStoreRequest(
        associationSerialNo,
        storageScheme,
        new java.io.ByteArrayInputStream(payload),
        contentType,
        callingAet,
        calledAet,
        affectedSopClassUid,
        affectedSopInstanceUid,
        transferSyntaxUid);
  }
}
