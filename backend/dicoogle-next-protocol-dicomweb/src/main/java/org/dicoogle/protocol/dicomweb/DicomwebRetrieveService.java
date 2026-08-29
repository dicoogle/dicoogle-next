package org.dicoogle.protocol.dicomweb;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import jakarta.json.Json;
import jakarta.json.stream.JsonGenerator;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.StringWriter;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomInputStream;
import org.dcm4che3.json.JSONWriter;
import org.dicoogle.core.query.QueryRouter;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.query.QueryRetrieveLevel;
import org.dicoogle.sdk.query.QueryService;
import org.dicoogle.sdk.service.StorageRetrieveEventListener;
import org.dicoogle.sdk.storage.DicomInstanceLocator;
import org.dicoogle.sdk.storage.StorageRetrieveFailureEvent;
import org.dicoogle.sdk.storage.StorageRetrieveSuccessEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DicomwebRetrieveService {

  private static final Logger LOGGER = LoggerFactory.getLogger(DicomwebRetrieveService.class);

  private final List<DicomInstanceLocator> locators;
  private final QueryRouter router;
  private final StorageRouter storageRouter;
  private final List<StorageRetrieveEventListener> retrieveEventListeners;
  private final MeterRegistry meterRegistry;

  @Autowired
  public DicomwebRetrieveService(
      List<DicomInstanceLocator> locators,
      QueryRouter router,
      StorageRouter storageRouter,
      List<StorageRetrieveEventListener> retrieveEventListeners,
      MeterRegistry meterRegistry) {
    this.locators = List.copyOf(locators);
    this.router = router;
    this.storageRouter = storageRouter;
    this.retrieveEventListeners = List.copyOf(retrieveEventListeners);
    this.meterRegistry = meterRegistry;
  }

  public byte[] retrieveInstance(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) {
    long startNs = System.nanoTime();

    LOGGER.info(
        "WADO-RS retrieve instance request: studyUID={}, seriesUID={}, sopUID={}",
        studyInstanceUid,
        seriesInstanceUid,
        sopInstanceUid);

    increment("dicoogle.wadors.requests", "instance");

    LocatedInstance located = locate(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
    try (var stream =
        storageRouter
            .requireReadable(located.location().getScheme())
            .openForRead(located.location())) {
      byte[] payload = stream.readAllBytes();
      emitRetrieveSuccess(
          studyInstanceUid,
          seriesInstanceUid,
          sopInstanceUid,
          located.location().getScheme(),
          located.location(),
          payload.length);
      increment("dicoogle.wadors.success", "instance");
      meterRegistry.counter("dicoogle.wadors.bytes", "type", "instance").increment(payload.length);
      recordLatency("instance", "success", startNs);
      return payload;
    } catch (IOException ex) {
      emitRetrieveFailure(
          studyInstanceUid,
          seriesInstanceUid,
          sopInstanceUid,
          located.location().getScheme(),
          HttpStatus.INTERNAL_SERVER_ERROR.value(),
          "Failed to read DICOM instance from storage provider");
      increment("dicoogle.wadors.failure", "instance");
      recordLatency("instance", "failure", startNs);
      throw new ResponseStatusException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "Failed to read DICOM instance from storage provider",
          ex);
    }
  }

  public String studyMetadata(String studyInstanceUid) {
    LOGGER.info("WADO-RS study metadata request: studyUID={}", studyInstanceUid);

    if (locators.isEmpty()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED,
          "No storage locator is configured for study metadata requests");
    }

    List<Attributes> metadata = new ArrayList<>();
    Collection<String> seen = new LinkedHashSet<>();

    for (DicomInstanceLocator plugin : locators) {
      try {
        for (URI location : plugin.listStudyInstances(studyInstanceUid)) {
          if (!seen.add(location.toString())) {
            continue;
          }
          try {
            metadata.add(readMetadata(location));
          } catch (Exception ex) {
            LOGGER.warn("Skipping unavailable instance in study metadata: {}", location, ex);
          }
        }
      } catch (IOException ex) {
        throw new ResponseStatusException(
            HttpStatus.INTERNAL_SERVER_ERROR, "Failed to list study instances", ex);
      }
    }

    return toDicomJson(metadata);
  }

  public String seriesMetadata(String studyInstanceUid, String seriesInstanceUid) {
    LOGGER.info(
        "WADO-RS series metadata request: studyUID={}, seriesUID={}",
        studyInstanceUid,
        seriesInstanceUid);

    if (locators.isEmpty()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED,
          "No storage locator is configured for series metadata requests");
    }

    List<Attributes> metadata = new ArrayList<>();
    Collection<String> seen = new LinkedHashSet<>();

    for (DicomInstanceLocator plugin : locators) {
      try {
        for (URI location : plugin.listSeriesInstances(studyInstanceUid, seriesInstanceUid)) {
          if (!seen.add(location.toString())) {
            continue;
          }
          try {
            metadata.add(readMetadata(location));
          } catch (Exception ex) {
            LOGGER.warn("Skipping unavailable instance in series metadata: {}", location, ex);
          }
        }
      } catch (IOException ex) {
        throw new ResponseStatusException(
            HttpStatus.INTERNAL_SERVER_ERROR, "Failed to list series instances", ex);
      }
    }

    return toDicomJson(metadata);
  }

  public String instanceMetadata(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) {
    LOGGER.info(
        "WADO-RS instance metadata request: studyUID={}, seriesUID={}, sopUID={}",
        studyInstanceUid,
        seriesInstanceUid,
        sopInstanceUid);

    LocatedInstance located = locate(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
    return toDicomJson(readMetadata(located.location()));
  }

  /**
   * Locates a DICOM instance by SOPInstanceUID and returns its {@link QueryService.QueryResult}
   * (attributes + storage URI). Used by the {@code /dump} endpoint.
   *
   * @param sopInstanceUid the SOP Instance UID to look up
   * @param provider an optional query provider name; if null/blank all providers are queried
   * @return the matching {@link QueryResult}
   * @throws ResponseStatusException 404 if not found, 500 on I/O error
   */
  public byte[] retrieveInstanceBySopUid(String sopInstanceUid, String provider) {
    LOGGER.info("retrieve by sopUID={}", sopInstanceUid);
    var result = dumpResult(sopInstanceUid, provider);
    URI uri = result.storageUri();
    try (var stream = storageRouter.requireReadable(uri.getScheme()).openForRead(uri)) {
      return stream.readAllBytes();
    } catch (IOException ex) {
      throw new ResponseStatusException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "Failed to read DICOM instance from storage provider",
          ex);
    }
  }

  public QueryService.QueryResult dumpResult(String sopInstanceUid, String provider) {
    LOGGER.info("dump request: sopUID={}", sopInstanceUid);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, QueryRetrieveLevel.IMAGE.name());
    keys.setString(Tag.SOPInstanceUID, VR.UI, sopInstanceUid);

    QueryService.QueryRequest request =
        new QueryService.QueryRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.IMAGE,
            "DICOOGLE",
            "DICOOGLE",
            0,
            keys,
            null,
            Map.of(),
            false,
            false,
            () -> false,
            null);

    List<QueryService.QueryResult> results;
    if (provider != null && !provider.isBlank()) {
      results = router.query(request, List.of(provider));
    } else {
      results = router.queryAll(request);
    }
    if (results == null || results.isEmpty()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_FOUND, "No instance found with SOPInstanceUID: " + sopInstanceUid);
    }
    return results.getFirst();
  }

  private LocatedInstance locate(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) {
    for (DicomInstanceLocator plugin : locators) {
      try {
        var location = plugin.locateInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
        if (location.isPresent()) {
          storageRouter.requireReadable(location.get().getScheme());
          return new LocatedInstance(location.get());
        }
      } catch (IOException ex) {
        throw new ResponseStatusException(
            HttpStatus.INTERNAL_SERVER_ERROR,
            "Failed to resolve DICOM instance in storage provider",
            ex);
      }
    }

    throw new ResponseStatusException(
        HttpStatus.NOT_FOUND, "DICOM instance not found for study/series/SOP identifiers");
  }

  Attributes readMetadata(URI location) {
    try (var stream = storageRouter.requireReadable(location.getScheme()).openForRead(location)) {
      byte[] bytes = stream.readAllBytes();
      try (DicomInputStream dis = new DicomInputStream(new ByteArrayInputStream(bytes))) {
        return dis.readDataset(-1, Tag.PixelData);
      } catch (Exception ex) {
        LOGGER.error("DICOM parse error for {}: {}", location, ex.toString(), ex);
        throw new ResponseStatusException(
            HttpStatus.INTERNAL_SERVER_ERROR, "Failed to parse DICOM metadata", ex);
      }
    } catch (ResponseStatusException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new ResponseStatusException(
          HttpStatus.INTERNAL_SERVER_ERROR, "Failed to read DICOM instance from storage", ex);
    }
  }

  private String toDicomJson(Attributes attributes) {
    StringWriter output = new StringWriter();
    try (JsonGenerator generator = Json.createGenerator(output)) {
      JSONWriter writer = new JSONWriter(generator);
      writer.write(attributes);
    }
    return output.toString();
  }

  private String toDicomJson(List<Attributes> attributesList) {
    StringWriter output = new StringWriter();
    try (JsonGenerator generator = Json.createGenerator(output)) {
      generator.writeStartArray();
      JSONWriter writer = new JSONWriter(generator);
      for (Attributes attributes : attributesList) {
        writer.write(attributes);
      }
      generator.writeEnd();
    }
    return output.toString();
  }

  private record LocatedInstance(URI location) {}

  private void increment(String metric, String type) {
    meterRegistry.counter(metric, "type", type).increment();
  }

  private void recordLatency(String type, String outcome, long startNs) {
    Timer.builder("dicoogle.wadors.latency")
        .tag("type", type)
        .tag("outcome", outcome)
        .register(meterRegistry)
        .record(System.nanoTime() - startNs, java.util.concurrent.TimeUnit.NANOSECONDS);
  }

  private void emitRetrieveSuccess(
      String studyInstanceUid,
      String seriesInstanceUid,
      String sopInstanceUid,
      String storageScheme,
      URI location,
      long bytesServed) {
    StorageRetrieveSuccessEvent event =
        new StorageRetrieveSuccessEvent(
            studyInstanceUid,
            seriesInstanceUid,
            sopInstanceUid,
            storageScheme,
            location,
            bytesServed);
    retrieveEventListeners.forEach(listener -> listener.onRetrieveSuccess(event));
  }

  private void emitRetrieveFailure(
      String studyInstanceUid,
      String seriesInstanceUid,
      String sopInstanceUid,
      String storageScheme,
      int httpStatus,
      String reason) {
    StorageRetrieveFailureEvent event =
        new StorageRetrieveFailureEvent(
            studyInstanceUid, seriesInstanceUid, sopInstanceUid, storageScheme, httpStatus, reason);
    retrieveEventListeners.forEach(listener -> listener.onRetrieveFailure(event));
  }
}
