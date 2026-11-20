package org.dicoogle.protocol.dimse;

import java.io.IOException;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;
import java.security.UnrecoverableKeyException;
import java.security.cert.CertificateException;
import java.util.Objects;
import org.dcm4che3.net.Connection;
import org.dcm4che3.net.Device;
import org.dcm4che3.net.SSLManagerFactory;

/** Utility module for working with DICOM TLS */
public final class DicomTls {

  private DicomTls() {}

  /**
   * Configure the given DICOM device and connection to use DICOM TLS, according to the given DIMSE
   * TLS properties.
   */
  public static void configureTls(
      Device device, Connection connection, DimseTlsProperties tlsProperties) {

    Objects.requireNonNull(tlsProperties.getKeystore(), "dimse.tls.keystore is not configured");
    connection.setTlsProtocols(tlsProperties.getProtocols().toArray(new String[0]));
    connection.setTlsCipherSuites(tlsProperties.getCipherSuites().toArray(new String[0]));
    connection.setTlsNeedClientAuth(tlsProperties.isPeerCertificateRequired());

    // key and certificate are in a keystore
    try {
      device.setKeyManager(
          SSLManagerFactory.createKeyManager(
              tlsProperties.getKeystoreType(),
              tlsProperties.getKeystore(),
              tlsProperties.getKeystorePassword(),
              tlsProperties.getKeystorePassword()));
      if (tlsProperties.getTruststore() != null) {
        device.setTrustManager(
            SSLManagerFactory.createTrustManager(
                tlsProperties.getTruststoreType(),
                tlsProperties.getTruststore(),
                tlsProperties.getTruststorePassword()));
      }
    } catch (UnrecoverableKeyException
        | KeyStoreException
        | NoSuchAlgorithmException
        | CertificateException
        | IOException e) {
      throw new RuntimeException("Failed to configure TLS", e);
    }
  }
}
