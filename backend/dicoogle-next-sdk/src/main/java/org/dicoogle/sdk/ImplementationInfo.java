package org.dicoogle.sdk;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

/**
 * Provides the DICOM implementation identifiers for this Dicoogle build.
 *
 * <p>The Implementation Class UID remains stable across releases, while the Implementation Version
 * Name is derived from the build version so it can be updated automatically when a new release is
 * produced.
 */
public final class ImplementationInfo {

  /** Stable Dicoogle Implementation Class UID. */
  public static final String IMPLEMENTATION_CLASS_UID = "1.2.826.0.1.3680043.10.5432.1";

  /** Implementation Version Name derived from the build version. */
  public static final String IMPLEMENTATION_VERSION_NAME = loadVersionName();

  private static final String VERSION_RESOURCE = "dicoogle-sdk.properties";
  private static final String VERSION_KEY = "dicoogle.version";

  private ImplementationInfo() {}

  private static String loadVersionName() {
    String version = readVersionProperty();
    if (version == null || version.isBlank()) {
      version = "unknown";
    }
    return "DICOOGLE_NEXT_" + version;
  }

  private static String readVersionProperty() {
    try (InputStream in =
        ImplementationInfo.class.getClassLoader().getResourceAsStream(VERSION_RESOURCE)) {
      if (in == null) {
        return null;
      }
      Properties props = new Properties();
      props.load(in);
      return props.getProperty(VERSION_KEY);
    } catch (IOException ex) {
      return null;
    }
  }
}
