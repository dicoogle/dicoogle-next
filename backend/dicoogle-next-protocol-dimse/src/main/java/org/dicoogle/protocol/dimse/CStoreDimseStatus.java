package org.dicoogle.protocol.dimse;

public final class CStoreDimseStatus {

  public static final int SUCCESS = 0x0000;
  public static final int REFUSED_OUT_OF_RESOURCES = 0xA700;
  public static final int SOP_CLASS_NOT_SUPPORTED = 0x0122;
  public static final int TRANSFER_SYNTAX_NOT_SUPPORTED = 0x0212;
  public static final int ERROR_CANNOT_UNDERSTAND = 0xC000;

  private CStoreDimseStatus() {}
}
