package pt.ua.dicooglenext.storage.filero;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import pt.ua.dicooglenext.sdk.PluginMetadata;
import pt.ua.dicooglenext.sdk.storage.HierarchicalDicomStoragePlugin;

public class FileReadOnlyStoragePlugin implements HierarchicalDicomStoragePlugin {

  private static final PluginMetadata METADATA =
      new PluginMetadata("storage-file-ro", "Filesystem Read-Only Storage", "0.1.0", "storage");
  private final Path rootDirectory;

  public FileReadOnlyStoragePlugin() {
    this(Path.of("./data/storage"));
  }

  public FileReadOnlyStoragePlugin(Path rootDirectory) {
    this.rootDirectory = rootDirectory.toAbsolutePath().normalize();
  }

  @Override
  public PluginMetadata metadata() {
    return METADATA;
  }

  @Override
  public String scheme() {
    return "file";
  }

  @Override
  public boolean canRead() {
    return true;
  }

  @Override
  public boolean canWrite() {
    return false;
  }

  @Override
  public InputStream openForRead(URI location) throws IOException {
    Path path = Path.of(location);
    return Files.newInputStream(path);
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

  private String safeSegment(String value) {
    if (value == null || value.isBlank()) {
      return "UNKNOWN";
    }
    return value.replaceAll("[^A-Za-z0-9._-]", "_");
  }

  private void collectDicomFiles(Path directory, List<URI> output) throws IOException {
    try (var walk = Files.walk(directory)) {
      walk.filter(Files::isRegularFile)
          .filter(path -> path.getFileName().toString().toLowerCase().endsWith(".dcm"))
          .map(Path::toUri)
          .forEach(output::add);
    }
  }
}
