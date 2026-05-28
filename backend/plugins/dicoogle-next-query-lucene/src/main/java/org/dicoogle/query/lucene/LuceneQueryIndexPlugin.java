package org.dicoogle.query.lucene;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import org.apache.lucene.analysis.standard.StandardAnalyzer;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;
import org.apache.lucene.document.StoredField;
import org.apache.lucene.document.StringField;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.index.Term;
import org.apache.lucene.queryparser.classic.ParseException;
import org.apache.lucene.queryparser.classic.QueryParser;
import org.apache.lucene.search.BooleanClause;
import org.apache.lucene.search.BooleanQuery;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.MatchAllDocsQuery;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TermQuery;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.store.Directory;
import org.apache.lucene.store.FSDirectory;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.ElementDictionary;
import org.dcm4che3.data.Sequence;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomInputStream;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.PluginMetadata;
import org.dicoogle.sdk.query.QueryIndexMaintenance;
import org.dicoogle.sdk.query.QueryIndexStorageLocator;
import org.dicoogle.sdk.query.QueryMoveService;
import org.dicoogle.sdk.query.QueryRetrieveLevel;
import org.dicoogle.sdk.query.QueryService;
import org.dicoogle.sdk.query.StorageIngestEventListener;
import org.dicoogle.sdk.storage.StorageIngestFailureEvent;
import org.dicoogle.sdk.storage.StorageIngestSuccessEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class LuceneQueryIndexPlugin
    implements StorageIngestEventListener,
        QueryService,
        QueryMoveService,
        QueryIndexStorageLocator,
        QueryIndexMaintenance {

  private static final Logger LOGGER = LoggerFactory.getLogger(LuceneQueryIndexPlugin.class);
  private static final PluginMetadata METADATA =
      new PluginMetadata("query-lucene", "Lucene Query/Index", "0.1.0", "query-index");

  private final StorageRouter storageRouter;
  private final LuceneQueryProperties properties;
  private final Path storageRoot;
  private final Directory directory;
  private final IndexWriter writer;
  private final LuceneStorageWatcher watcher;

  public LuceneQueryIndexPlugin(StorageRouter storageRouter, LuceneQueryProperties properties)
      throws IOException {
    this.storageRouter = Objects.requireNonNull(storageRouter);
    this.properties = Objects.requireNonNull(properties);
    this.storageRoot = Path.of(properties.getStorageRootDir()).toAbsolutePath().normalize();

    Path indexDir =
        Path.of(properties.getRootDir())
            .resolve(properties.getIndexName())
            .toAbsolutePath()
            .normalize();
    Files.createDirectories(indexDir);

    BooleanQuery.setMaxClauseCount(Math.max(128, properties.getMaxBooleanClauses()));
    this.directory = FSDirectory.open(indexDir);
    this.writer = new IndexWriter(directory, new IndexWriterConfig(new StandardAnalyzer()));
    this.watcher = new LuceneStorageWatcher(storageRoot, this, properties.isWatchStorage());
  }

  @Override
  public PluginMetadata metadata() {
    return METADATA;
  }

  @Override
  public String indexId() {
    return "query-lucene";
  }

  @Override
  public int indexedDocuments() throws IOException {
    try (DirectoryReader reader = DirectoryReader.open(writer)) {
      return reader.numDocs();
    }
  }

  @Override
  public int reindex() throws IOException {
    writer.deleteAll();
    writer.commit();

    if (!Files.isDirectory(storageRoot)) {
      return 0;
    }

    int indexed = 0;
    try (var walk = Files.walk(storageRoot)) {
      for (Path path : walk.filter(Files::isRegularFile).toList()) {
        if (!path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".dcm")) {
          continue;
        }
        if (indexPath(path)) {
          indexed++;
        }
      }
    }
    writer.commit();
    return indexed;
  }

  @Override
  public void start() {
    if (properties.isAutoReindexOnStartup()) {
      try {
        int count = reindex();
        LOGGER.info("Lucene index reindexed on startup: documents={}", count);
      } catch (IOException ex) {
        LOGGER.warn("Failed to reindex lucene on startup: {}", ex.getMessage());
      }
    }
    watcher.start();
  }

  @Override
  public void stop() {
    watcher.stop();
    try {
      writer.close();
    } catch (IOException ex) {
      LOGGER.debug("Error closing lucene writer", ex);
    }
    try {
      directory.close();
    } catch (IOException ex) {
      LOGGER.debug("Error closing lucene directory", ex);
    }
  }

  @Override
  public void onIngestSuccess(StorageIngestSuccessEvent event) {
    try {
      indexUri(event.location(), event.storageScheme());
      writer.commit();
    } catch (Exception ex) {
      LOGGER.warn("Failed to index ingested object at {}: {}", event.location(), ex.getMessage());
    }
  }

  @Override
  public void onIngestFailure(StorageIngestFailureEvent event) {}

  @Override
  public List<Attributes> query(QueryRequest request) throws IOException {
    if (indexedDocuments() == 0) {
      return List.of();
    }

    List<URI> uris = resolveLocations(buildQuery(request), properties.getSearchLimit());
    Set<String> seen = new LinkedHashSet<>();
    List<Attributes> out = new ArrayList<>();
    String freeText =
        request.freeText() == null ? null : request.freeText().toLowerCase(Locale.ROOT);
    Map<String, String> filters = request.keywordFilters();

    for (URI uri : uris) {
      if (!seen.add(uri.toString())) {
        continue;
      }
      if (request.cancelRequested() != null && request.cancelRequested().getAsBoolean()) {
        break;
      }
      Attributes attrs = readDataset(uri);
      if (!matchesFreeText(attrs, freeText)) {
        continue;
      }
      if (!matchesKeywordFilters(attrs, filters, request)) {
        continue;
      }
      if (!matchesDicomKeys(attrs, request.keys(), request)) {
        continue;
      }
      out.add(filterByLevel(attrs, request.level()));
    }

    return out;
  }

  @Override
  public List<QueryMoveService.MoveCandidate> resolve(QueryMoveService.MoveRequest request)
      throws IOException {
    List<URI> uris = resolveLocations(buildMoveQuery(request), properties.getSearchLimit());
    Set<String> seen = new LinkedHashSet<>();
    List<QueryMoveService.MoveCandidate> out = new ArrayList<>();

    for (URI uri : uris) {
      if (!seen.add(uri.toString())) {
        continue;
      }
      if (request.cancelRequested() != null && request.cancelRequested().getAsBoolean()) {
        break;
      }

      Attributes attrs = readDataset(uri);
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
      out.add(new QueryMoveService.MoveCandidate(sopClassUid, sopInstanceUid, uri));
    }

    return out;
  }

  @Override
  public java.util.Optional<URI> locateInstance(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) throws IOException {
    BooleanQuery.Builder builder = new BooleanQuery.Builder();
    builder.add(
        term(LuceneIndexerFields.STUDY_INSTANCE_UID, studyInstanceUid), BooleanClause.Occur.FILTER);
    builder.add(
        term(LuceneIndexerFields.SERIES_INSTANCE_UID, seriesInstanceUid),
        BooleanClause.Occur.FILTER);
    builder.add(
        term(LuceneIndexerFields.SOP_INSTANCE_UID, sopInstanceUid), BooleanClause.Occur.FILTER);

    List<URI> out = resolveLocations(builder.build(), 1);
    return out.isEmpty() ? java.util.Optional.empty() : java.util.Optional.of(out.getFirst());
  }

  @Override
  public List<URI> listStudyInstances(String studyInstanceUid) throws IOException {
    return resolveLocations(
        term(LuceneIndexerFields.STUDY_INSTANCE_UID, studyInstanceUid),
        properties.getSearchLimit());
  }

  @Override
  public List<URI> listSeriesInstances(String studyInstanceUid, String seriesInstanceUid)
      throws IOException {
    BooleanQuery.Builder builder = new BooleanQuery.Builder();
    builder.add(
        term(LuceneIndexerFields.STUDY_INSTANCE_UID, studyInstanceUid), BooleanClause.Occur.FILTER);
    builder.add(
        term(LuceneIndexerFields.SERIES_INSTANCE_UID, seriesInstanceUid),
        BooleanClause.Occur.FILTER);
    return resolveLocations(builder.build(), properties.getSearchLimit());
  }

  @Override
  public List<URI> listAllInstances() throws IOException {
    return resolveLocations(new MatchAllDocsQuery(), properties.getSearchLimit());
  }

  boolean indexPath(Path path) {
    try {
      indexUri(path.toUri(), "file");
      return true;
    } catch (Exception ex) {
      LOGGER.debug("Skipping non-indexable file {}", path, ex);
      return false;
    }
  }

  boolean isIndexablePath(Path path) {
    return isLikelyDicomFile(path);
  }

  void removePath(Path path) throws IOException {
    writer.deleteDocuments(new Term(LuceneIndexerFields.LOCATION, path.toUri().toString()));
  }

  @Override
  public int indexPath(URI uri) throws IOException {
    Path path = validatePathReference(uri);
    if (Files.isDirectory(path)) {
      int indexed = 0;
      try (var walk = Files.walk(path)) {
        for (Path p : walk.filter(Files::isRegularFile).toList()) {
          if (!isLikelyDicomFile(p)) {
            continue;
          }
          if (indexPath(p)) {
            indexed++;
          }
        }
      }
      writer.commit();
      return indexed;
    }
    if (!Files.isRegularFile(path) || !isLikelyDicomFile(path)) {
      return 0;
    }
    boolean indexed = indexPath(path);
    writer.commit();
    return indexed ? 1 : 0;
  }

  @Override
  public int unindexPath(URI uri) throws IOException {
    Path path = validatePathReference(uri);
    if (Files.isDirectory(path)) {
      int removed = 0;
      try (var walk = Files.walk(path)) {
        for (Path p : walk.filter(Files::isRegularFile).toList()) {
          if (!isLikelyDicomFile(p)) {
            continue;
          }
          removePath(p);
          removed++;
        }
      }
      writer.commit();
      return removed;
    }
    if (!isLikelyDicomFile(path)) {
      return 0;
    }
    removePath(path);
    writer.commit();
    return 1;
  }

  private Path validatePathReference(URI uri) {
    if (uri == null) {
      throw new IllegalArgumentException("Path reference must not be null");
    }
    if (uri.getScheme() == null || uri.getScheme().isBlank()) {
      return Path.of(uri.toString()).toAbsolutePath().normalize();
    }
    if ("file".equalsIgnoreCase(uri.getScheme())) {
      return Path.of(uri).toAbsolutePath().normalize();
    }
    throw new IllegalArgumentException("Only filesystem paths are supported for path indexing");
  }

  private boolean isLikelyDicomFile(Path path) {
    if (!Files.isRegularFile(path)) {
      return false;
    }
    String name = path.getFileName() == null ? "" : path.getFileName().toString();
    if (name.toLowerCase(Locale.ROOT).endsWith(".dcm")) {
      return true;
    }
    try (InputStream stream = Files.newInputStream(path);
        DicomInputStream dis = new DicomInputStream(stream)) {
      Attributes attrs = dis.readDataset();
      return hasText(attrs.getString(Tag.SOPInstanceUID, null));
    } catch (Exception ex) {
      return false;
    }
  }

  private void indexUri(URI location, String defaultScheme) throws IOException {
    Attributes attrs = readDataset(location);
    String sopInstanceUid = attrs.getString(Tag.SOPInstanceUID, null);
    if (!hasText(sopInstanceUid)) {
      return;
    }
    String studyInstanceUid = attrs.getString(Tag.StudyInstanceUID, "");
    String seriesInstanceUid = attrs.getString(Tag.SeriesInstanceUID, "");
    String sopClassUid = attrs.getString(Tag.SOPClassUID, "");
    String patientId = attrs.getString(Tag.PatientID, "");
    String patientName = attrs.getString(Tag.PatientName, "");
    String modality = attrs.getString(Tag.Modality, "");
    String studyDescription = attrs.getString(Tag.StudyDescription, "");
    String seriesDescription = attrs.getString(Tag.SeriesDescription, "");
    String accessionNumber = attrs.getString(Tag.AccessionNumber, "");
    String studyDate = attrs.getString(Tag.StudyDate, "");
    String studyTime = attrs.getString(Tag.StudyTime, "");
    String acquisitionDateTime = attrs.getString(Tag.AcquisitionDateTime, "");

    String scheme = hasText(location.getScheme()) ? location.getScheme() : defaultScheme;

    Document doc = new Document();
    doc.add(new StringField(LuceneIndexerFields.KEY, location.toString(), Field.Store.NO));
    doc.add(
        new StringField(LuceneIndexerFields.STUDY_INSTANCE_UID, studyInstanceUid, Field.Store.NO));
    doc.add(
        new StringField(
            LuceneIndexerFields.SERIES_INSTANCE_UID, seriesInstanceUid, Field.Store.NO));
    doc.add(new StringField(LuceneIndexerFields.SOP_INSTANCE_UID, sopInstanceUid, Field.Store.NO));
    doc.add(new StringField(LuceneIndexerFields.SOP_CLASS_UID, sopClassUid, Field.Store.NO));
    doc.add(new StringField(LuceneIndexerFields.PATIENT_ID, patientId, Field.Store.NO));
    doc.add(new StringField(LuceneIndexerFields.MODALITY, modality, Field.Store.NO));
    doc.add(new StringField(LuceneIndexerFields.ACCESSION_NUMBER, accessionNumber, Field.Store.NO));
    doc.add(new StringField(LuceneIndexerFields.STUDY_DATE, studyDate, Field.Store.NO));
    doc.add(new StringField(LuceneIndexerFields.STUDY_TIME, studyTime, Field.Store.NO));
    doc.add(
        new StringField(
            LuceneIndexerFields.ACQUISITION_DATE_TIME, acquisitionDateTime, Field.Store.NO));
    doc.add(
        new StringField(
            LuceneIndexerFields.PATIENT_NAME_NORMALIZED,
            LuceneValueNormalizer.normalizeForFuzzy(patientName),
            Field.Store.NO));
    doc.add(new StringField(LuceneIndexerFields.LOCATION, location.toString(), Field.Store.YES));
    doc.add(
        new StoredField(
            LuceneIndexerFields.STORAGE_SCHEME, LuceneValueNormalizer.nullToEmpty(scheme)));

    doc.add(
        new TextField(
            LuceneIndexerFields.PATIENT_NAME,
            LuceneValueNormalizer.nullToEmpty(patientName),
            Field.Store.NO));
    doc.add(
        new TextField(
            LuceneIndexerFields.ALL_TEXT,
            String.join(
                " ",
                LuceneValueNormalizer.nullToEmpty(patientName),
                LuceneValueNormalizer.nullToEmpty(patientId),
                LuceneValueNormalizer.nullToEmpty(accessionNumber),
                LuceneValueNormalizer.nullToEmpty(studyDescription),
                LuceneValueNormalizer.nullToEmpty(seriesDescription),
                LuceneValueNormalizer.nullToEmpty(modality)),
            Field.Store.NO));

    writer.updateDocument(new Term(LuceneIndexerFields.KEY, location.toString()), doc);
  }

  private Attributes readDataset(URI location) throws IOException {
    try (InputStream stream =
            storageRouter.requireReadable(location.getScheme()).openForRead(location);
        DicomInputStream dis = new DicomInputStream(stream)) {
      return dis.readDataset();
    }
  }

  private List<URI> resolveLocations(Query query, int limit) throws IOException {
    List<URI> out = new ArrayList<>();
    try (DirectoryReader reader = DirectoryReader.open(writer)) {
      if (reader.numDocs() == 0) {
        return out;
      }
      IndexSearcher searcher = new IndexSearcher(reader);
      TopDocs topDocs = searcher.search(query, Math.max(1, limit));
      for (ScoreDoc scoreDoc : topDocs.scoreDocs) {
        Document doc = searcher.doc(scoreDoc.doc);
        String location = doc.get(LuceneIndexerFields.LOCATION);
        if (!hasText(location)) {
          continue;
        }
        out.add(URI.create(location));
      }
    }
    return out;
  }

  private Query buildQuery(QueryRequest request) {
    BooleanQuery.Builder builder = new BooleanQuery.Builder();
    addLevelFilters(builder, request.level(), request.keys());

    if (hasText(request.freeText())) {
      try {
        QueryParser parser = new QueryParser(LuceneIndexerFields.ALL_TEXT, new StandardAnalyzer());
        builder.add(parser.parse(QueryParser.escape(request.freeText())), BooleanClause.Occur.MUST);
      } catch (ParseException ex) {
        builder.add(new MatchAllDocsQuery(), BooleanClause.Occur.FILTER);
      }
    }

    addKeywordFieldFilters(builder, request.keywordFilters());

    BooleanQuery query = builder.build();
    return query.clauses().isEmpty() ? new MatchAllDocsQuery() : query;
  }

  private Query buildMoveQuery(QueryMoveService.MoveRequest request) {
    BooleanQuery.Builder builder = new BooleanQuery.Builder();
    addLevelFilters(builder, request.level(), request.keys());
    BooleanQuery query = builder.build();
    return query.clauses().isEmpty() ? new MatchAllDocsQuery() : query;
  }

  private void addLevelFilters(
      BooleanQuery.Builder builder, QueryRetrieveLevel level, Attributes keys) {
    String studyUid = keys.getString(Tag.StudyInstanceUID, null);
    String seriesUid = keys.getString(Tag.SeriesInstanceUID, null);
    String sopUid = keys.getString(Tag.SOPInstanceUID, null);

    if (level == QueryRetrieveLevel.STUDY && hasText(studyUid)) {
      builder.add(
          term(LuceneIndexerFields.STUDY_INSTANCE_UID, studyUid), BooleanClause.Occur.FILTER);
      return;
    }
    if (level == QueryRetrieveLevel.SERIES && hasText(studyUid) && hasText(seriesUid)) {
      builder.add(
          term(LuceneIndexerFields.STUDY_INSTANCE_UID, studyUid), BooleanClause.Occur.FILTER);
      builder.add(
          term(LuceneIndexerFields.SERIES_INSTANCE_UID, seriesUid), BooleanClause.Occur.FILTER);
      return;
    }
    if (level == QueryRetrieveLevel.IMAGE
        && hasText(studyUid)
        && hasText(seriesUid)
        && hasText(sopUid)) {
      builder.add(
          term(LuceneIndexerFields.STUDY_INSTANCE_UID, studyUid), BooleanClause.Occur.FILTER);
      builder.add(
          term(LuceneIndexerFields.SERIES_INSTANCE_UID, seriesUid), BooleanClause.Occur.FILTER);
      builder.add(term(LuceneIndexerFields.SOP_INSTANCE_UID, sopUid), BooleanClause.Occur.FILTER);
    }
  }

  private void addKeywordFieldFilters(BooleanQuery.Builder builder, Map<String, String> filters) {
    if (filters == null || filters.isEmpty()) {
      return;
    }

    for (Map.Entry<String, String> entry : filters.entrySet()) {
      String field = mappedField(entry.getKey());
      if (!hasText(field) || !hasText(entry.getValue())) {
        continue;
      }
      if (entry.getValue().indexOf('*') >= 0
          || entry.getValue().indexOf('?') >= 0
          || entry.getValue().indexOf('\\') >= 0
          || entry.getValue().indexOf('-') >= 0) {
        continue;
      }
      builder.add(term(field, entry.getValue()), BooleanClause.Occur.FILTER);
    }
  }

  private Query term(String field, String value) {
    return new TermQuery(new Term(field, value));
  }

  private String mappedField(String keyword) {
    String normalized = normalizeKeyword(keyword);
    return switch (normalized) {
      case "studyinstanceuid" -> LuceneIndexerFields.STUDY_INSTANCE_UID;
      case "seriesinstanceuid" -> LuceneIndexerFields.SERIES_INSTANCE_UID;
      case "sopinstanceuid" -> LuceneIndexerFields.SOP_INSTANCE_UID;
      case "sopclassuid" -> LuceneIndexerFields.SOP_CLASS_UID;
      case "patientid" -> LuceneIndexerFields.PATIENT_ID;
      case "modality" -> LuceneIndexerFields.MODALITY;
      case "accessionnumber" -> LuceneIndexerFields.ACCESSION_NUMBER;
      case "studydate" -> LuceneIndexerFields.STUDY_DATE;
      case "studytime" -> LuceneIndexerFields.STUDY_TIME;
      case "acquisitiondatetime" -> LuceneIndexerFields.ACQUISITION_DATE_TIME;
      default -> null;
    };
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
      if (vr == VR.SQ) {
        if (!matchesSequence(attrs, keys, tag, request)) {
          return false;
        }
        continue;
      }

      String expected = keys.getString(tag, null);
      if (!hasText(expected)) {
        continue;
      }
      if (!matchesTagValue(attrs, expected, tag, vr, request)) {
        return false;
      }
    }
    return true;
  }

  private boolean matchesTagValue(
      Attributes attrs, String expected, int tag, VR vr, QueryRequest request) {
    String actual = attrs.getString(tag, "");
    if (vr == VR.UI) {
      return matchesUidValue(actual, expected);
    }
    if (vr == VR.DA) {
      return matchesRangeValue(actual, expected);
    }
    if (vr == VR.TM) {
      return matchesRangeValue(actual, expected);
    }
    if (vr == VR.DT) {
      return request.dateTimeMatchingEnabled() && matchesRangeValue(actual, expected);
    }
    boolean fuzzy = vr == VR.PN && request.fuzzyMatchingEnabled();
    return matchesStringValue(actual, expected, fuzzy);
  }

  private boolean matchesUidValue(String actual, String expected) {
    for (String candidate : splitMultiValue(expected)) {
      if (actual.equals(candidate)) {
        return true;
      }
    }
    return false;
  }

  private boolean matchesStringValue(String actual, String expected, boolean fuzzy) {
    for (String candidate : splitMultiValue(expected)) {
      if (fuzzy) {
        if (LuceneValueNormalizer.normalizeForFuzzy(actual)
            .contains(LuceneValueNormalizer.normalizeForFuzzy(candidate))) {
          return true;
        }
        continue;
      }

      if (candidate.indexOf('*') >= 0 || candidate.indexOf('?') >= 0) {
        String regex = wildcardToRegex(candidate);
        if (Pattern.compile(regex, Pattern.CASE_INSENSITIVE | Pattern.DOTALL)
            .matcher(actual)
            .matches()) {
          return true;
        }
        continue;
      }

      if (actual.equalsIgnoreCase(candidate)) {
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

  private boolean matchesRangeValue(String actual, String expected) {
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

  private boolean matchesSequence(
      Attributes attrs, Attributes keys, int tag, QueryRequest request) {
    Sequence expected = keys.getSequence(tag);
    if (expected == null || expected.isEmpty()) {
      return true;
    }
    Sequence actual = attrs.getSequence(tag);
    if (actual == null || actual.isEmpty()) {
      return false;
    }

    for (Attributes expectedItem : expected) {
      boolean matchedOne = false;
      for (Attributes actualItem : actual) {
        if (matchesDicomKeys(actualItem, expectedItem, request)) {
          matchedOne = true;
          break;
        }
      }
      if (!matchedOne) {
        return false;
      }
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
}
