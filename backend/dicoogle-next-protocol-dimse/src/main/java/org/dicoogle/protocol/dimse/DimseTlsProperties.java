package org.dicoogle.protocol.dimse;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** DICOM TLS configuration in DIMSE services */
@ConfigurationProperties(prefix = "app.dimse.tls")
public class DimseTlsProperties {

  /** Java keystore type */
  private String keyType = "pkcs12";

  /** Supported TLS protocols */
  private List<String> protocols = List.of("TLSv1.2", "TLSv1.3");

  /** Supported cipher suites */
  private List<String> cipherSuites =
      List.of(
          "TLS_AES_256_GCM_SHA384",
          "TLS_AES_128_GCM_SHA256",
          "TLS_CHACHA20_POLY1305_SHA256",
          "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
          "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
          "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
          "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
          "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
          "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
          "TLS_DHE_RSA_WITH_AES_256_GCM_SHA384",
          "TLS_DHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
          "TLS_DHE_RSA_WITH_AES_128_GCM_SHA256");

  /** Type of key store */
  private String keystoreType = "pkcs12";

  /** URL or file system path to the key store. This is required by DICOM TLS servers. */
  private String keystore = null;

  private String keystorePassword = null;

  /** Type of the custom trust store */
  private String truststoreType = "pkcs12";

  /** URL or file system path to a custom trust store. */
  private String truststore = null;

  private String truststorePassword = null;

  /**
   * Whether the remote node is required to provide a valid certificate.
   *
   * <p>In SCP servers, this is equivalent to needing TLS client authentication.
   */
  private boolean peerCertificateRequired;

  public String getKeyType() {
    return keyType;
  }

  public void setKeyType(String keyType) {
    this.keyType = keyType;
  }

  public List<String> getProtocols() {
    return protocols;
  }

  public void setProtocols(List<String> tlsProtocols) {
    this.protocols = tlsProtocols;
  }

  public List<String> getCipherSuites() {
    return cipherSuites;
  }

  public void setCipherSuites(List<String> tlsCipherSuites) {
    this.cipherSuites = tlsCipherSuites;
  }

  public boolean isPeerCertificateRequired() {
    return peerCertificateRequired;
  }

  public void setPeerCertificateRequired(boolean peerCertificateRequired) {
    this.peerCertificateRequired = peerCertificateRequired;
  }

  public String getKeystoreType() {
    return keystoreType;
  }

  public void setKeystoreType(String keystoreType) {
    this.keystoreType = keystoreType;
  }

  public String getKeystore() {
    return keystore;
  }

  public void setKeystore(String keystore) {
    this.keystore = keystore;
  }

  public String getTruststoreType() {
    return truststoreType;
  }

  public void setTruststoreType(String truststoreType) {
    this.truststoreType = truststoreType;
  }

  public String getTruststore() {
    return truststore;
  }

  public String getKeystorePassword() {
    return keystorePassword;
  }

  public void setKeystorePassword(String keystorePassword) {
    this.keystorePassword = keystorePassword;
  }

  public void setTruststore(String truststore) {
    this.truststore = truststore;
  }

  public String getTruststorePassword() {
    return truststorePassword;
  }

  public void setTruststorePassword(String truststorePassword) {
    this.truststorePassword = truststorePassword;
  }
}
