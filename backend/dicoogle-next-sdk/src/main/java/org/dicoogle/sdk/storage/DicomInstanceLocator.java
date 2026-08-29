package org.dicoogle.sdk.storage;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Optional;

/**
 * Resolves DICOM hierarchy identifiers to the storage URIs of their constituent instances.
 *
 * <p>This is the base interface for instance location. Query-index plugins that also support
 * location resolution extend this via {@link org.dicoogle.sdk.query.QueryIndexStorageLocator},
 * which combines {@code DicomInstanceLocator} with {@link org.dicoogle.sdk.query.QueryIndexPlugin}.
 *
 * <p>Storage-only implementations (that do not maintain an index) may implement this interface
 * directly without extending {@link org.dicoogle.sdk.DicooglePlugin}.
 *
 * <p>All methods may return an empty result if the requested identifiers are not known; they must
 * not return {@code null}.
 */
public interface DicomInstanceLocator {

  /**
   * Locates the storage URI for a single SOP instance.
   *
   * <p>The {@code sopInstanceUid} is always required. The {@code studyInstanceUid} and {@code
   * seriesInstanceUid} parameters may be {@code null} when the caller relies on the SOP Instance
   * UID being unique across the archive. Implementations that cannot resolve a location without the
   * full hierarchy should return {@link Optional#empty()} when these parameters are missing.
   *
   * @param studyInstanceUid the Study Instance UID, or {@code null} for SOP-only lookup
   * @param seriesInstanceUid the Series Instance UID, or {@code null} for SOP-only lookup
   * @param sopInstanceUid the SOP Instance UID (required)
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
