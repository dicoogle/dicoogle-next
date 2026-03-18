package pt.ua.dicooglenext.protocol.dicomweb;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.io.DicomInputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import pt.ua.dicooglenext.core.storage.StorageRouter;
import pt.ua.dicooglenext.sdk.storage.HierarchicalDicomStoragePlugin;

@Service
public class DicomwebRetrieveService {

  private static final Logger LOGGER = LoggerFactory.getLogger(DicomwebRetrieveService.class);

  private final List<HierarchicalDicomStoragePlugin> hierarchicalPlugins;
  private final StorageRouter storageRouter;

  @Autowired
  public DicomwebRetrieveService(
      List<HierarchicalDicomStoragePlugin> hierarchicalPlugins, StorageRouter storageRouter) {
    this.hierarchicalPlugins = List.copyOf(hierarchicalPlugins);
    this.storageRouter = storageRouter;
  }

  public byte[] retrieveInstance(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) {
    LOGGER.info(
        "WADO-RS retrieve instance request: studyUID={}, seriesUID={}, sopUID={}",
        studyInstanceUid,
        seriesInstanceUid,
        sopInstanceUid);

    LocatedInstance located = locate(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
    try (var stream = located.plugin().openForRead(located.location())) {
      return stream.readAllBytes();
    } catch (IOException ex) {
      throw new ResponseStatusException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "Failed to read DICOM instance from storage provider",
          ex);
    }
  }

  public List<Map<String, Object>> studyMetadata(String studyInstanceUid) {
    LOGGER.info("WADO-RS study metadata request: studyUID={}", studyInstanceUid);

    List<Map<String, Object>> metadata = new ArrayList<>();

    for (HierarchicalDicomStoragePlugin plugin : hierarchicalPlugins) {
      try {
        for (URI location : plugin.listStudyInstances(studyInstanceUid)) {
          metadata.add(readMetadata(location, plugin));
        }
      } catch (IOException ex) {
        throw new ResponseStatusException(
            HttpStatus.INTERNAL_SERVER_ERROR, "Failed to retrieve study metadata", ex);
      }
    }

    return metadata;
  }

  public List<Map<String, Object>> seriesMetadata(
      String studyInstanceUid, String seriesInstanceUid) {
    LOGGER.info(
        "WADO-RS series metadata request: studyUID={}, seriesUID={}",
        studyInstanceUid,
        seriesInstanceUid);

    List<Map<String, Object>> metadata = new ArrayList<>();

    for (HierarchicalDicomStoragePlugin plugin : hierarchicalPlugins) {
      try {
        for (URI location : plugin.listSeriesInstances(studyInstanceUid, seriesInstanceUid)) {
          metadata.add(readMetadata(location, plugin));
        }
      } catch (IOException ex) {
        throw new ResponseStatusException(
            HttpStatus.INTERNAL_SERVER_ERROR, "Failed to retrieve series metadata", ex);
      }
    }

    return metadata;
  }

  public Map<String, Object> instanceMetadata(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) {
    LOGGER.info(
        "WADO-RS instance metadata request: studyUID={}, seriesUID={}, sopUID={}",
        studyInstanceUid,
        seriesInstanceUid,
        sopInstanceUid);

    LocatedInstance located = locate(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
    return readMetadata(located.location(), located.plugin());
  }

  private LocatedInstance locate(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) {
    for (HierarchicalDicomStoragePlugin plugin : hierarchicalPlugins) {
      try {
        var location = plugin.locateInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
        if (location.isPresent()) {
          storageRouter.requireReadable(location.get().getScheme());
          return new LocatedInstance(plugin, location.get());
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

  private Map<String, Object> readMetadata(URI location, HierarchicalDicomStoragePlugin plugin) {
    try (var stream = plugin.openForRead(location)) {
      byte[] bytes = stream.readAllBytes();
      try (DicomInputStream dis = new DicomInputStream(new ByteArrayInputStream(bytes))) {
        Attributes attrs = dis.readDataset();

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("PatientID", attrs.getString(Tag.PatientID));
        metadata.put("StudyInstanceUID", attrs.getString(Tag.StudyInstanceUID));
        metadata.put("SeriesInstanceUID", attrs.getString(Tag.SeriesInstanceUID));
        metadata.put("SOPInstanceUID", attrs.getString(Tag.SOPInstanceUID));
        metadata.put("SOPClassUID", attrs.getString(Tag.SOPClassUID));
        metadata.put("location", location.toString());
        return metadata;
      }
    } catch (IOException ex) {
      throw new ResponseStatusException(
          HttpStatus.INTERNAL_SERVER_ERROR, "Failed to parse DICOM metadata", ex);
    }
  }

  private record LocatedInstance(HierarchicalDicomStoragePlugin plugin, URI location) {}
}
