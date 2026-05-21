package org.dicoogle.sdk.storage;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Optional;

/**
 * Resolves DICOM hierarchy identifiers to the storage URIs of their constituent instances.
 *
 * <p>This interface is a lower-level, storage-centric sibling of {@link
 * org.dicoogle.sdk.query.QueryIndexStorageLocator}. Whereas {@code QueryIndexStorageLocator} is a
 * query-index plugin extension point, {@code DicomInstanceLocator} is a pure storage-side utility
 * that can be implemented by any component with direct access to a storage backend — it does not
 * extend {@link org.dicoogle.sdk.DicooglePlugin}.
 *
 * <p>All methods may return an empty result if the requested identifiers are not known; they must
 * not return {@code null}.
 */
public interface DicomInstanceLocator {

  /**
   * Locates the storage URI for a single SOP instance.
   *
   * @param studyInstanceUid the Study Instance UID
   * @param seriesInstanceUid the Series Instance UID
   * @param sopInstanceUid the SOP Instance UID
   * @return the storage URI wrapped in an {@link Optional}, or {@link Optional#empty()} if the
   *     instance is not known
   * @throws IOException if a recoverable I/O error occurs
   */
  Optional<URI> locateInstance(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) throws IOException;

  /**
   * Returns the storage URIs for all instances belonging to a study.
   *
   * @param studyInstanceUid the Study Instance UID
   * @return an unordered list of URIs; empty if no instances for the study are known
   * @throws IOException if a recoverable I/O error occurs
   */
  List<URI> listStudyInstances(String studyInstanceUid) throws IOException;

  /**
   * Returns the storage URIs for all instances belonging to a series.
   *
   * @param studyInstanceUid the Study Instance UID
   * @param seriesInstanceUid the Series Instance UID
   * @return an unordered list of URIs; empty if no instances for the series are known
   * @throws IOException if a recoverable I/O error occurs
   */
  List<URI> listSeriesInstances(String studyInstanceUid, String seriesInstanceUid)
      throws IOException;
}
