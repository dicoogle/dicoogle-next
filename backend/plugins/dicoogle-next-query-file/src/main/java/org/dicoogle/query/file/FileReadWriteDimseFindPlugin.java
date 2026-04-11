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
    String studyUid = request.keys().getString(Tag.StudyInstanceUID, null);
    String seriesUid = request.keys().getString(Tag.SeriesInstanceUID, null);
    String sopUid = request.keys().getString(Tag.SOPInstanceUID, null);

    List<java.net.URI> uris;
    if (request.level() == QueryRetrieveLevel.IMAGE
        && hasText(studyUid)
        && hasText(seriesUid)
        && hasText(sopUid)) {
      uris =
          storagePlugin.locateInstance(studyUid, seriesUid, sopUid).map(List::of).orElse(List.of());
    } else if (request.level() == QueryRetrieveLevel.SERIES
        && hasText(studyUid)
        && hasText(seriesUid)) {
      uris = storagePlugin.listSeriesInstances(studyUid, seriesUid);
    } else if (request.level() == QueryRetrieveLevel.STUDY && hasText(studyUid)) {
      uris = storagePlugin.listStudyInstances(studyUid);
    } else {
      uris = storagePlugin.listAllInstances();
    }

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
      if (!matchesDicomKeys(attrs, request.keys())) {
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

  private boolean matchesDicomKeys(Attributes attrs, Attributes keys) {
    return matchesExactUi(attrs, Tag.StudyInstanceUID, keys)
        && matchesExactUi(attrs, Tag.SeriesInstanceUID, keys)
        && matchesExactUi(attrs, Tag.SOPInstanceUID, keys)
        && matchesExactIgnoreCase(attrs, Tag.PatientID, keys)
        && matchesExactIgnoreCase(attrs, Tag.Modality, keys)
        && matchesContainsIgnoreCase(attrs, Tag.PatientName, keys)
        && matchesContainsIgnoreCase(attrs, Tag.StudyDescription, keys)
        && matchesContainsIgnoreCase(attrs, Tag.SeriesDescription, keys);
  }

  private boolean matchesExactUi(Attributes attrs, int tag, Attributes keys) {
    String expected = keys.getString(tag, null);
    if (!hasText(expected)) {
      return true;
    }
    String actual = attrs.getString(tag, "");
    return actual.equals(expected);
  }

  private boolean matchesExactIgnoreCase(Attributes attrs, int tag, Attributes keys) {
    String expected = keys.getString(tag, null);
    if (!hasText(expected)) {
      return true;
    }
    String actual = attrs.getString(tag, "");
    return actual.equalsIgnoreCase(expected);
  }

  private boolean matchesContainsIgnoreCase(Attributes attrs, int tag, Attributes keys) {
    String expected = keys.getString(tag, null);
    if (!hasText(expected)) {
      return true;
    }
    String actual = attrs.getString(tag, "");
    return actual.toLowerCase(Locale.ROOT).contains(expected.toLowerCase(Locale.ROOT));
  }

  private boolean hasText(String value) {
    return value != null && !value.isBlank();
  }

  private Attributes filterByLevel(Attributes src, QueryRetrieveLevel level) {
    Attributes out = new Attributes();
    copyIfPresent(src, out, Tag.QueryRetrieveLevel, VR.CS, level.name());
    copyIfPresent(src, out, Tag.StudyInstanceUID, VR.UI, null);
    copyIfPresent(src, out, Tag.SeriesInstanceUID, VR.UI, null);
    copyIfPresent(src, out, Tag.SOPInstanceUID, VR.UI, null);
    copyIfPresent(src, out, Tag.SOPClassUID, VR.UI, null);
    copyIfPresent(src, out, Tag.PatientID, VR.LO, null);
    copyIfPresent(src, out, Tag.PatientName, VR.PN, null);
    copyIfPresent(src, out, Tag.PatientSex, VR.CS, null);
    copyIfPresent(src, out, Tag.PatientBirthDate, VR.DA, null);
    copyIfPresent(src, out, Tag.StudyDate, VR.DA, null);
    copyIfPresent(src, out, Tag.StudyTime, VR.TM, null);
    copyIfPresent(src, out, Tag.AccessionNumber, VR.SH, null);
    copyIfPresent(src, out, Tag.StudyID, VR.SH, null);
    copyIfPresent(src, out, Tag.StudyDescription, VR.LO, null);
    copyIfPresent(src, out, Tag.Modality, VR.CS, null);
    copyIfPresent(src, out, Tag.ModalitiesInStudy, VR.CS, null);
    copyIfPresent(src, out, Tag.InstitutionName, VR.LO, null);
    copyIfPresent(src, out, Tag.SeriesDescription, VR.LO, null);
    copyIfPresent(src, out, Tag.SeriesDate, VR.DA, null);
    copyIfPresent(src, out, Tag.SeriesTime, VR.TM, null);
    copyIfPresent(src, out, Tag.SeriesNumber, VR.IS, null);
    copyIfPresent(src, out, Tag.OperatorsName, VR.PN, null);
    copyIfPresent(src, out, Tag.RequestingPhysician, VR.PN, null);
    copyIfPresent(src, out, Tag.ProtocolName, VR.LO, null);
    copyIfPresent(src, out, Tag.BodyPartThickness, VR.DS, null);

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

  private void copyIfPresent(Attributes src, Attributes dst, int tag, VR vr, String defaultValue) {
    String value = src.getString(tag, null);
    if (value != null && !value.isBlank()) {
      dst.setString(tag, vr, value);
      return;
    }
    if (defaultValue != null) {
      dst.setString(tag, vr, defaultValue);
    }
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
