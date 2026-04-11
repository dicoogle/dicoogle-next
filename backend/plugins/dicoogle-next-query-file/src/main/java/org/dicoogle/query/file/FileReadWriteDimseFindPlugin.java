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
    return matchesUid(attrs, Tag.StudyInstanceUID, keys)
        && matchesUid(attrs, Tag.SeriesInstanceUID, keys)
        && matchesUid(attrs, Tag.SOPInstanceUID, keys)
        && matchesString(attrs, Tag.PatientID, keys)
        && matchesString(attrs, Tag.Modality, keys)
        && matchesString(attrs, Tag.PatientName, keys)
        && matchesString(attrs, Tag.StudyDescription, keys)
        && matchesString(attrs, Tag.SeriesDescription, keys)
        && matchesString(attrs, Tag.AccessionNumber, keys)
        && matchesDate(attrs, Tag.PatientBirthDate, keys)
        && matchesDate(attrs, Tag.StudyDate, keys)
        && matchesDate(attrs, Tag.SeriesDate, keys);
  }

  private boolean matchesUid(Attributes attrs, int tag, Attributes keys) {
    String expected = keys.getString(tag, null);
    if (!hasText(expected)) {
      return true;
    }
    String actual = attrs.getString(tag, "");
    for (String candidate : splitMultiValue(expected)) {
      if (actual.equals(candidate)) {
        return true;
      }
    }
    return false;
  }

  private boolean matchesString(Attributes attrs, int tag, Attributes keys) {
    String expected = keys.getString(tag, null);
    if (!hasText(expected)) {
      return true;
    }
    String actual = attrs.getString(tag, "");
    for (String candidate : splitMultiValue(expected)) {
      if (matchesStringValue(actual, candidate)) {
        return true;
      }
    }
    return false;
  }

  private boolean matchesDate(Attributes attrs, int tag, Attributes keys) {
    String expected = keys.getString(tag, null);
    if (!hasText(expected)) {
      return true;
    }
    String actual = attrs.getString(tag, "");
    for (String candidate : splitMultiValue(expected)) {
      if (matchesDateValue(actual, candidate)) {
        return true;
      }
    }
    return false;
  }

  private List<String> splitMultiValue(String expected) {
    String[] values = expected.split("\\\\");
    List<String> out = new ArrayList<>(values.length);
    for (String value : values) {
      if (hasText(value)) {
        out.add(value.trim());
      }
    }
    return out;
  }

  private boolean matchesStringValue(String actual, String expected) {
    if (expected.indexOf('*') >= 0 || expected.indexOf('?') >= 0) {
      String regex = wildcardToRegex(expected);
      return Pattern.compile(regex, Pattern.CASE_INSENSITIVE | Pattern.DOTALL)
          .matcher(actual)
          .matches();
    }
    return actual.equalsIgnoreCase(expected);
  }

  private String wildcardToRegex(String wildcard) {
    StringBuilder regex = new StringBuilder("^");
    for (char c : wildcard.toCharArray()) {
      if (c == '*') {
        regex.append(".*");
      } else if (c == '?') {
        regex.append('.');
      } else if ("\\.^$|()[]{}+".indexOf(c) >= 0) {
        regex.append('\\').append(c);
      } else {
        regex.append(c);
      }
    }
    regex.append('$');
    return regex.toString();
  }

  private boolean matchesDateValue(String actual, String expected) {
    int dash = expected.indexOf('-');
    if (dash < 0) {
      return actual.equals(expected);
    }

    String start = expected.substring(0, dash).trim();
    String end = expected.substring(dash + 1).trim();

    if (hasText(start) && actual.compareTo(start) < 0) {
      return false;
    }
    if (hasText(end) && actual.compareTo(end) > 0) {
      return false;
    }
    return true;
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
