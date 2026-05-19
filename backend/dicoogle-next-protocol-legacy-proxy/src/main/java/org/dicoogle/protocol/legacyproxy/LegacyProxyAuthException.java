package org.dicoogle.protocol.legacyproxy;

/** Thrown when authentication with the legacy Dicoogle instance fails. */
public class LegacyProxyAuthException extends RuntimeException {

  public LegacyProxyAuthException(String message) {
    super(message);
  }

  public LegacyProxyAuthException(String message, Throwable cause) {
    super(message, cause);
  }
}
