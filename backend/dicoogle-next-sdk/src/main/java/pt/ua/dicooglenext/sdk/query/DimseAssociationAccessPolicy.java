package pt.ua.dicooglenext.sdk.query;

import pt.ua.dicooglenext.sdk.storage.DimseAssociationAcceptedEvent;

public interface DimseAssociationAccessPolicy extends QueryIndexPlugin {

  default Decision evaluate(DimseAssociationAcceptedEvent event) {
    return Decision.allow();
  }

  record Decision(boolean allowed, String reason) {
    public static Decision allow() {
      return new Decision(true, "");
    }

    public static Decision deny(String reason) {
      return new Decision(false, reason == null ? "association denied" : reason);
    }
  }
}
