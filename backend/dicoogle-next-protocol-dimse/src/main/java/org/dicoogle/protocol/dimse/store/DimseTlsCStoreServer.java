package org.dicoogle.protocol.dimse.store;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.Executors;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dcm4che3.net.ApplicationEntity;
import org.dcm4che3.net.Association;
import org.dcm4che3.net.Connection;
import org.dcm4che3.net.Device;
import org.dcm4che3.net.PDVInputStream;
import org.dcm4che3.net.pdu.PresentationContext;
import org.dcm4che3.net.service.BasicCEchoSCP;
import org.dcm4che3.net.service.BasicCStoreSCP;
import org.dcm4che3.net.service.DicomServiceException;
import org.dcm4che3.net.service.DicomServiceRegistry;
import org.dicoogle.protocol.dimse.DicomTls;
import org.dicoogle.protocol.dimse.DimseTlsProperties;
import org.dicoogle.sdk.query.DimseAccessPolicy;
import org.dicoogle.sdk.query.DimseAssociationEventListener;
import org.dicoogle.sdk.storage.DimseAssociationAcceptedEvent;

/** DIMSE Store server (with TLS) */
public class DimseTlsCStoreServer extends BaseDimseCStoreServer {

  private final DimseTlsProperties tlsProperties;
  private final DimseTlsCStoreProperties tlsCstoreProperties;

  public DimseTlsCStoreServer(
      CStoreService cStoreService,
      DimseTlsProperties tlsProperties,
      DimseCStoreProperties cstoreProperties,
      DimseTlsCStoreProperties tlsCstoreProperties,
      String primaryStorageScheme,
      List<DimseAssociationEventListener> associationEventListeners,
      List<DimseAccessPolicy<DimseAssociationAcceptedEvent>> associationAccessPolicies) {
    super(cStoreService, cstoreProperties, primaryStorageScheme);
    this.tlsProperties = Objects.requireNonNull(tlsProperties);
    this.tlsCstoreProperties = Objects.requireNonNull(tlsCstoreProperties);
  }

  @Override
  public synchronized void start() {
    if (!tlsCstoreProperties.isEnabled() || running) {
      return;
    }

    this.executor = Executors.newCachedThreadPool();
    this.scheduler = Executors.newSingleThreadScheduledExecutor();

    Device device = new Device("dicoogle-next-cstore-scp-tls");
    device.setExecutor(executor);
    device.setScheduledExecutor(scheduler);
    device.setAssociationMonitor(new MonitoringAssociationBridge());

    // fetch server parameters with fallback
    String aeTitle = tlsCstoreProperties.getAeTitle();
    if (aeTitle == null) {
      aeTitle = properties.getAeTitle();
    }
    String bindAddress = tlsCstoreProperties.getBindAddress();
    if (bindAddress == null) {
      bindAddress = properties.getBindAddress();
    }

    ApplicationEntity ae = new ApplicationEntity(aeTitle);
    ae.setAssociationAcceptor(true);

    Connection connection = new Connection();
    connection.setHostname(bindAddress);
    connection.setPort(tlsCstoreProperties.getPort());

    // set up TLS
    DicomTls.configureTls(device, connection, tlsProperties);

    device.addConnection(connection);
    device.addApplicationEntity(ae);
    ae.addConnection(connection);

    configureTransferCapabilities(ae, properties);

    DicomServiceRegistry services = new DicomServiceRegistry();
    services.addDicomService(new BasicCEchoSCP());
    services.addDicomService(
        new BasicCStoreSCP("*") {
          @Override
          protected void store(
              Association as,
              PresentationContext pc,
              Attributes rq,
              PDVInputStream data,
              Attributes rsp)
              throws IOException {
            String targetScheme =
                properties.getStorageScheme() == null || properties.getStorageScheme().isBlank()
                    ? primaryStorageScheme
                    : properties.getStorageScheme();

            CStoreResult result =
                cStoreService.store(
                    new CStoreRequest(
                        as.getSerialNo(),
                        targetScheme,
                        data,
                        "application/dicom",
                        as.getCallingAET(),
                        as.getCalledAET(),
                        rq.getString(Tag.AffectedSOPClassUID),
                        rq.getString(Tag.AffectedSOPInstanceUID),
                        pc.getTransferSyntax()));

            rsp.setInt(Tag.Status, VR.US, result.status());
            if (result.status() != CStoreDimseStatus.SUCCESS) {
              throw new DicomServiceException(result.status(), result.detail());
            }
          }
        });
    ae.setDimseRQHandler(services);

    try {
      device.bindConnections();
      this.device = device;
      this.running = true;
    } catch (IOException | GeneralSecurityException ex) {
      shutdownExecutors();
      throw new IllegalStateException("Failed to start DIMSE TLS C-STORE server", ex);
    }
  }

  @Override
  public boolean isAutoStartup() {
    return tlsCstoreProperties.isEnabled();
  }
}
