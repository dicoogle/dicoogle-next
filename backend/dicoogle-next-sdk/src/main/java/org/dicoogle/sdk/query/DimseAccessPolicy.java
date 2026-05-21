package org.dicoogle.sdk.query;

/**
 * Evaluates whether an incoming DIMSE request should be allowed to proceed.
 *
 * <p>This is a generic, protocol-level access control hook that is orthogonal to indexing and query
 * concerns. The type parameter {@code R} is the request descriptor specific to each DIMSE service:
 *
 * <ul>
 *   <li>For association negotiation: {@link org.dicoogle.sdk.storage.DimseAssociationAcceptedEvent}
 *   <li>For C-FIND: {@link QueryService.QueryRequest}
 *   <li>For C-MOVE: {@link QueryMoveService.MoveRequest}
 * </ul>
 *
 * <p>Convenience sub-interfaces are provided for each of these cases so that plugin authors can
 * implement a strongly-typed policy without needing to cast.
 *
 * <p>This interface is a {@link FunctionalInterface}; it can be implemented as a lambda.
 *
 * @param <R> the type of request object passed to {@link #evaluate}
 */
@FunctionalInterface
public interface DimseAccessPolicy<R> {

  /**
   * Evaluates the request and returns an access decision.
   *
   * @param request the incoming request context; never {@code null}
   * @return a {@link Decision} indicating whether the request is allowed; never {@code null}
   */
  Decision evaluate(R request);

  /**
   * The outcome of an access-policy evaluation.
   *
   * @param allowed {@code true} if the request may proceed, {@code false} if it should be denied
   * @param reason a human-readable explanation; empty string when the request is allowed
   */
  record Decision(boolean allowed, String reason) {

    /**
     * Returns a decision that permits the request.
     *
     * @return an allow decision
     */
    public static Decision allow() {
      return new Decision(true, "");
    }

    /**
     * Returns a decision that denies the request.
     *
     * @param reason a human-readable explanation shown in logs; if {@code null} a generic message
     *     is used
     * @return a deny decision
     */
    public static Decision deny(String reason) {
      return new Decision(false, reason == null ? "request denied" : reason);
    }
  }
}
