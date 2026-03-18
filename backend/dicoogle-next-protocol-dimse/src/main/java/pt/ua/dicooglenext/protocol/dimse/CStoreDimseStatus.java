package pt.ua.dicooglenext.protocol.dimse;

public final class CStoreDimseStatus {

  public static final int SUCCESS = 0x0000;
  public static final int REFUSED_OUT_OF_RESOURCES = 0xA700;
  public static final int ERROR_CANNOT_UNDERSTAND = 0xC000;

  private CStoreDimseStatus() {}
}
