package org.dicoogle.sdk.query;

@FunctionalInterface
public interface DimseAccessPolicy<R> {

  Decision evaluate(R request);

  record Decision(boolean allowed, String reason) {
    public static Decision allow() {
      return new Decision(true, "");
    }

    public static Decision deny(String reason) {
      return new Decision(false, reason == null ? "request denied" : reason);
    }
  }
}
