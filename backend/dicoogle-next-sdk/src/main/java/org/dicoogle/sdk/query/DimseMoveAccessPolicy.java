package org.dicoogle.sdk.query;

public interface DimseMoveAccessPolicy extends QueryIndexPlugin {

  default Decision evaluate(DimseMoveServicePlugin.MoveRequest request) {
    return Decision.allow();
  }

  record Decision(boolean allowed, String reason) {
    public static Decision allow() {
      return new Decision(true, "");
    }

    public static Decision deny(String reason) {
      return new Decision(false, reason == null ? "c-move request denied" : reason);
    }
  }
}
