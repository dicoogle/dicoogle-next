package pt.ua.dicooglenext.storage.filerw;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.io.DicomInputStream;
import pt.ua.dicooglenext.sdk.PluginMetadata;
import pt.ua.dicooglenext.sdk.storage.HierarchicalDicomStoragePlugin;
import pt.ua.dicooglenext.sdk.storage.StoredObject;

public class FileReadWriteStoragePlugin implements HierarchicalDicomStoragePlugin {

  private static final String UNKNOWN = "UNKNOWN";
  private static final Pattern SAFE_SEGMENT_PATTERN = Pattern.compile("[^A-Za-z0-9._-]");
  private static final PluginMetadata METADATA =
      new PluginMetadata("storage-file-rw", "Filesystem Read-Write Storage", "0.1.0", "storage");

  private final Path rootDirectory;
  private final String scheme;

  public FileReadWriteStoragePlugin(Path rootDirectory, String scheme) {
    this.rootDirectory = Objects.requireNonNull(rootDirectory).toAbsolutePath().normalize();
    this.scheme = (scheme == null || scheme.isBlank()) ? "file" : scheme;
  }

  @Override
  public PluginMetadata metadata() {
    return METADATA;
  }

  @Override
  public String scheme() {
    return scheme;
  }

  @Override
  public boolean canRead() {
    return true;
  }

  @Override
  public boolean canWrite() {
    return true;
  }

  @Override
  public InputStream openForRead(URI location) throws IOException {
    if (!location.getScheme().equalsIgnoreCase(scheme)) {
      throw new IOException("Unsupported URI scheme: " + location.getScheme());
    }

    Path path = toPath(location);
    return Files.newInputStream(path);
  }

  @Override
  public StoredObject store(InputStream data, String contentType) throws IOException {
    byte[] bytes = data.readAllBytes();
    if (bytes.length == 0) {
      throw new IOException("Cannot store empty payload");
    }

    DicomHierarchy hierarchy = extractHierarchy(bytes);

    Path relativePath =
        Path.of(
            safeSegment(hierarchy.patientId()),
            safeSegment(hierarchy.studyInstanceUid()),
            safeSegment(hierarchy.seriesInstanceUid()),
            safeSegment(hierarchy.sopInstanceUid()) + ".dcm");

    Path target = rootDirectory.resolve(relativePath).normalize();
    if (!target.startsWith(rootDirectory)) {
      throw new IOException("Resolved path escaped root directory");
    }

    Files.createDirectories(target.getParent());

    Path tmp = target.resolveSibling(target.getFileName() + ".tmp");
    Files.write(tmp, bytes);
    Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);

    URI location =
        scheme.equalsIgnoreCase("file")
            ? target.toUri()
            : URI.create(scheme + ":" + target.toAbsolutePath());

    return new StoredObject(location, bytes.length, contentType);
  }

  @Override
  public Optional<URI> locateInstance(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) throws IOException {
    String safeStudy = safeSegment(studyInstanceUid);
    String safeSeries = safeSegment(seriesInstanceUid);
    String safeSop = safeSegment(sopInstanceUid) + ".dcm";

    if (!Files.exists(rootDirectory)) {
      return Optional.empty();
    }

    try (var patientDirs = Files.list(rootDirectory)) {
      return patientDirs
          .filter(Files::isDirectory)
          .map(patientDir -> patientDir.resolve(safeStudy).resolve(safeSeries).resolve(safeSop))
          .filter(Files::exists)
          .map(Path::toUri)
          .findFirst();
    }
  }

  @Override
  public List<URI> listStudyInstances(String studyInstanceUid) throws IOException {
    String safeStudy = safeSegment(studyInstanceUid);
    List<URI> results = new ArrayList<>();

    if (!Files.exists(rootDirectory)) {
      return results;
    }

    try (var patientDirs = Files.list(rootDirectory)) {
      for (Path patientDir : patientDirs.filter(Files::isDirectory).toList()) {
        Path studyDir = patientDir.resolve(safeStudy);
        if (!Files.isDirectory(studyDir)) {
          continue;
        }
        collectDicomFiles(studyDir, results);
      }
    }

    return results;
  }

  @Override
  public List<URI> listSeriesInstances(String studyInstanceUid, String seriesInstanceUid)
      throws IOException {
    String safeStudy = safeSegment(studyInstanceUid);
    String safeSeries = safeSegment(seriesInstanceUid);
    List<URI> results = new ArrayList<>();

    if (!Files.exists(rootDirectory)) {
      return results;
    }

    try (var patientDirs = Files.list(rootDirectory)) {
      for (Path patientDir : patientDirs.filter(Files::isDirectory).toList()) {
        Path seriesDir = patientDir.resolve(safeStudy).resolve(safeSeries);
        if (!Files.isDirectory(seriesDir)) {
          continue;
        }
        collectDicomFiles(seriesDir, results);
      }
    }

    return results;
  }

  private DicomHierarchy extractHierarchy(byte[] bytes) throws IOException {
    try (DicomInputStream dis = new DicomInputStream(new ByteArrayInputStream(bytes))) {
      Attributes attrs = dis.readDataset();

      String patientId = attrs.getString(Tag.PatientID, UNKNOWN);
      String study = attrs.getString(Tag.StudyInstanceUID, UNKNOWN);
      String series = attrs.getString(Tag.SeriesInstanceUID, UNKNOWN);
      String sop = attrs.getString(Tag.SOPInstanceUID, UNKNOWN);

      return new DicomHierarchy(patientId, study, series, sop);
    }
  }

  private Path toPath(URI location) throws IOException {
    Path candidate;
    if (location.getScheme().equalsIgnoreCase("file")) {
      candidate = Path.of(location);
    } else {
      String schemeSpecificPart = location.getSchemeSpecificPart();
      candidate = Path.of(schemeSpecificPart);
    }

    candidate = candidate.toAbsolutePath().normalize();
    if (!candidate.startsWith(rootDirectory)) {
      throw new IOException("Path outside configured storage root");
    }
    return candidate;
  }

  private String safeSegment(String value) {
    String normalized = (value == null || value.isBlank()) ? UNKNOWN : value;
    return SAFE_SEGMENT_PATTERN.matcher(normalized).replaceAll("_");
  }

  private void collectDicomFiles(Path directory, List<URI> output) throws IOException {
    try (var walk = Files.walk(directory)) {
      walk.filter(Files::isRegularFile)
          .filter(path -> path.getFileName().toString().toLowerCase().endsWith(".dcm"))
          .map(Path::toUri)
          .forEach(output::add);
    }
  }

  private record DicomHierarchy(
      String patientId, String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) {}
}
