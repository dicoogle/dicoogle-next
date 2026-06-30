package org.dicoogle.protocol.dimse;

import java.net.URI;

public record CStoreResult(int status, String detail, CStoreIdentifiers identifiers, URI location) {

  public static CStoreResult success() {
    return new CStoreResult(CStoreDimseStatus.SUCCESS, "Stored successfully", null, null);
  }

  public static CStoreResult success(CStoreIdentifiers identifiers, URI location) {
    return new CStoreResult(
        CStoreDimseStatus.SUCCESS, "Stored successfully", identifiers, location);
  }

  public static CStoreResult noWritableProvider(String scheme) {
    return new CStoreResult(
        CStoreDimseStatus.REFUSED_OUT_OF_RESOURCES,
        "No writable storage plugin available for scheme '%s'".formatted(scheme),
        null,
        null);
  }

  public static CStoreResult cannotUnderstand(String detail) {
    return new CStoreResult(CStoreDimseStatus.ERROR_CANNOT_UNDERSTAND, detail, null, null);
  }

  public static CStoreResult cannotUnderstand(String detail, CStoreIdentifiers identifiers) {
    return new CStoreResult(CStoreDimseStatus.ERROR_CANNOT_UNDERSTAND, detail, identifiers, null);
  }

  public static CStoreResult sopClassNotSupported(String sopClassUid) {
    return new CStoreResult(
        CStoreDimseStatus.SOP_CLASS_NOT_SUPPORTED,
        "SOP Class '%s' is not supported".formatted(sopClassUid),
        null,
        null);
  }

  public static CStoreResult transferSyntaxNotSupported(String transferSyntaxUid) {
    return new CStoreResult(
        CStoreDimseStatus.TRANSFER_SYNTAX_NOT_SUPPORTED,
        "Transfer Syntax '%s' is not supported".formatted(transferSyntaxUid),
        null,
        null);
  }
}
