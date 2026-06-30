package org.dicoogle.sdk.query;

import org.dicoogle.sdk.DicooglePlugin;

/**
 * Marker interface for all query-index plugins.
 *
 * <p>The query/index API is intentionally split into two independent extension points:
 *
 * <ul>
 *   <li>{@link StorageIngestEventListener} — the <em>indexing</em> side. Implementations receive
 *       notifications after each successful or failed storage ingest so they can update their
 *       internal index accordingly. Only plugins that maintain an index need to implement this.
 *   <li>{@link QueryService} / {@link QueryMoveService} — the <em>query</em> side. Implementations
 *       answer DICOM attribute-based queries (C-FIND / QIDO-RS style) and move-resolution requests
 *       (C-MOVE style) backed by whatever index they maintain. These interfaces are
 *       protocol-agnostic and can be consumed by DIMSE, DICOMWeb, or any other internal service.
 * </ul>
 *
 * <p>A plugin may implement any combination of these interfaces. For example:
 *
 * <ul>
 *   <li>A thumbnail generator only implements {@link StorageIngestEventListener}.
 *   <li>A read-only query adapter only implements {@link QueryService}.
 *   <li>A full index plugin implements both {@link StorageIngestEventListener} and {@link
 *       QueryService} (and optionally {@link QueryMoveService}).
 * </ul>
 *
 * <p>This interface should not be implemented directly. Implement one of the sub-interfaces above.
 */
public interface QueryIndexPlugin extends DicooglePlugin {}
