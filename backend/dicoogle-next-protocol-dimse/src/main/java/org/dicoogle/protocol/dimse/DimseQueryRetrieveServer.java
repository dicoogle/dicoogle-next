package org.dicoogle.protocol.dimse;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.EnumSet;
import java.util.concurrent.Executors;
import org.dcm4che3.data.UID;
import org.dcm4che3.net.ApplicationEntity;
import org.dcm4che3.net.Connection;
import org.dcm4che3.net.Device;
import org.dcm4che3.net.QueryOption;
import org.dcm4che3.net.TransferCapability;
import org.dcm4che3.net.service.BasicCEchoSCP;
import org.dcm4che3.net.service.DicomServiceRegistry;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.protocol.legacyproxy.LegacyProxyService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;

public class DimseQueryRetrieveServer implements SmartLifecycle {

  private static final Logger LOGGER = LoggerFactory.getLogger(DimseQueryRetrieveServer.class);

  private static final String STUDY_ROOT_FIND_UID = "1.2.840.10008.5.1.4.1.2.2.1";
  private static final String STUDY_ROOT_MOVE_UID = "1.2.840.10008.5.1.4.1.2.2.2";

  private final CFindService cFindService;
  private final CMoveService cMoveService;
  private final StorageRouter storageRouter;
  private final DimseQueryRetrieveProperties properties;
  private final DimseCStoreProperties cStoreProperties;
  private final LegacyProxyService legacyProxyService;

  private volatile boolean running;
  private Device device;
  private java.util.concurrent.ExecutorService executor;
  private java.util.concurrent.ScheduledExecutorService scheduler;

  public DimseQueryRetrieveServer(
      CFindService cFindService,
      CMoveService cMoveService,
      StorageRouter storageRouter,
      DimseQueryRetrieveProperties properties,
      DimseCStoreProperties cStoreProperties,
      LegacyProxyService legacyProxyService) {
    this.cFindService = cFindService;
    this.cMoveService = cMoveService;
    this.storageRouter = storageRouter;
    this.properties = properties;
    this.cStoreProperties = cStoreProperties;
    this.legacyProxyService = legacyProxyService;
  }

  @Override
  public synchronized void start() {
    if (!properties.isEnabled() || running) {
      return;
    }

    LOGGER.info(
        "Starting DICOM Query-Retrieve server on {}:{}",
        properties.getBindAddress(),
        properties.getPort());

    this.executor = Executors.newCachedThreadPool();
    this.scheduler = Executors.newSingleThreadScheduledExecutor();

    Device device = new Device("dicoogle-next-query-retrieve-scp");
    device.setExecutor(executor);
    device.setScheduledExecutor(scheduler);

    ApplicationEntity ae = new ApplicationEntity(properties.getAeTitle());
    ae.setAssociationAcceptor(true);

    Connection connection = new Connection();
    connection.setHostname(properties.getBindAddress());
    connection.setPort(properties.getPort());
    connection.setAcceptTimeout(properties.getAcceptTimeout());
    connection.setConnectTimeout(properties.getConnectTimeout());

    device.addConnection(connection);
    device.addApplicationEntity(ae);
    ae.addConnection(connection);

    configureTransferCapabilities(ae);

    DicomServiceRegistry services = new DicomServiceRegistry();
    services.addDicomService(new BasicCEchoSCP());
    services.addDicomService(new DimseCFindSCP(cFindService));
    services.addDicomService(
        new DimseCMoveSCP(cMoveService, storageRouter, cStoreProperties, legacyProxyService));
    ae.setDimseRQHandler(services);

    try {
      device.bindConnections();
      this.device = device;
      this.running = true;
      LOGGER.info("DICOM Query-Retrieve server started on port {}", properties.getPort());
    } catch (IOException | GeneralSecurityException ex) {
      shutdownExecutors();
      throw new IllegalStateException("Failed to start DICOM Query-Retrieve server", ex);
    }
  }

  @Override
  public synchronized void stop() {
    if (!running) {
      return;
    }

    LOGGER.info("Stopping DICOM Query-Retrieve server");

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

  private void configureTransferCapabilities(ApplicationEntity ae) {
    TransferCapability cfindTc =
        new TransferCapability(
            "cfind-study-root-scp",
            STUDY_ROOT_FIND_UID,
            TransferCapability.Role.SCP,
            UID.ImplicitVRLittleEndian,
            UID.ExplicitVRLittleEndian);
    cfindTc.setQueryOptions(EnumSet.of(QueryOption.DATETIME, QueryOption.FUZZY));
    ae.addTransferCapability(cfindTc);

    ae.addTransferCapability(
        new TransferCapability(
            "cmove-study-root-scp",
            STUDY_ROOT_MOVE_UID,
            TransferCapability.Role.SCP,
            UID.ImplicitVRLittleEndian,
            UID.ExplicitVRLittleEndian));

    ae.addTransferCapability(
        new TransferCapability(
            "verification-scp",
            UID.Verification,
            TransferCapability.Role.SCP,
            UID.ImplicitVRLittleEndian));
  }
}
