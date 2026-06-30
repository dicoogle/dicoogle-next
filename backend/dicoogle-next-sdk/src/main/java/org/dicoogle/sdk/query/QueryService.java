package org.dicoogle.sdk.query;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.function.BooleanSupplier;
import org.dcm4che3.data.Attributes;

/**
 * The <em>query</em> side of the query/index plugin split for C-FIND / QIDO-RS style searches.
 *
 * <p>Implementations answer attribute-based DICOM queries at a given {@link QueryRetrieveLevel}.
 * The interface is protocol-agnostic: the same plugin instance is used by DIMSE C-FIND, DICOMWeb
 * QIDO-RS, and any other internal consumer.
 *
 * <p>A {@link QueryRequest} carries all parameters that any of these callers may supply, including
 * optional free-text and keyword filters that go beyond the standard DICOM attribute matching.
 * Implementations should silently ignore parameters they do not support rather than throwing.
 *
 * <p>Query implementations are expected to be backed by an index built by a corresponding {@link
 * StorageIngestEventListener}. Direct filesystem scanning is not acceptable for production
 * archives.
 *
 * @see QueryMoveService for the move-resolution counterpart
 */
public interface QueryService extends QueryIndexPlugin {

  enum InformationModel {
    STUDY_ROOT
  }

  /**
   * Encapsulates all parameters of a single query request.
   *
   * @param informationModel the DICOM information model (currently only {@link
   *     InformationModel#STUDY_ROOT})
   * @param level the query/retrieve level at which results are requested
   * @param callingAet the AE title of the requesting entity
   * @param calledAet the AE title of the called entity
   * @param associationSerialNo a monotonically increasing identifier for the association, or 0 if
   *     the query did not originate from a DIMSE association
   * @param keys the DICOM dataset containing matching keys and return keys
   * @param freeText an optional free-text search term applied across a set of human-readable
   *     attributes (e.g. patient name, accession number, study description)
   * @param keywordFilters optional map of DICOM keyword or tag path to value for additional
   *     filtering beyond standard DICOM matching
   * @param fuzzyMatchingEnabled whether fuzzy semantic matching should be applied to PN-typed
   *     attributes
   * @param dateTimeMatchingEnabled whether extended datetime matching should be applied
   * @param cancelRequested a supplier that returns {@code true} once the caller has issued a
   *     C-CANCEL or equivalent; implementations should poll this and return early if set
   * @param rawQuery an optional raw Lucene query string that bypasses structured matching; when
   *     set, the implementation should parse and apply it directly (e.g. via {@code
   *     QueryParser.parse(rawQuery)}). Ignored if {@code null}.
   */
  record QueryRequest(
      InformationModel informationModel,
      QueryRetrieveLevel level,
      String callingAet,
      String calledAet,
      int associationSerialNo,
      Attributes keys,
      String freeText,
      Map<String, String> keywordFilters,
      boolean fuzzyMatchingEnabled,
      boolean dateTimeMatchingEnabled,
      BooleanSupplier cancelRequested,
      String rawQuery) {}

  /**
   * A single query result pairing the matched DICOM attributes with the storage URI from which they
   * were read.
   *
   * <p>The {@code attributes} map may be <em>partial</em>: it contains only the DICOM fields that
   * the index plugin chose to store at index time (typically the fields needed for C-FIND matching
   * and the most common return keys). Consumers MUST NOT assume the Attributes represent a complete
   * DICOM dataset. For full dataset retrieval, use the {@code storageUri} to read the original
   * DICOM file from the storage backend.
   *
   * @param attributes the DICOM attributes of the matched instance (may be partial)
   * @param storageUri the storage location from which the instance can be retrieved
   */
  record QueryResult(Attributes attributes, URI storageUri) {}

  /**
   * Executes a query and returns the matching results.
   *
   * <p>Each returned {@link QueryResult} contains the DICOM attributes (at least the requested
   * return keys for the given {@link QueryRetrieveLevel}) plus the corresponding storage URI.
   * Implementations must not return {@code null}; an empty list indicates no matches.
   *
   * @param request the query parameters
   * @return a list of matching results; never {@code null}
   * @throws IOException if a recoverable I/O error occurs during query execution
   */
  List<QueryResult> query(QueryRequest request) throws IOException;
}
