package org.dicoogle.protocol.dimse;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Shared DIMSE configuration properties.
 *
 * @param dimProviders list of query provider names (by {@code metadata().id()}) that are allowed to
 *     participate in DICOM C-FIND and C-MOVE operations. When empty, all available providers are
 *     used — matching legacy {@code ArchiveSettings.getDIMProviders()} fallback behaviour.
 */
@ConfigurationProperties(prefix = "app.dimse")
public class DimseProperties {

  private List<String> dimProviders = List.of();

  public List<String> getDimProviders() {
    return dimProviders;
  }

  public void setDimProviders(List<String> dimProviders) {
    this.dimProviders = dimProviders == null ? List.of() : List.copyOf(dimProviders);
  }
}
