package pt.ua.dicooglenext.protocol.dimse;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.data.VR;
import org.dcm4che3.net.ApplicationEntity;
import org.dcm4che3.net.Association;
import org.dcm4che3.net.Connection;
import org.dcm4che3.net.Device;
import org.dcm4che3.net.PDVInputStream;
import org.dcm4che3.net.TransferCapability;
import org.dcm4che3.net.pdu.PresentationContext;
import org.dcm4che3.net.service.BasicCEchoSCP;
import org.dcm4che3.net.service.BasicCStoreSCP;
import org.dcm4che3.net.service.DicomServiceException;
import org.dcm4che3.net.service.DicomServiceRegistry;
import org.springframework.context.SmartLifecycle;

public class DimseCStoreServer implements SmartLifecycle {

  private final CStoreService cStoreService;
  private final DimseCStoreProperties properties;
  private final String primaryStorageScheme;

  private volatile boolean running;
  private Device device;
  private ExecutorService executor;
  private ScheduledExecutorService scheduler;

  public DimseCStoreServer(
      CStoreService cStoreService, DimseCStoreProperties properties, String primaryStorageScheme) {
    this.cStoreService = Objects.requireNonNull(cStoreService);
    this.properties = Objects.requireNonNull(properties);
    this.primaryStorageScheme =
        primaryStorageScheme == null || primaryStorageScheme.isBlank()
            ? "file"
            : primaryStorageScheme;
  }

  @Override
  public synchronized void start() {
    if (!properties.isEnabled() || running) {
      return;
    }

    this.executor = Executors.newCachedThreadPool();
    this.scheduler = Executors.newSingleThreadScheduledExecutor();

    Device device = new Device("dicoogle-next-cstore-scp");
    device.setExecutor(executor);
    device.setScheduledExecutor(scheduler);

    ApplicationEntity ae = new ApplicationEntity(properties.getAeTitle());
    ae.setAssociationAcceptor(true);

    Connection connection = new Connection();
    connection.setHostname(properties.getBindAddress());
    connection.setPort(properties.getPort());

    device.addConnection(connection);
    device.addApplicationEntity(ae);
    ae.addConnection(connection);

    ae.addTransferCapability(
        new TransferCapability("cstore-scp", "*", TransferCapability.Role.SCP, "*"));
    ae.addTransferCapability(
        new TransferCapability(
            "verification-scp",
            UID.Verification,
            TransferCapability.Role.SCP,
            UID.ImplicitVRLittleEndian));

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
                        targetScheme,
                        data.readAllBytes(),
                        "application/dicom",
                        as.getCallingAET(),
                        as.getCalledAET()));

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
      throw new IllegalStateException("Failed to start DIMSE C-STORE server", ex);
    }
  }

  @Override
  public synchronized void stop() {
    if (!running) {
      return;
    }

    try {
      if (device != null) {
        device.unbindConnections();
      }
    } finally {
      running = false;
      device = null;
      shutdownExecutors();
    }
  }

  @Override
  public boolean isRunning() {
    return running;
  }

  @Override
  public boolean isAutoStartup() {
    return properties.isEnabled();
  }

  @Override
  public int getPhase() {
    return Integer.MAX_VALUE;
  }

  @Override
  public synchronized void stop(Runnable callback) {
    stop();
    callback.run();
  }

  private void shutdownExecutors() {
    if (executor != null) {
      executor.shutdownNow();
      executor = null;
    }
    if (scheduler != null) {
      scheduler.shutdownNow();
      scheduler = null;
    }
  }
}
