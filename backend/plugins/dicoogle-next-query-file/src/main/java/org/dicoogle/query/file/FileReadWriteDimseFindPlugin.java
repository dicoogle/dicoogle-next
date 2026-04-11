package org.dicoogle.query.file;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomInputStream;
import org.dicoogle.sdk.PluginMetadata;
import org.dicoogle.sdk.query.DimseFindServicePlugin;
import org.dicoogle.storage.filerw.FileReadWriteStoragePlugin;

public class FileReadWriteDimseFindPlugin implements DimseFindServicePlugin {

  private static final PluginMetadata METADATA =
      new PluginMetadata("query-file-rw", "Filesystem DIMSE C-FIND Query", "0.1.0", "query-index");
  private static final Pattern KEYWORD_PATTERN = Pattern.compile("[A-Za-z0-9_.-]+:[^\\s]+");

  private final FileReadWriteStoragePlugin storagePlugin;

  public FileReadWriteDimseFindPlugin(FileReadWriteStoragePlugin storagePlugin) {
    this.storagePlugin = Objects.requireNonNull(storagePlugin);
  }

  @Override
  public PluginMetadata metadata() {
    return METADATA;
  }

  @Override
  public List<Attributes> find(FindRequest request) throws IOException {
    List<java.net.URI> uris =
        switch (request.level()) {
          case STUDY ->
              storagePlugin.listStudyInstances(
                  request.keys().getString(Tag.StudyInstanceUID, "__MISSING_STUDY_UID__"));
          case SERIES ->
              storagePlugin.listSeriesInstances(
                  request.keys().getString(Tag.StudyInstanceUID, "__MISSING_STUDY_UID__"),
                  request.keys().getString(Tag.SeriesInstanceUID, "__MISSING_SERIES_UID__"));
          case IMAGE ->
              storagePlugin
                  .locateInstance(
                      request.keys().getString(Tag.StudyInstanceUID, "__MISSING_STUDY_UID__"),
                      request.keys().getString(Tag.SeriesInstanceUID, "__MISSING_SERIES_UID__"),
                      request.keys().getString(Tag.SOPInstanceUID, "__MISSING_INSTANCE_UID__"))
                  .map(List::of)
                  .orElse(List.of());
        };

    Set<String> seen = new LinkedHashSet<>();
    List<Attributes> out = new ArrayList<>();
    String freeText =
        request.freeText() == null ? null : request.freeText().toLowerCase(Locale.ROOT);
    Map<String, String> filters = request.keywordFilters();

    for (java.net.URI uri : uris) {
      if (!seen.add(uri.toString())) {
        continue;
      }
      Attributes attrs = readDataset(uri);
      if (!matchesFreeText(attrs, freeText)) {
        continue;
      }
      if (!matchesKeywordFilters(attrs, filters)) {
        continue;
      }
      out.add(filterByLevel(attrs, request.level()));
    }

    return out;
  }

  private Attributes readDataset(java.net.URI location) throws IOException {
    try (var stream = storagePlugin.openForRead(location);
        DicomInputStream dis = new DicomInputStream(stream)) {
      return dis.readDataset();
    }
  }

  private boolean matchesFreeText(Attributes attrs, String freeText) {
    if (freeText == null || freeText.isBlank()) {
      return true;
    }
    String patientName = attrs.getString(Tag.PatientName, "");
    String patientId = attrs.getString(Tag.PatientID, "");
    String accession = attrs.getString(Tag.AccessionNumber, "");
    String studyDesc = attrs.getString(Tag.StudyDescription, "");
    String seriesDesc = attrs.getString(Tag.SeriesDescription, "");

    String haystack =
        (patientName + " " + patientId + " " + accession + " " + studyDesc + " " + seriesDesc)
            .toLowerCase(Locale.ROOT);
    return haystack.contains(freeText);
  }

  private boolean matchesKeywordFilters(Attributes attrs, Map<String, String> filters) {
    if (filters == null || filters.isEmpty()) {
      return true;
    }

    for (Map.Entry<String, String> entry : filters.entrySet()) {
      int tag = mapKeywordToTag(entry.getKey());
      if (tag == -1) {
        continue;
      }
      String actual = attrs.getString(tag, "");
      if (!actual.equalsIgnoreCase(entry.getValue())) {
        return false;
      }
    }
    return true;
  }

  private int mapKeywordToTag(String keyword) {
    return switch (keyword.toLowerCase(Locale.ROOT)) {
      case "patientid" -> Tag.PatientID;
      case "patientname" -> Tag.PatientName;
      case "studyinstanceuid" -> Tag.StudyInstanceUID;
      case "seriesinstanceuid" -> Tag.SeriesInstanceUID;
      case "sopinstanceuid" -> Tag.SOPInstanceUID;
      case "accessionnumber" -> Tag.AccessionNumber;
      case "modality" -> Tag.Modality;
      default -> -1;
    };
  }

  private Attributes filterByLevel(Attributes src, QueryRetrieveLevel level) {
    Attributes out = new Attributes();
    out.setString(Tag.QueryRetrieveLevel, VR.CS, level.name());
    out.setString(Tag.StudyInstanceUID, VR.UI, src.getString(Tag.StudyInstanceUID, ""));
    out.setString(Tag.SeriesInstanceUID, VR.UI, src.getString(Tag.SeriesInstanceUID, ""));
    out.setString(Tag.SOPInstanceUID, VR.UI, src.getString(Tag.SOPInstanceUID, ""));
    out.setString(Tag.SOPClassUID, VR.UI, src.getString(Tag.SOPClassUID, ""));
    out.setString(Tag.PatientID, VR.LO, src.getString(Tag.PatientID, ""));
    out.setString(Tag.PatientName, VR.PN, src.getString(Tag.PatientName, ""));
    out.setString(Tag.StudyDescription, VR.LO, src.getString(Tag.StudyDescription, ""));
    out.setString(Tag.SeriesDescription, VR.LO, src.getString(Tag.SeriesDescription, ""));
    out.setString(Tag.Modality, VR.CS, src.getString(Tag.Modality, ""));
    out.setString(Tag.AccessionNumber, VR.SH, src.getString(Tag.AccessionNumber, ""));

    if (level == QueryRetrieveLevel.STUDY) {
      Attributes studyOnly = new Attributes();
      studyOnly.addAll(out);
      studyOnly.setNull(Tag.SeriesInstanceUID, VR.UI);
      studyOnly.setNull(Tag.SOPInstanceUID, VR.UI);
      return studyOnly;
    }
    if (level == QueryRetrieveLevel.SERIES) {
      Attributes seriesOnly = new Attributes();
      seriesOnly.addAll(out);
      seriesOnly.setNull(Tag.SOPInstanceUID, VR.UI);
      return seriesOnly;
    }
    return out;
  }

  public static String extractFreeText(String raw) {
    if (raw == null || raw.isBlank()) {
      return null;
    }
    StringBuilder out = new StringBuilder();
    for (String token : raw.trim().split("\\s+")) {
      if (!KEYWORD_PATTERN.matcher(token).matches()) {
        if (!out.isEmpty()) {
          out.append(' ');
        }
        out.append(token);
      }
    }
    return out.isEmpty() ? null : out.toString();
  }

  public static java.util.Map<String, String> extractKeywordFilters(String raw) {
    if (raw == null || raw.isBlank()) {
      return java.util.Map.of();
    }
    java.util.Map<String, String> out = new java.util.LinkedHashMap<>();
    for (String token : raw.trim().split("\\s+")) {
      if (KEYWORD_PATTERN.matcher(token).matches()) {
        int index = token.indexOf(':');
        if (index > 0 && index < token.length() - 1) {
          out.put(token.substring(0, index), token.substring(index + 1));
        }
      }
    }
    return out;
  }
}
