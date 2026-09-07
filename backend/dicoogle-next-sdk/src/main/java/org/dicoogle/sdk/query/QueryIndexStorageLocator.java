package org.dicoogle.sdk.query;

import org.dicoogle.sdk.storage.DicomInstanceLocator;

/**
 * A query-index plugin that can also resolve DICOM hierarchy identifiers to storage URIs.
 *
 * <p>This interface extends both {@link QueryIndexPlugin} (marking it as a query/index extension
 * point) and {@link DicomInstanceLocator} (providing URI-based instance lookup). This eliminates
 * the need for consumers to maintain separate lists of locator implementations.
 *
 * <p>Implementations are typically backed by the same index as the corresponding {@link
 * StorageIngestEventListener}, and are consumed by the C-MOVE service and DICOMWeb WADO-RS
 * endpoints.
 */
public interface QueryIndexStorageLocator extends QueryIndexPlugin, DicomInstanceLocator {}
