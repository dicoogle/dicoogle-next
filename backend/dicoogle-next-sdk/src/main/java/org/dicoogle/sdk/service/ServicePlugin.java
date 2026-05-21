package org.dicoogle.sdk.service;

import org.dicoogle.sdk.DicooglePlugin;

/**
 * Base interface for non-storage service plugins.
 *
 * <p>Service plugins provide application-level functionality that is not tied to storage or query
 * indexing, such as background tasks or monitoring integrations. Implementations are discovered and
 * managed by the same plugin lifecycle as other Dicoogle extensions.
 */
public interface ServicePlugin extends DicooglePlugin {}
