package org.dicoogle.app.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/indexer")
public class FilesystemController {

  private static final Logger log = LoggerFactory.getLogger(FilesystemController.class);
  private static final int DEFAULT_MAX_ENTRIES = 1000;

  private final Path storageRoot;
  private final int maxEntries;

  public FilesystemController(
      @Value("${app.storage.file-ro.root-dir:./data/storage}") String rootDir,
      @Value("${filesystem.max-entries:" + DEFAULT_MAX_ENTRIES + "}") int maxEntries) {
    this.storageRoot = Path.of(rootDir).toAbsolutePath().normalize();
    this.maxEntries = maxEntries > 0 ? maxEntries : DEFAULT_MAX_ENTRIES;
  }

  @GetMapping(produces = MediaType.APPLICATION_XML_VALUE)
  @Operation(
      summary = "List directory contents (legacy indexer endpoint)",
      security = @SecurityRequirement(name = "bearerAuth"))
  public ResponseEntity<String> pathContents(
      @RequestParam(value = "action", required = false) String action,
      @RequestParam(value = "path", required = false, defaultValue = "") String path,
      HttpServletResponse response)
      throws IOException {

    if (!"pathcontents".equals(action)) {
      return ResponseEntity.badRequest().body("<error>action=pathcontents required</error>");
    }

    Path target = resolveAndValidate(path);

    List<PathEntry> entries = new ArrayList<>();
    listDirectory(target, entries);

    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_XML)
        .body(buildXml(target, entries));
  }

  private Path resolveAndValidate(String userPath) throws IOException {
    if (userPath == null || userPath.isBlank()) {
      return requireInsideRoot(storageRoot);
    }

    Path inputPath = Path.of(userPath.replace('\\', '/')).normalize();

    // Try as absolute path first
    if (inputPath.isAbsolute() && Files.exists(inputPath)) {
      return requireInsideRoot(inputPath);
    }

    // Always resolve relative to storage root
    String relative =
        inputPath.isAbsolute() ? inputPath.toString().substring(1) : inputPath.toString();
    Path resolved = storageRoot.resolve(relative).normalize();
    return requireInsideRoot(resolved);
  }

  private Path requireInsideRoot(Path candidate) throws IOException {
    Path realTarget;
    try {
      realTarget = candidate.toRealPath(LinkOption.NOFOLLOW_LINKS);
    } catch (IOException e) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Path does not exist: " + candidate);
    }

    Path realRoot;
    try {
      realRoot = storageRoot.toRealPath(LinkOption.NOFOLLOW_LINKS);
    } catch (IOException e) {
      throw new ResponseStatusException(
          HttpStatus.INTERNAL_SERVER_ERROR, "Storage root does not exist");
    }

    if (!realTarget.startsWith(realRoot)) {
      log.warn("Path traversal attempt blocked: {} resolves outside root", candidate);
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Path is outside the storage root");
    }

    if (!Files.isDirectory(realTarget, LinkOption.NOFOLLOW_LINKS)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a directory: " + candidate);
    }

    return realTarget;
  }

  @SuppressWarnings("java:S2583")
  private void listDirectory(Path dir, List<PathEntry> entries) throws IOException {
    DirectoryStream.Filter<Path> noSymlinks = p -> !Files.isSymbolicLink(p);

    int remaining = maxEntries;
    try (DirectoryStream<Path> ds = Files.newDirectoryStream(dir, noSymlinks)) {
      List<PathEntry> sorted = new ArrayList<>();
      for (Path entry : ds) {
        if (remaining <= 0) {
          log.warn("Directory listing truncated at {} entries for: {}", maxEntries, dir);
          break;
        }
        boolean isDir = Files.isDirectory(entry, LinkOption.NOFOLLOW_LINKS);
        sorted.add(new PathEntry(entry.getFileName().toString(), entry, isDir));
        remaining--;
      }
      sorted.sort(Comparator.comparing((PathEntry e) -> !e.isDir).thenComparing(e -> e.name));
      entries.addAll(sorted);
    }
  }

  private String buildXml(Path dir, List<PathEntry> entries) {
    StringBuilder xml = new StringBuilder();
    xml.append("<contents path=\"").append(escapeXml(dir.toString())).append("\">\n");
    for (PathEntry entry : entries) {
      String tag = entry.isDir ? "directory" : "file";
      xml.append("  <").append(tag);
      xml.append(" path=\"").append(escapeXml(entry.path.toString())).append("\"");
      xml.append(" name=\"").append(escapeXml(entry.name)).append("\"");
      xml.append("/>\n");
    }
    xml.append("</contents>");
    return xml.toString();
  }

  private static String escapeXml(String value) {
    return value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;");
  }

  private record PathEntry(String name, Path path, boolean isDir) {}
}
