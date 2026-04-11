package org.dicoogle.protocol.dimse;

import java.util.ArrayList;
import java.util.List;
import org.dcm4che3.data.UID;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.dimse.cstore")
public class DimseCStoreProperties {

  private boolean enabled;
  private String aeTitle = "DICOOGLE";
  private String bindAddress = "0.0.0.0";
  private int port = 11112;
  private String storageScheme = "file";
  private List<AcceptedTransferCapability> acceptedTransferCapabilities =
      defaultAcceptedTransferCapabilities();

  public boolean isEnabled() {
    return enabled;
  }

  public void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  public String getAeTitle() {
    return aeTitle;
  }

  public void setAeTitle(String aeTitle) {
    this.aeTitle = aeTitle;
  }

  public String getBindAddress() {
    return bindAddress;
  }

  public void setBindAddress(String bindAddress) {
    this.bindAddress = bindAddress;
  }

  public int getPort() {
    return port;
  }

  public void setPort(int port) {
    this.port = port;
  }

  public String getStorageScheme() {
    return storageScheme;
  }

  public void setStorageScheme(String storageScheme) {
    this.storageScheme = storageScheme;
  }

  public List<AcceptedTransferCapability> getAcceptedTransferCapabilities() {
    return acceptedTransferCapabilities;
  }

  public void setAcceptedTransferCapabilities(
      List<AcceptedTransferCapability> acceptedTransferCapabilities) {
    this.acceptedTransferCapabilities =
        acceptedTransferCapabilities == null
            ? defaultAcceptedTransferCapabilities()
            : acceptedTransferCapabilities;
  }

  private static List<AcceptedTransferCapability> defaultAcceptedTransferCapabilities() {
    List<String> storageTransferSyntaxes =
        List.of(UID.ImplicitVRLittleEndian, UID.ExplicitVRLittleEndian);
    return List.of(
        new AcceptedTransferCapability(UID.Verification, List.of(UID.ImplicitVRLittleEndian)),
        new AcceptedTransferCapability(UID.SecondaryCaptureImageStorage, storageTransferSyntaxes),
        new AcceptedTransferCapability(UID.ComputedRadiographyImageStorage, storageTransferSyntaxes),
        new AcceptedTransferCapability(UID.DigitalXRayImageStorageForPresentation, storageTransferSyntaxes),
        new AcceptedTransferCapability(
            UID.DigitalMammographyXRayImageStorageForPresentation, storageTransferSyntaxes),
        new AcceptedTransferCapability(UID.UltrasoundImageStorage, storageTransferSyntaxes),
        new AcceptedTransferCapability(UID.MRImageStorage, storageTransferSyntaxes),
        new AcceptedTransferCapability(UID.EnhancedMRImageStorage, storageTransferSyntaxes),
        new AcceptedTransferCapability(UID.CTImageStorage, storageTransferSyntaxes),
        new AcceptedTransferCapability(UID.EnhancedCTImageStorage, storageTransferSyntaxes));
  }

  public static class AcceptedTransferCapability {

    private String sopClassUid;
    private List<String> transferSyntaxUids = new ArrayList<>();

    public AcceptedTransferCapability() {}

    public AcceptedTransferCapability(String sopClassUid, List<String> transferSyntaxUids) {
      this.sopClassUid = sopClassUid;
      this.transferSyntaxUids = transferSyntaxUids == null ? List.of() : List.copyOf(transferSyntaxUids);
    }

    public String getSopClassUid() {
      return sopClassUid;
    }

    public void setSopClassUid(String sopClassUid) {
      this.sopClassUid = sopClassUid;
    }

    public List<String> getTransferSyntaxUids() {
      return transferSyntaxUids;
    }

    public void setTransferSyntaxUids(List<String> transferSyntaxUids) {
      this.transferSyntaxUids = transferSyntaxUids == null ? List.of() : transferSyntaxUids;
    }
  }
}
