package org.dicoogle.app.settings;

import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.dicoogle.protocol.dimse.DimseCMoveProperties;
import org.dicoogle.protocol.dimse.DimseCStoreProperties;
import org.dicoogle.protocol.dimse.DimseCStoreServer;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

@Service
public class RuntimeSettingsService {

  private final SettingsStore store;
  private final DimseCStoreProperties cstoreProperties;
  private final DimseCMoveProperties moveProperties;
  private final ObjectProvider<DimseCStoreServer> cstoreServerProvider;
  private final AtomicReference<RuntimeSettings> cached = new AtomicReference<>();

  public RuntimeSettingsService(
      SettingsStore store,
      DimseCStoreProperties cstoreProperties,
      DimseCMoveProperties moveProperties,
      ObjectProvider<DimseCStoreServer> cstoreServerProvider) {
    this.store = store;
    this.cstoreProperties = cstoreProperties;
    this.moveProperties = moveProperties;
    this.cstoreServerProvider = cstoreServerProvider;

    RuntimeSettings settings = store.load();
    if (settings == null) {
      settings = RuntimeSettings.fromProperties(cstoreProperties, moveProperties);
      store.save(settings);
    }
    cached.set(settings);
    apply(settings);
  }

  public RuntimeSettings getCurrent() {
    return cached.get();
  }

  public synchronized RuntimeSettings updateCStore(
      Integer port, String hostname, Boolean autostart, Boolean running) {
    RuntimeSettings settings = cloneSettings(cached.get());
    RuntimeSettings.DimseCStoreSettings cstore = settings.getDimse().getCstore();

    if (port != null) {
      validatePort(port);
      cstore.setPort(port);
    }
    if (hostname != null) {
      cstore.setBindAddress(hostname);
    }
    if (autostart != null) {
      cstore.setEnabled(autostart);
    }
    if (running != null) {
      cstore.setEnabled(running);
    }
    saveAndApply(settings);
    return settings;
  }

  public synchronized RuntimeSettings updateAETitle(String aeTitle) {
    if (aeTitle == null || aeTitle.isBlank()) {
      throw new IllegalArgumentException("aetitle must not be empty");
    }
    RuntimeSettings settings = cloneSettings(cached.get());
    settings.getDimse().getCstore().setAeTitle(aeTitle.trim());
    saveAndApply(settings);
    return settings;
  }

  public synchronized RuntimeSettings updateQueryRetrieveSettings(
      Integer responseTimeout,
      Integer connectionTimeout,
      Integer idleTimeout,
      Integer acceptTimeout,
      Integer maxPduSend,
      Integer maxPduReceive,
      Integer maxAssociations) {
    RuntimeSettings settings = cloneSettings(cached.get());
    RuntimeSettings.DicomQueryRetrieveSettings qr = settings.getDimse().getQueryRetrieve();
    if (responseTimeout != null) {
      qr.setResponseTimeout(responseTimeout);
    }
    if (connectionTimeout != null) {
      qr.setConnectionTimeout(connectionTimeout);
    }
    if (idleTimeout != null) {
      qr.setIdleTimeout(idleTimeout);
    }
    if (acceptTimeout != null) {
      qr.setAcceptTimeout(acceptTimeout);
    }
    if (maxPduSend != null) {
      qr.setMaxPduSend(maxPduSend);
    }
    if (maxPduReceive != null) {
      qr.setMaxPduReceive(maxPduReceive);
    }
    if (maxAssociations != null) {
      qr.setMaxAssociations(maxAssociations);
    }
    saveAndApply(settings);
    return settings;
  }

  public synchronized RuntimeSettings addMoveDestination(
      String aeTitle, String host, int port, boolean isPublic, String description) {
    if (aeTitle == null || aeTitle.isBlank()) {
      throw new IllegalArgumentException("aetitle must not be empty");
    }
    if (host == null || host.isBlank()) {
      throw new IllegalArgumentException("host must not be empty");
    }
    validatePort(port);

    RuntimeSettings settings = cloneSettings(cached.get());
    RuntimeSettings.MoveDestinationSetting setting = new RuntimeSettings.MoveDestinationSetting();
    setting.setAeTitle(aeTitle.trim());
    setting.setHost(host.trim());
    setting.setPort(port);
    setting.setPublic(isPublic);
    setting.setDescription(description == null ? null : description.trim());
    settings.getDimse().getMoveDestinations().put(setting.getAeTitle(), setting);
    saveAndApply(settings);
    return settings;
  }

  public synchronized RuntimeSettings removeMoveDestination(String aeTitle) {
    RuntimeSettings settings = cloneSettings(cached.get());
    settings.getDimse().getMoveDestinations().remove(aeTitle);
    saveAndApply(settings);
    return settings;
  }

  public boolean isCStoreRunning() {
    DimseCStoreServer server = cstoreServerProvider.getIfAvailable();
    return server != null && server.isRunning();
  }

  private void saveAndApply(RuntimeSettings settings) {
    store.save(settings);
    cached.set(settings);
    apply(settings);
  }

  private void apply(RuntimeSettings settings) {
    RuntimeSettings.DimseCStoreSettings cstore = settings.getDimse().getCstore();
    cstoreProperties.setEnabled(cstore.isEnabled());
    cstoreProperties.setPort(cstore.getPort());
    cstoreProperties.setBindAddress(cstore.getBindAddress());
    cstoreProperties.setAeTitle(cstore.getAeTitle());
    cstoreProperties.setStorageScheme(cstore.getStorageScheme());

    Map<String, DimseCMoveProperties.Destination> destinations = new java.util.LinkedHashMap<>();
    for (RuntimeSettings.MoveDestinationSetting setting :
        settings.getDimse().getMoveDestinations().values()) {
      DimseCMoveProperties.Destination dest = new DimseCMoveProperties.Destination();
      dest.setHost(setting.getHost());
      dest.setPort(setting.getPort());
      dest.setAeTitle(setting.getAeTitle());
      destinations.put(setting.getAeTitle(), dest);
    }
    moveProperties.setDestinations(destinations);

    DimseCStoreServer server = cstoreServerProvider.getIfAvailable();
    if (server == null) {
      return;
    }

    if (cstore.isEnabled()) {
      if (!server.isRunning()) {
        server.start();
      } else {
        server.stop();
        server.start();
      }
    } else if (server.isRunning()) {
      server.stop();
    }
  }

  private RuntimeSettings cloneSettings(RuntimeSettings source) {
    if (source == null) {
      return new RuntimeSettings();
    }
    RuntimeSettings copy = new RuntimeSettings();
    RuntimeSettings.DimseSettings dimse = new RuntimeSettings.DimseSettings();
    RuntimeSettings.DimseCStoreSettings cstore = new RuntimeSettings.DimseCStoreSettings();

    RuntimeSettings.DimseCStoreSettings original = source.getDimse().getCstore();
    cstore.setEnabled(original.isEnabled());
    cstore.setAeTitle(original.getAeTitle());
    cstore.setBindAddress(original.getBindAddress());
    cstore.setPort(original.getPort());
    cstore.setStorageScheme(original.getStorageScheme());
    dimse.setCstore(cstore);

    RuntimeSettings.DicomQueryRetrieveSettings origQr = source.getDimse().getQueryRetrieve();
    RuntimeSettings.DicomQueryRetrieveSettings qr =
        new RuntimeSettings.DicomQueryRetrieveSettings();
    if (origQr != null) {
      qr.setResponseTimeout(origQr.getResponseTimeout());
      qr.setConnectionTimeout(origQr.getConnectionTimeout());
      qr.setIdleTimeout(origQr.getIdleTimeout());
      qr.setAcceptTimeout(origQr.getAcceptTimeout());
      qr.setMaxPduSend(origQr.getMaxPduSend());
      qr.setMaxPduReceive(origQr.getMaxPduReceive());
      qr.setMaxAssociations(origQr.getMaxAssociations());
    }
    dimse.setQueryRetrieve(qr);

    Map<String, RuntimeSettings.MoveDestinationSetting> destinations =
        new java.util.LinkedHashMap<>();
    for (Map.Entry<String, RuntimeSettings.MoveDestinationSetting> entry :
        source.getDimse().getMoveDestinations().entrySet()) {
      RuntimeSettings.MoveDestinationSetting originalDest = entry.getValue();
      RuntimeSettings.MoveDestinationSetting copyDest =
          new RuntimeSettings.MoveDestinationSetting();
      copyDest.setAeTitle(originalDest.getAeTitle());
      copyDest.setHost(originalDest.getHost());
      copyDest.setPort(originalDest.getPort());
      copyDest.setPublic(originalDest.isPublic());
      copyDest.setDescription(originalDest.getDescription());
      destinations.put(entry.getKey(), copyDest);
    }
    dimse.setMoveDestinations(destinations);
    copy.setDimse(dimse);
    return copy;
  }

  private void validatePort(int port) {
    if (port <= 0 || port > 65535) {
      throw new IllegalArgumentException("port must be a valid TCP port");
    }
  }
}
