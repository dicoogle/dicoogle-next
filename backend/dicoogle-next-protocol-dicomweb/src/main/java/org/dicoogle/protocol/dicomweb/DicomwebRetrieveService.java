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
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.io.DicomInputStream;
import org.dcm4che3.json.JSONWriter;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.query.QueryIndexStorageLocator;
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

  private final List<QueryIndexStorageLocator> queryLocators;
  private final List<DicomInstanceLocator> fallbackLocators;
  private final StorageRouter storageRouter;
  private final List<StorageRetrieveEventListener> retrieveEventListeners;
  private final MeterRegistry meterRegistry;

  @Autowired
  public DicomwebRetrieveService(
      List<QueryIndexStorageLocator> queryLocators,
      List<DicomInstanceLocator> fallbackLocators,
      StorageRouter storageRouter,
      List<StorageRetrieveEventListener> retrieveEventListeners,
      MeterRegistry meterRegistry) {
    this.queryLocators = List.copyOf(queryLocators);
    this.fallbackLocators = List.copyOf(fallbackLocators);
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

    if (queryLocators.isEmpty()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED,
          "No query index locator is configured for study metadata requests");
    }

    List<Attributes> metadata = new ArrayList<>();
    Collection<String> seen = new LinkedHashSet<>();

    for (QueryIndexStorageLocator plugin : queryLocators) {
      try {
        for (URI location : plugin.listStudyInstances(studyInstanceUid)) {
          if (!seen.add(location.toString())) {
            continue;
          }
          metadata.add(readMetadata(location));
        }
      } catch (IOException ex) {
        throw new ResponseStatusException(
            HttpStatus.INTERNAL_SERVER_ERROR, "Failed to retrieve study metadata", ex);
      }
    }

    return toDicomJson(metadata);
  }

  public String seriesMetadata(String studyInstanceUid, String seriesInstanceUid) {
    LOGGER.info(
        "WADO-RS series metadata request: studyUID={}, seriesUID={}",
        studyInstanceUid,
        seriesInstanceUid);

    if (queryLocators.isEmpty()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED,
          "No query index locator is configured for series metadata requests");
      }

    List<Attributes> metadata = new ArrayList<>();
    Collection<String> seen = new LinkedHashSet<>();

    for (QueryIndexStorageLocator plugin : queryLocators) {
      try {
        for (URI location : plugin.listSeriesInstances(studyInstanceUid, seriesInstanceUid)) {
          if (!seen.add(location.toString())) {
            continue;
          }
          metadata.add(readMetadata(location));
        }
      } catch (IOException ex) {
        throw new ResponseStatusException(
            HttpStatus.INTERNAL_SERVER_ERROR, "Failed to retrieve series metadata", ex);
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
   * Locates a DICOM instance by SOPInstanceUID alone and returns its fully parsed {@link
   * Attributes}. Used by the {@code /dump} endpoint which receives only the SOP UID from the
   * client.
   *
   * <p>Scans all registered {@link QueryIndexStorageLocator} plugins. For each locator, all indexed
   * instances are iterated until one whose {@code SOPInstanceUID} attribute matches is found. The
   * first match wins.
   *
   * @param sopInstanceUid the SOPInstanceUID to look up
   * @return the fully parsed {@link Attributes} of the matching instance
   * @throws ResponseStatusException 404 if no instance with the given UID is found
   * @throws ResponseStatusException 501 if no query locators are configured
   */
  public Attributes instanceAttributes(String sopInstanceUid) {
    LOGGER.info("dump request: sopUID={}", sopInstanceUid);

    if (queryLocators.isEmpty()) {
      throw new ResponseStatusException(
          HttpStatus.NOT_IMPLEMENTED,
          "No query index locator is configured for /dump requests");
    }

    Collection<String> seen = new LinkedHashSet<>();

    for (QueryIndexStorageLocator plugin : queryLocators) {
      List<URI> allLocations;
      try {
        allLocations = plugin.listAllInstances();
      } catch (IOException ex) {
        throw new ResponseStatusException(
            HttpStatus.INTERNAL_SERVER_ERROR,
            "Failed to list instances for /dump lookup",
            ex);
      }

      for (URI location : allLocations) {
        if (!seen.add(location.toString())) {
          continue;
        }
        Attributes attrs = readMetadata(location);
        String sop = attrs.getString(Tag.SOPInstanceUID, null);
        if (sopInstanceUid.equals(sop)) {
          return attrs;
        }
      }
    }

    throw new ResponseStatusException(
        HttpStatus.NOT_FOUND,
        "No instance found with SOPInstanceUID: " + sopInstanceUid);
  }

  private LocatedInstance locate(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) {
    for (QueryIndexStorageLocator plugin : queryLocators) {
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

    for (DicomInstanceLocator plugin : fallbackLocators) {
      try {
        var location = plugin.locateInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
        if (location.isPresent()) {
          storageRouter.requireReadable(location.get().getScheme());
          return new LocatedInstance(location.get());
        }
      } catch (IOException ex) {
        throw new ResponseStatusException(
            HttpStatus.INTERNAL_SERVER_ERROR,
            "Failed to resolve DICOM instance in fallback storage locator",
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
        return dis.readDataset();
      }
    } catch (IOException ex) {
      throw new ResponseStatusException(
          HttpStatus.INTERNAL_SERVER_ERROR, "Failed to parse DICOM metadata", ex);
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
