package org.dicoogle.sdk.query;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Optional;

/**
 * Provides URI-based lookup of stored DICOM instances by DICOM hierarchy identifiers.
 *
 * <p>This interface is the bridge between the index and the storage layer: given the UIDs that
 * identify a study, series, or instance, it resolves the concrete storage {@link URI}s that can be
 * passed to {@link org.dicoogle.sdk.storage.ReadableStoragePlugin#openForRead(URI)}.
 *
 * <p>Implementations are typically backed by the same index as the corresponding
 * {@link StorageIngestEventListener}, and are consumed by the C-MOVE service and DICOMWeb WADO-RS
 * endpoints.
 */
public interface QueryIndexStorageLocator extends QueryIndexPlugin {

  /**
   * Locates the storage URI for a single SOP instance.
   *
   * @param studyInstanceUid  the Study Instance UID
   * @param seriesInstanceUid the Series Instance UID
   * @param sopInstanceUid    the SOP Instance UID
   * @return the storage URI wrapped in an {@link Optional}, or {@link Optional#empty()} if the
   *         instance is not known to this index
   * @throws IOException if a recoverable I/O error occurs during lookup
   */
  Optional<URI> locateInstance(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) throws IOException;

  /**
   * Returns the storage URIs for all instances belonging to a study.
   *
   * <p>The returned list may be large for studies with many series or instances. Callers should
   * stream or paginate the results where possible.
   *
   * @param studyInstanceUid the Study Instance UID
   * @return an unordered list of URIs; empty if no instances for the study are known
   * @throws IOException if a recoverable I/O error occurs during lookup
   */
  List<URI> listStudyInstances(String studyInstanceUid) throws IOException;

  /**
   * Returns the storage URIs for all instances belonging to a series.
   *
   * @param studyInstanceUid  the Study Instance UID
   * @param seriesInstanceUid the Series Instance UID
   * @return an unordered list of URIs; empty if no instances for the series are known
   * @throws IOException if a recoverable I/O error occurs during lookup
   */
  List<URI> listSeriesInstances(String studyInstanceUid, String seriesInstanceUid)
      throws IOException;
}
