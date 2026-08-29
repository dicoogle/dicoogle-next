package org.dicoogle.protocol.dimse;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Objects;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomInputStream;
import org.dcm4che3.io.DicomOutputStream;
import org.dicoogle.core.storage.NoWritableStoragePluginException;
import org.dicoogle.core.storage.StoragePluginNotFoundException;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.protocol.legacyproxy.LegacyProxyService;
import org.dicoogle.protocol.legacyproxy.config.LegacyProxyProperties;
import org.dicoogle.sdk.query.StorageIngestEventListener;
import org.dicoogle.sdk.storage.StorageIngestFailureEvent;
import org.dicoogle.sdk.storage.StorageIngestSuccessEvent;
import org.dicoogle.sdk.storage.StoredObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CStoreService {

  private static final Logger LOGGER = LoggerFactory.getLogger(CStoreService.class);

  private final StorageRouter storageRouter;
  private final List<StorageIngestEventListener> listeners;
  private final MeterRegistry meterRegistry;
  private final LegacyProxyService legacyProxyService;
  private final LegacyProxyProperties legacyProxyProperties;

  public CStoreService(StorageRouter storageRouter) {
    this(storageRouter, List.of(), null, null, null);
  }

  public CStoreService(StorageRouter storageRouter, List<StorageIngestEventListener> listeners) {
    this(storageRouter, listeners, null, null, null);
  }

  public CStoreService(
      StorageRouter storageRouter,
      List<StorageIngestEventListener> listeners,
      MeterRegistry meterRegistry) {
    this(storageRouter, listeners, meterRegistry, null, null);
  }

  public CStoreService(
      StorageRouter storageRouter,
      List<StorageIngestEventListener> listeners,
      MeterRegistry meterRegistry,
      LegacyProxyService legacyProxyService) {
    this(storageRouter, listeners, meterRegistry, legacyProxyService, null);
  }

  public CStoreService(
      StorageRouter storageRouter,
      List<StorageIngestEventListener> listeners,
      MeterRegistry meterRegistry,
      LegacyProxyService legacyProxyService,
      LegacyProxyProperties legacyProxyProperties) {
    this.storageRouter = Objects.requireNonNull(storageRouter);
    this.listeners = List.copyOf(Objects.requireNonNull(listeners));
    this.meterRegistry = meterRegistry;
    this.legacyProxyService = legacyProxyService;
    this.legacyProxyProperties = legacyProxyProperties;
  }

  public CStoreResult store(CStoreRequest request) {
    long startNs = System.nanoTime();

    String scheme =
        request.storageScheme() == null || request.storageScheme().isBlank()
            ? "file"
            : request.storageScheme();

    increment("dicoogle.cstore.requests", scheme);

    if (request.payload() == null || request.payload().length == 0) {
      CStoreResult result = CStoreResult.cannotUnderstand("Received empty C-STORE payload");
      recordOutcome("failure", scheme, startNs);
      return result;
    }

    CStoreIdentifiers identifiers = extractIdentifiers(request.payload());
    if (identifiers == null) {
      CStoreResult result =
          CStoreResult.cannotUnderstand("Missing required DICOM identifiers for C-STORE");
      emitIngestFailure(request, null, result, scheme);
      recordOutcome("failure", scheme, startNs);
      return result;
    }

    String affectedSopClassUid = request.affectedSopClassUid();
    String transferSyntaxUid = request.transferSyntaxUid();
    if (!isPresent(affectedSopClassUid)) {
      affectedSopClassUid = identifiers.sopClassUid();
    }
    if (!isPresent(transferSyntaxUid)) {
      transferSyntaxUid = UID.ImplicitVRLittleEndian;
    }

    if (!affectedSopClassUid.equals(identifiers.sopClassUid())) {
      CStoreResult result =
          CStoreResult.cannotUnderstand(
              "Affected SOP Class UID does not match dataset SOP Class UID", identifiers);
      emitIngestFailure(request, identifiers, result, scheme);
      increment("dicoogle.cstore.failure", scheme);
      recordOutcome("failure", scheme, startNs);
      return result;
    }

    if (isPresent(request.affectedSopInstanceUid())
        && !request.affectedSopInstanceUid().equals(identifiers.sopInstanceUid())) {
      CStoreResult result =
          CStoreResult.cannotUnderstand(
              "Affected SOP Instance UID does not match dataset SOP Instance UID", identifiers);
      emitIngestFailure(request, identifiers, result, scheme);
      increment("dicoogle.cstore.failure", scheme);
      recordOutcome("failure", scheme, startNs);
      return result;
    }

    Path normalizedFile;
    try {
      normalizedFile = normalizeToPs310(request.payload(), affectedSopClassUid, transferSyntaxUid);
    } catch (IOException ex) {
      CStoreResult result =
          CStoreResult.cannotUnderstand(
              "Failed to create a PS3.10 DICOM file payload", identifiers);
      emitIngestFailure(request, identifiers, result, scheme);
      increment("dicoogle.cstore.failure", scheme);
      recordOutcome("failure", scheme, startNs);
      return result;
    }

    try {
      var plugin = storageRouter.requireWritable(scheme);
      long fileSize = Files.size(normalizedFile);
      StoredObject stored;
      try (InputStream fileStream = Files.newInputStream(normalizedFile)) {
        stored = plugin.store(fileStream, request.contentType());
      }
      CStoreResult result = CStoreResult.success(identifiers, stored.location());
      LOGGER.info(
          "C-STORE stored: callingAET={}, calledAET={}, studyUID={}, seriesUID={}, sopUID={}, scheme={}, location={}",
          nullSafe(request.callingAet()),
          nullSafe(request.calledAet()),
          identifiers.studyInstanceUid(),
          identifiers.seriesInstanceUid(),
          identifiers.sopInstanceUid(),
          scheme,
          stored.location());
      emitIngestSuccess(request, identifiers, stored, scheme);
      increment("dicoogle.cstore.success", scheme);
      recordOutcome("success", scheme, startNs);
      return result;
    } catch (NoWritableStoragePluginException | StoragePluginNotFoundException ex) {
      if (legacyProxyService != null
          && legacyProxyProperties != null
          && legacyProxyProperties.shouldUseLegacyForStorageRetrieve(false)) {
        try {
          LOGGER.info(
              "C-STORE no local writable provider, falling back to legacy: callingAET={}, calledAET={}, studyUID={}, seriesUID={}, sopUID={}, scheme={}",
              nullSafe(request.callingAet()),
              nullSafe(request.calledAet()),
              identifiers.studyInstanceUid(),
              identifiers.seriesInstanceUid(),
              identifiers.sopInstanceUid(),
              scheme);
          byte[] legacyPayload = Files.readAllBytes(normalizedFile);
          URI legacyUri = legacyProxyService.postStorage(legacyPayload);
          if (legacyUri != null) {
            CStoreResult result = CStoreResult.success(identifiers, legacyUri);
            emitIngestSuccess(
                request,
                identifiers,
                new StoredObject(legacyUri, legacyPayload.length, "application/dicom"),
                scheme);
            increment("dicoogle.cstore.success", scheme);
            recordOutcome("success", scheme, startNs);
            LOGGER.info(
                "C-STORE stored via legacy fallback: callingAET={}, calledAET={}, studyUID={}, seriesUID={}, sopUID={}, scheme={}, location={}",
                nullSafe(request.callingAet()),
                nullSafe(request.calledAet()),
                identifiers.studyInstanceUid(),
                identifiers.seriesInstanceUid(),
                identifiers.sopInstanceUid(),
                scheme,
                legacyUri);
            return result;
          }
          LOGGER.warn("C-STORE legacy fallback returned null URI");
        } catch (Exception fallbackEx) {
          LOGGER.error("C-STORE legacy fallback failed", fallbackEx);
        }
      }

      CStoreResult result = CStoreResult.noWritableProvider(scheme);
      LOGGER.warn(
          "C-STORE rejected (no writable provider): callingAET={}, calledAET={}, studyUID={}, seriesUID={}, sopUID={}, scheme={}",
          nullSafe(request.callingAet()),
          nullSafe(request.calledAet()),
          identifiers.studyInstanceUid(),
          identifiers.seriesInstanceUid(),
          identifiers.sopInstanceUid(),
          scheme);
      emitIngestFailure(request, identifiers, result, scheme);
      increment("dicoogle.cstore.failure", scheme);
      recordOutcome("failure", scheme, startNs);
      return result;
    } catch (IOException | RuntimeException ex) {
      CStoreResult result =
          CStoreResult.cannotUnderstand("Failed to persist C-STORE payload", identifiers);
      LOGGER.warn(
          "C-STORE failed: callingAET={}, calledAET={}, studyUID={}, seriesUID={}, sopUID={}, scheme={}, reason={}",
          nullSafe(request.callingAet()),
          nullSafe(request.calledAet()),
          identifiers.studyInstanceUid(),
          identifiers.seriesInstanceUid(),
          identifiers.sopInstanceUid(),
          scheme,
          ex.getMessage());
      emitIngestFailure(request, identifiers, result, scheme);
      increment("dicoogle.cstore.failure", scheme);
      recordOutcome("failure", scheme, startNs);
      return result;
    } finally {
      deleteTempFile(normalizedFile);
    }
  }

  private CStoreIdentifiers extractIdentifiers(byte[] payload) {
    try (DicomInputStream dis = new DicomInputStream(new ByteArrayInputStream(payload))) {
      Attributes attrs = dis.readDataset();

      String patientId = attrs.getString(Tag.PatientID);
      String studyUid = attrs.getString(Tag.StudyInstanceUID);
      String seriesUid = attrs.getString(Tag.SeriesInstanceUID);
      String sopUid = attrs.getString(Tag.SOPInstanceUID);
      String sopClassUid = attrs.getString(Tag.SOPClassUID);

      if (!isPresent(studyUid)
          || !isPresent(seriesUid)
          || !isPresent(sopUid)
          || !isPresent(sopClassUid)) {
        return null;
      }

      return new CStoreIdentifiers(patientId, studyUid, seriesUid, sopUid, sopClassUid);
    } catch (IOException ex) {
      return null;
    }
  }

  private Path normalizeToPs310(byte[] payload, String sopClassUid, String transferSyntaxUid)
      throws IOException {
    Path tmpFile = Files.createTempFile("dicoogle-cstore-", ".dcm");
    try {
      Attributes attrs;
      try (DicomInputStream dis = new DicomInputStream(new ByteArrayInputStream(payload))) {
        attrs = dis.readDataset();
      }
      String sopInstanceUid = attrs.getString(Tag.SOPInstanceUID);
      if (!isPresent(sopInstanceUid)) {
        throw new IOException("Dataset missing SOP Instance UID");
      }

      Attributes fmi = new Attributes();
      fmi.setBytes(Tag.FileMetaInformationVersion, VR.OB, new byte[] {0, 1});
      fmi.setString(Tag.MediaStorageSOPClassUID, VR.UI, sopClassUid);
      fmi.setString(Tag.MediaStorageSOPInstanceUID, VR.UI, sopInstanceUid);
      fmi.setString(Tag.TransferSyntaxUID, VR.UI, transferSyntaxUid);
      fmi.setString(
          Tag.ImplementationClassUID,
          VR.UI,
          org.dicoogle.sdk.ImplementationInfo.IMPLEMENTATION_CLASS_UID);
      fmi.setString(
          Tag.ImplementationVersionName,
          VR.SH,
          org.dicoogle.sdk.ImplementationInfo.IMPLEMENTATION_VERSION_NAME);

      try (var fos = new java.io.FileOutputStream(tmpFile.toFile());
          DicomOutputStream dos = new DicomOutputStream(fos, transferSyntaxUid)) {
        dos.writeDataset(fmi, attrs);
      }
      return tmpFile;
    } catch (IOException ex) {
      deleteTempFile(tmpFile);
      throw ex;
    }
  }

  private void deleteTempFile(Path path) {
    if (path != null) {
      try {
        Files.deleteIfExists(path);
      } catch (IOException ex) {
        LOGGER.debug("Failed to delete temp file {}", path, ex);
      }
    }
  }

  private boolean isPresent(String value) {
    return value != null && !value.isBlank();
  }

  private void emitIngestSuccess(
      CStoreRequest request, CStoreIdentifiers identifiers, StoredObject stored, String scheme) {
    StorageIngestSuccessEvent event =
        new StorageIngestSuccessEvent(
            request.associationSerialNo(),
            request.callingAet(),
            request.calledAet(),
            scheme,
            identifiers.patientId(),
            identifiers.studyInstanceUid(),
            identifiers.seriesInstanceUid(),
            identifiers.sopInstanceUid(),
            identifiers.sopClassUid(),
            stored.location());

    listeners.forEach(listener -> listener.onIngestSuccess(event));
  }

  private void emitIngestFailure(
      CStoreRequest request, CStoreIdentifiers identifiers, CStoreResult result, String scheme) {
    StorageIngestFailureEvent event =
        new StorageIngestFailureEvent(
            request.associationSerialNo(),
            request.callingAet(),
            request.calledAet(),
            scheme,
            identifiers != null ? identifiers.studyInstanceUid() : null,
            identifiers != null ? identifiers.seriesInstanceUid() : null,
            identifiers != null ? identifiers.sopInstanceUid() : null,
            identifiers != null ? identifiers.sopClassUid() : null,
            result.status(),
            result.detail());

    listeners.forEach(listener -> listener.onIngestFailure(event));
  }

  private String nullSafe(String value) {
    return value == null ? "-" : value;
  }

  private void increment(String metric, String scheme) {
    if (meterRegistry != null) {
      meterRegistry.counter(metric, "scheme", scheme).increment();
    }
  }

  private void recordOutcome(String outcome, String scheme, long startNs) {
    if (meterRegistry != null) {
      Timer.builder("dicoogle.cstore.latency")
          .tag("scheme", scheme)
          .tag("outcome", outcome)
          .register(meterRegistry)
          .record(System.nanoTime() - startNs, java.util.concurrent.TimeUnit.NANOSECONDS);
    }
  }
}
