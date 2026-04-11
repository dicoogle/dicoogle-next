package org.dicoogle.sdk.query;

public interface DimseFindAccessPolicy extends QueryIndexPlugin {

  default Decision evaluate(DimseFindServicePlugin.FindRequest request) {
    return Decision.allow();
  }

  record Decision(boolean allowed, String reason) {
    public static Decision allow() {
      return new Decision(true, "");
    }

    public static Decision deny(String reason) {
      return new Decision(false, reason == null ? "c-find request denied" : reason);
    }
  }
}
