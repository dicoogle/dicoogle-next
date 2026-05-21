package org.dicoogle.sdk.query;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.dcm4che3.data.Attributes;

/**
 * The <em>query</em> side of the query/index plugin split for C-MOVE / WADO-RS style
 * move-resolution requests.
 *
 * <p>Implementations resolve a set of DICOM identifiers into concrete storage {@link URI}s that the
 * C-MOVE (or equivalent) service can then retrieve and forward to the move destination. Like {@link
 * QueryService}, this interface is protocol-agnostic.
 *
 * <p>Implementations are expected to be backed by the same index as their {@link QueryService}
 * counterpart. The result of a move resolution is a list of {@link MoveCandidate} records, each
 * carrying enough information for the storage layer to open and stream the instance.
 *
 * @see QueryService for the C-FIND / QIDO-RS counterpart
 */
public interface QueryMoveService extends QueryIndexPlugin {

  /**
   * Encapsulates all parameters of a single move-resolution request.
   *
   * @param informationModel the DICOM information model
   * @param level the query/retrieve level at which the move is requested
   * @param callingAet the AE title of the requesting entity
   * @param calledAet the AE title of the called entity
   * @param moveDestinationAet the AE title of the intended move destination
   * @param associationSerialNo a monotonically increasing association identifier
   * @param keys the DICOM dataset containing the instance identifiers to move
   * @param cancelRequested a supplier that returns {@code true} once the caller has issued a
   *     C-CANCEL; implementations should poll this and return early if set
   */
  record MoveRequest(
      QueryService.InformationModel informationModel,
      QueryRetrieveLevel level,
      String callingAet,
      String calledAet,
      String moveDestinationAet,
      int associationSerialNo,
      Attributes keys,
      BooleanSupplier cancelRequested) {}

  /**
   * A single instance that satisfies a move request.
   *
   * @param sopClassUid the SOP Class UID of the instance
   * @param sopInstanceUid the SOP Instance UID of the instance
   * @param location the storage URI from which the instance can be retrieved
   */
  record MoveCandidate(String sopClassUid, String sopInstanceUid, URI location) {}

  /**
   * Resolves a move request into the set of storage locations that should be forwarded.
   *
   * <p>Implementations must not return {@code null}; an empty list indicates no matches.
   *
   * @param request the move-resolution parameters
   * @return the list of matching candidates; never {@code null}
   * @throws IOException if a recoverable I/O error occurs
   */
  List<MoveCandidate> resolve(MoveRequest request) throws IOException;
}
