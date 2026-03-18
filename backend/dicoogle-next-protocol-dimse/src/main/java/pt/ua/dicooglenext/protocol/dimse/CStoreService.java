package pt.ua.dicooglenext.protocol.dimse;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.List;
import java.util.Objects;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.io.DicomInputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import pt.ua.dicooglenext.core.storage.NoWritableStoragePluginException;
import pt.ua.dicooglenext.core.storage.StoragePluginNotFoundException;
import pt.ua.dicooglenext.core.storage.StorageRouter;
import pt.ua.dicooglenext.sdk.query.StorageIngestEventListener;
import pt.ua.dicooglenext.sdk.storage.StorageIngestFailureEvent;
import pt.ua.dicooglenext.sdk.storage.StorageIngestSuccessEvent;
import pt.ua.dicooglenext.sdk.storage.StoredObject;

public class CStoreService {

  private static final Logger LOGGER = LoggerFactory.getLogger(CStoreService.class);

  private final StorageRouter storageRouter;
  private final List<StorageIngestEventListener> listeners;

  public CStoreService(StorageRouter storageRouter) {
    this(storageRouter, List.of());
  }

  public CStoreService(StorageRouter storageRouter, List<StorageIngestEventListener> listeners) {
    this.storageRouter = Objects.requireNonNull(storageRouter);
    this.listeners = List.copyOf(Objects.requireNonNull(listeners));
  }

  public CStoreResult store(CStoreRequest request) {
    String scheme =
        request.storageScheme() == null || request.storageScheme().isBlank()
            ? "file"
            : request.storageScheme();

    if (request.payload() == null || request.payload().length == 0) {
      return CStoreResult.cannotUnderstand("Received empty C-STORE payload");
    }

    CStoreIdentifiers identifiers = extractIdentifiers(request.payload());
    if (identifiers == null) {
      CStoreResult result =
          CStoreResult.cannotUnderstand("Missing required DICOM identifiers for C-STORE");
      emitIngestFailure(request, null, result, scheme);
      return result;
    }

    try {
      var plugin = storageRouter.requireWritable(scheme);
      StoredObject stored =
          plugin.store(new ByteArrayInputStream(request.payload()), request.contentType());
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
      return result;
    } catch (NoWritableStoragePluginException | StoragePluginNotFoundException ex) {
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
      return result;
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

  private boolean isPresent(String value) {
    return value != null && !value.isBlank();
  }

  private void emitIngestSuccess(
      CStoreRequest request, CStoreIdentifiers identifiers, StoredObject stored, String scheme) {
    StorageIngestSuccessEvent event =
        new StorageIngestSuccessEvent(
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
}
