package org.dicoogle.query.file;

import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.ElementDictionary;
import org.dcm4che3.data.Sequence;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomInputStream;
import org.dicoogle.sdk.PluginMetadata;
import org.dicoogle.sdk.query.QueryMoveService;
import org.dicoogle.sdk.query.QueryRetrieveLevel;
import org.dicoogle.sdk.query.QueryService;
import org.dicoogle.sdk.query.StorageIngestEventListener;
import org.dicoogle.sdk.storage.ReadableStoragePlugin;
import org.dicoogle.sdk.storage.StorageIngestSuccessEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * A combined index/query plugin backed by any {@link ReadableStoragePlugin}.
 *
 * <p>On the <em>indexing</em> side this class implements {@link StorageIngestEventListener}: each
 * successful ingest records the instance URI against its study, series, and SOP identifiers in an
 * in-memory index. This index is intentionally transient; it is not persisted across restarts.
 *
 * <p>On the <em>query</em> side this class implements {@link QueryService} and {@link
 * QueryMoveService}: queries are answered against the in-memory index rather than by scanning the
 * filesystem. Consequently, queries that do not supply at least a StudyInstanceUID will return an
 * empty result set, because no full-archive scan is performed. If a deployer needs to query
 * instances that were stored before this plugin was started, a separate re-indexing mechanism must
 * be provided.
 *
 * <p>This plugin is storage-provider-agnostic: it depends only on {@link ReadableStoragePlugin},
 * and will work with any storage backend that implements that interface.
 */
public class FileQueryIndexPlugin
    implements StorageIngestEventListener, QueryService, QueryMoveService {

  private static final Logger LOGGER = LoggerFactory.getLogger(FileQueryIndexPlugin.class);
  private static final PluginMetadata METADATA =
      new PluginMetadata("query-file-rw", "Filesystem DICOM Query/Index", "0.1.0", "query-index");
  private static final Pattern KEYWORD_PATTERN = Pattern.compile("[A-Za-z0-9_.-]+:[^\\s]+");

  /**
   * DICOM PN values use {@code ^} to separate name components (family, given, middle, prefix,
   * suffix) and {@code =} to separate ideographic/phonetic groups. For wildcard and fuzzy matching
   * we flatten all components into a single space-separated string so that patterns like {@code
   * "F*"} or a fuzzy token such as {@code "felixal"} can match across component boundaries.
   */
  private static final Pattern PN_SEPARATOR = Pattern.compile("[\\^=]+");

  private record IndexEntry(URI location, Attributes attributes) {}

  private final ReadableStoragePlugin storagePlugin;

  /**
   * In-memory index: maps studyInstanceUid -> seriesInstanceUid -> sopInstanceUid -> {@link
   * IndexEntry}. Backed by {@link java.util.concurrent.ConcurrentHashMap} at every level for
   * thread-safe writes from the ingest callbacks.
   */
  private final java.util.concurrent.ConcurrentHashMap<
          String,
          java.util.concurrent.ConcurrentHashMap<
              String, java.util.concurrent.ConcurrentHashMap<String, IndexEntry>>>
      index = new java.util.concurrent.ConcurrentHashMap<>();

  public FileQueryIndexPlugin(ReadableStoragePlugin storagePlugin) {
    this.storagePlugin = Objects.requireNonNull(storagePlugin);
  }

  // -------------------------------------------------------------------------
  // DicooglePlugin
  // -------------------------------------------------------------------------

  @Override
  public PluginMetadata metadata() {
    return METADATA;
  }

  // -------------------------------------------------------------------------
  // StorageIngestEventListener — indexing side
  // -------------------------------------------------------------------------

  @Override
  public void onIngestSuccess(StorageIngestSuccessEvent event) {
    try {
      Attributes attrs = readDataset(event.location());
      index
          .computeIfAbsent(
              event.studyInstanceUid(), k -> new java.util.concurrent.ConcurrentHashMap<>())
          .computeIfAbsent(
              event.seriesInstanceUid(), k -> new java.util.concurrent.ConcurrentHashMap<>())
          .put(event.sopInstanceUid(), new IndexEntry(event.location(), attrs));
    } catch (Exception ex) {
      LOGGER.warn("Failed to index ingested object at {}: {}", event.location(), ex.getMessage());
    }
  }

  // onIngestFailure is a no-op; the default empty implementation is sufficient.

  // -------------------------------------------------------------------------
  // QueryService — query side
  // -------------------------------------------------------------------------

  @Override
  public List<QueryResult> query(QueryRequest request) throws IOException {
    List<IndexEntry> entries = resolveIndexEntries(request.level(), request.keys());
    if (entries.isEmpty()) {
      return List.of();
    }

    Set<String> seen = new LinkedHashSet<>();
    List<QueryResult> out = new ArrayList<>();
    String freeText =
        request.freeText() == null ? null : request.freeText().toLowerCase(Locale.ROOT);
    Map<String, String> filters = request.keywordFilters();

    for (IndexEntry entry : entries) {
      if (!seen.add(entry.location().toString())) {
        continue;
      }
      if (request.cancelRequested() != null && request.cancelRequested().getAsBoolean()) {
        break;
      }
      Attributes attrs = entry.attributes();
      if (!matchesFreeText(attrs, freeText)) {
        continue;
      }
      if (!matchesKeywordFilters(attrs, filters, request)) {
        continue;
      }
      if (!matchesDicomKeys(attrs, request.keys(), request)) {
        continue;
      }
      out.add(new QueryResult(filterByLevel(attrs, request.level()), entry.location()));
    }

    return out;
  }

  // -------------------------------------------------------------------------
  // QueryMoveService — move-resolution side
  // -------------------------------------------------------------------------

  @Override
  public List<QueryMoveService.MoveCandidate> resolve(QueryMoveService.MoveRequest request)
      throws IOException {
    List<IndexEntry> entries = resolveIndexEntries(request.level(), request.keys());
    if (entries.isEmpty()) {
      return List.of();
    }

    Set<String> seen = new LinkedHashSet<>();
    List<QueryMoveService.MoveCandidate> out = new ArrayList<>();

    for (IndexEntry entry : entries) {
      if (!seen.add(entry.location().toString())) {
        continue;
      }
      if (request.cancelRequested() != null && request.cancelRequested().getAsBoolean()) {
        break;
      }
      Attributes attrs = entry.attributes();
      if (!matchesDicomKeys(
          attrs,
          request.keys(),
          new QueryRequest(
              request.informationModel(),
              request.level(),
              request.callingAet(),
              request.calledAet(),
              request.associationSerialNo(),
              request.keys(),
              null,
              Map.of(),
              false,
              false,
              request.cancelRequested()))) {
        continue;
      }
      String sopClassUid = attrs.getString(Tag.SOPClassUID, null);
      String sopInstanceUid = attrs.getString(Tag.SOPInstanceUID, null);
      if (!hasText(sopClassUid) || !hasText(sopInstanceUid)) {
        continue;
      }
      out.add(new QueryMoveService.MoveCandidate(sopClassUid, sopInstanceUid, entry.location()));
    }

    return out;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Resolves candidate URIs from the in-memory index.
   *
   * <p>Queries that do not qualify with at least a StudyInstanceUID return an empty list;
   * full-archive scans are intentionally not supported.
   */
  private List<IndexEntry> resolveIndexEntries(QueryRetrieveLevel level, Attributes keys) {
    String studyUid = keys.getString(Tag.StudyInstanceUID, null);
    String seriesUid = keys.getString(Tag.SeriesInstanceUID, null);
    String sopUid = keys.getString(Tag.SOPInstanceUID, null);

    if (level == QueryRetrieveLevel.IMAGE
        && hasText(studyUid)
        && hasText(seriesUid)
        && hasText(sopUid)) {
      var seriesMap = index.getOrDefault(studyUid, new java.util.concurrent.ConcurrentHashMap<>());
      var sopMap =
          seriesMap.getOrDefault(seriesUid, new java.util.concurrent.ConcurrentHashMap<>());
      IndexEntry entry = sopMap.get(sopUid);
      return entry != null ? List.of(entry) : List.of();
    }

    if (level == QueryRetrieveLevel.SERIES && hasText(studyUid) && hasText(seriesUid)) {
      var seriesMap = index.getOrDefault(studyUid, new java.util.concurrent.ConcurrentHashMap<>());
      var sopMap = seriesMap.get(seriesUid);
      return sopMap != null ? List.copyOf(sopMap.values()) : List.of();
    }

    if (level == QueryRetrieveLevel.STUDY && hasText(studyUid)) {
      var seriesMap = index.get(studyUid);
      if (seriesMap == null) {
        return List.of();
      }
      List<IndexEntry> entries = new ArrayList<>();
      seriesMap.values().forEach(sopMap -> entries.addAll(sopMap.values()));
      return entries;
    }

    // No qualifying UIDs supplied — full-archive scan is not supported.
    return List.of();
  }

  private Attributes readDataset(URI location) throws IOException {
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

  private boolean matchesKeywordFilters(
      Attributes attrs, Map<String, String> filters, QueryRequest request) {
    if (filters == null || filters.isEmpty()) {
      return true;
    }

    for (Map.Entry<String, String> entry : filters.entrySet()) {
      int tag = resolveKeywordToTag(entry.getKey(), attrs);
      if (tag == -1) {
        return false;
      }
      VR vr = attrs.getVR(tag);
      if (!matchesTagValue(attrs, entry.getValue(), tag, vr == null ? VR.LO : vr, request)) {
        return false;
      }
    }
    return true;
  }

  private int resolveKeywordToTag(String keyword, Attributes attrs) {
    int direct = ElementDictionary.tagForKeyword(keyword, null);
    if (direct >= 0) {
      return direct;
    }

    String normalized = normalizeKeyword(keyword);
    for (int tag : attrs.tags()) {
      String candidate = ElementDictionary.keywordOf(tag, null);
      if (candidate != null && normalizeKeyword(candidate).equals(normalized)) {
        return tag;
      }
    }
    return -1;
  }

  private String normalizeKeyword(String keyword) {
    StringBuilder out = new StringBuilder(keyword.length());
    for (char c : keyword.toCharArray()) {
      if (Character.isLetterOrDigit(c)) {
        out.append(Character.toLowerCase(c));
      }
    }
    return out.toString();
  }

  private boolean matchesDicomKeys(Attributes attrs, Attributes keys, QueryRequest request) {
    for (int tag : keys.tags()) {
      if (tag == Tag.QueryRetrieveLevel) {
        continue;
      }
      VR vr = keys.getVR(tag);
      if (vr == null) {
        continue;
      }
      if (vr == VR.SQ) {
        if (!matchesSequence(attrs, tag, keys.getSequence(tag), request)) {
          return false;
        }
        continue;
      }
      if (!matchesTagValue(attrs, keys.getString(tag, ""), tag, vr, request)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Checks whether every item in the key sequence has at least one matching item in the
   * corresponding sequence in {@code attrs}. An empty key sequence is a universal match.
   */
  private boolean matchesSequence(
      Attributes attrs, int tag, Sequence keySeq, QueryRequest request) {
    if (keySeq == null || keySeq.isEmpty()) {
      return true;
    }
    Sequence attrSeq = attrs.getSequence(tag);
    if (attrSeq == null || attrSeq.isEmpty()) {
      return false;
    }
    outer:
    for (Attributes keyItem : keySeq) {
      for (Attributes attrItem : attrSeq) {
        if (matchesDicomKeys(attrItem, keyItem, request)) {
          continue outer;
        }
      }
      return false;
    }
    return true;
  }

  private boolean matchesTagValue(
      Attributes attrs, String keyValue, int tag, VR vr, QueryRequest request) {
    if (keyValue == null || keyValue.isEmpty()) {
      return true;
    }

    String attrValue = attrs.getString(tag, "");

    // --- Date / Time / DateTime range matching ("start-end" or "-end" or "start-") ---
    // DA and TM ranges are always evaluated (PS 3.4 C.2.2.2.5).
    // DT ranges are only evaluated when Combined Datetime Matching has been negotiated.
    if (vr == VR.DA || vr == VR.TM || (vr == VR.DT && request.dateTimeMatchingEnabled())) {
      if (keyValue.contains("-")) {
        return matchesRange(attrValue, keyValue);
      }
    }

    // --- Wildcard matching ---
    // For PN values, flatten ^/= component separators so that a pattern like "F*"
    // matches the family-name component of "FELIX^ALMEIDA" without requiring the
    // caller to know the internal component structure.
    if (keyValue.contains("*") || keyValue.contains("?")) {
      String matchTarget = (vr == VR.PN) ? flattenPn(attrValue) : attrValue;
      return matchesWildcard(matchTarget, keyValue);
    }

    // --- Fuzzy person-name matching ---
    // Flatten PN components before the substring search so that tokens like
    // "felixal" can match across the ^ boundary in "FELIX^ALMEIDA".
    if (vr == VR.PN && request.fuzzyMatchingEnabled()) {
      String normalized = normalizePnForFuzzy(attrValue).toLowerCase(Locale.ROOT);
      return normalized.contains(keyValue.toLowerCase(Locale.ROOT));
    }

    // --- Multi-value (backslash-separated) matching ---
    if (keyValue.contains("\\")) {
      String[] values = keyValue.split("\\\\");
      for (String v : values) {
        if (v.equalsIgnoreCase(attrValue)) {
          return true;
        }
      }
      return false;
    }

    // --- Exact match (case-insensitive) ---
    return keyValue.equalsIgnoreCase(attrValue);
  }

  /**
   * Replaces DICOM PN component separators ({@code ^} and {@code =}) with spaces so that the
   * resulting string can be matched with simple substring or wildcard logic without knowledge of
   * the PN internal structure.
   *
   * <p>Example: {@code "FELIX^ALMEIDA"} → {@code "FELIX ALMEIDA"}.
   */
  private static String flattenPn(String pnValue) {
    return PN_SEPARATOR.matcher(pnValue).replaceAll(" ").trim();
  }

  private static String normalizePnForFuzzy(String pnValue) {
    String flattened = PN_SEPARATOR.matcher(pnValue).replaceAll("");
    return flattened.replaceAll("\\s+", "");
  }

  /**
   * Evaluates a DICOM range constraint of the form {@code "start-end"}, {@code "-end"}, or {@code
   * "start-"}. The comparison is purely lexicographic, which is correct for DA ({@code YYYYMMDD}),
   * TM ({@code HHMMSS.FFFFFF}), and DT ({@code YYYYMMDDHHmmSS...}) because their canonical forms
   * sort in chronological order.
   */
  private boolean matchesRange(String value, String range) {
    int dash = range.indexOf('-');
    String lo = range.substring(0, dash).trim();
    String hi = range.substring(dash + 1).trim();
    if (!lo.isEmpty() && value.compareTo(lo) < 0) {
      return false;
    }
    if (!hi.isEmpty() && value.compareTo(hi) > 0) {
      return false;
    }
    return true;
  }

  private boolean matchesWildcard(String value, String pattern) {
    StringBuilder regex = new StringBuilder("(?i)");
    for (int i = 0; i < pattern.length(); i++) {
      char c = pattern.charAt(i);
      switch (c) {
        case '*':
          regex.append(".*");
          break;
        case '?':
          regex.append('.');
          break;
        case '.':
        case '\\':
        case '[':
        case ']':
        case '{':
        case '}':
        case '(':
        case ')':
        case '+':
        case '-':
        case '^':
        case '$':
        case '|':
          regex.append('\\').append(c);
          break;
        default:
          regex.append(c);
      }
    }
    return value.matches(regex.toString());
  }

  private Attributes filterByLevel(Attributes attrs, QueryRetrieveLevel level) {
    return attrs;
  }

  private boolean hasText(String value) {
    return value != null && !value.isBlank();
  }
}
