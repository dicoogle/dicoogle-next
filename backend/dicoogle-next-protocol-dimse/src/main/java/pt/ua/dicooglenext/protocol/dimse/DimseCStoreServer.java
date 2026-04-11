package org.dicoogle.protocol.dimse;

import java.io.IOException;
import java.time.Instant;
import java.security.GeneralSecurityException;
import java.util.List;
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
import org.dcm4che3.net.AssociationMonitor;
import org.dcm4che3.net.Connection;
import org.dcm4che3.net.Device;
import org.dcm4che3.net.PDVInputStream;
import org.dcm4che3.net.TransferCapability;
import org.dcm4che3.net.pdu.AAssociateRJ;
import org.dcm4che3.net.pdu.PresentationContext;
import org.dcm4che3.net.service.BasicCEchoSCP;
import org.dcm4che3.net.service.BasicCStoreSCP;
import org.dcm4che3.net.service.DicomServiceException;
import org.dcm4che3.net.service.DicomServiceRegistry;
import org.springframework.context.SmartLifecycle;
import org.dicoogle.sdk.query.DimseAssociationAccessPolicy;
import org.dicoogle.sdk.query.DimseAssociationEventListener;
import org.dicoogle.sdk.storage.DimseAssociationAcceptedEvent;
import org.dicoogle.sdk.storage.DimseAssociationClosedEvent;
import org.dicoogle.sdk.storage.DimseAssociationFailedEvent;
import org.dicoogle.sdk.storage.DimseAssociationRejectedEvent;

public class DimseCStoreServer implements SmartLifecycle {

  private final CStoreService cStoreService;
  private final DimseCStoreProperties properties;
  private final String primaryStorageScheme;
  private final List<DimseAssociationEventListener> associationEventListeners;
  private final List<DimseAssociationAccessPolicy> associationAccessPolicies;

  private volatile boolean running;
  private Device device;
  private ExecutorService executor;
  private ScheduledExecutorService scheduler;

  public DimseCStoreServer(
      CStoreService cStoreService, DimseCStoreProperties properties, String primaryStorageScheme) {
    this(cStoreService, properties, primaryStorageScheme, List.of(), List.of());
  }

  public DimseCStoreServer(
      CStoreService cStoreService,
      DimseCStoreProperties properties,
      String primaryStorageScheme,
      List<DimseAssociationEventListener> associationEventListeners,
      List<DimseAssociationAccessPolicy> associationAccessPolicies) {
    this.cStoreService = Objects.requireNonNull(cStoreService);
    this.properties = Objects.requireNonNull(properties);
    this.primaryStorageScheme =
        primaryStorageScheme == null || primaryStorageScheme.isBlank()
            ? "file"
            : primaryStorageScheme;
    this.associationEventListeners = List.copyOf(associationEventListeners);
    this.associationAccessPolicies = List.copyOf(associationAccessPolicies);
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
    device.setAssociationMonitor(new MonitoringAssociationBridge());

    ApplicationEntity ae = new ApplicationEntity(properties.getAeTitle());
    ae.setAssociationAcceptor(true);

    Connection connection = new Connection();
    connection.setHostname(properties.getBindAddress());
    connection.setPort(properties.getPort());

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
                        data.readAllBytes(),
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

  private void configureTransferCapabilities(ApplicationEntity ae, DimseCStoreProperties properties) {
    int index = 0;
    for (DimseCStoreProperties.AcceptedTransferCapability capability :
        properties.getAcceptedTransferCapabilities()) {
      if (capability.getSopClassUid() == null
          || capability.getSopClassUid().isBlank()
          || capability.getTransferSyntaxUids().isEmpty()) {
        continue;
      }

      ae.addTransferCapability(
          new TransferCapability(
              "configured-scp-" + index++,
              capability.getSopClassUid(),
              TransferCapability.Role.SCP,
              capability.getTransferSyntaxUids().toArray(String[]::new)));
    }

    boolean hasVerification =
        properties.getAcceptedTransferCapabilities().stream()
            .anyMatch(c -> UID.Verification.equals(c.getSopClassUid()));
    if (!hasVerification) {
      ae.addTransferCapability(
          new TransferCapability(
              "verification-scp",
              UID.Verification,
              TransferCapability.Role.SCP,
              UID.ImplicitVRLittleEndian));
    }
  }

  public synchronized void applyAcceptedTransferCapabilities(
      List<DimseCStoreProperties.AcceptedTransferCapability> acceptedTransferCapabilities) {
    properties.setAcceptedTransferCapabilities(acceptedTransferCapabilities);
    if (!running) {
      return;
    }

    stop();
    start();
  }

  public synchronized List<DimseCStoreProperties.AcceptedTransferCapability>
      acceptedTransferCapabilities() {
    return List.copyOf(properties.getAcceptedTransferCapabilities());
  }

  private final class MonitoringAssociationBridge implements AssociationMonitor {

    @Override
    public void onAssociationEstablished(Association association) {
      DimseAssociationAcceptedEvent event = acceptedEvent(association);

      String rejectionReason = checkAccessPolicies(event);
      if (rejectionReason != null) {
        association.abort();
        emitAssociationRejected(association, rejectionReason);
        return;
      }

      association.addAssociationListener(
          as ->
              emitAssociationClosed(
                  new DimseAssociationClosedEvent(
                      as.getSerialNo(),
                      as.getCallingAET(),
                      as.getCalledAET(),
                      as.getRemoteHostName(),
                      as.getLocalHostName(),
                      Instant.now().toString())));
      associationEventListeners.forEach(listener -> listener.onAssociationAccepted(event));
    }

    @Override
    public void onAssociationFailed(Association association, Throwable throwable) {
      DimseAssociationFailedEvent event =
          new DimseAssociationFailedEvent(
              association.getSerialNo(),
              association.getCallingAET(),
              association.getCalledAET(),
              association.getRemoteHostName(),
              association.getLocalHostName(),
              throwable == null ? "association failed" : throwable.getMessage(),
              Instant.now().toString());
      associationEventListeners.forEach(listener -> listener.onAssociationFailed(event));
    }

    @Override
    public void onAssociationRejected(Association association, AAssociateRJ reject) {
      emitAssociationRejected(
          association,
          reject == null
              ? "association rejected"
              : "result=%d source=%d reason=%d"
                  .formatted(reject.getResult(), reject.getSource(), reject.getReason()));
    }

    @Override
    public void onAssociationAccepted(Association association) {
      // no-op
    }
  }

  private DimseAssociationAcceptedEvent acceptedEvent(Association association) {
    return new DimseAssociationAcceptedEvent(
        association.getSerialNo(),
        association.getCallingAET(),
        association.getCalledAET(),
        association.getRemoteHostName(),
        association.getLocalHostName(),
        Instant.now().toString());
  }

  private String checkAccessPolicies(DimseAssociationAcceptedEvent event) {
    for (DimseAssociationAccessPolicy policy : associationAccessPolicies) {
      DimseAssociationAccessPolicy.Decision decision = policy.evaluate(event);
      if (!decision.allowed()) {
        return decision.reason();
      }
    }
    return null;
  }

  private void emitAssociationRejected(Association association, String reason) {
    DimseAssociationRejectedEvent event =
        new DimseAssociationRejectedEvent(
            association.getSerialNo(),
            association.getCallingAET(),
            association.getCalledAET(),
            association.getRemoteHostName(),
            association.getLocalHostName(),
            reason,
            Instant.now().toString());
    associationEventListeners.forEach(listener -> listener.onAssociationRejected(event));
  }

  private void emitAssociationClosed(DimseAssociationClosedEvent event) {
    associationEventListeners.forEach(listener -> listener.onAssociationClosed(event));
  }
}
