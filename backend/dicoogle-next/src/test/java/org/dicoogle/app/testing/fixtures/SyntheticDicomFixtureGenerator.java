package org.dicoogle.app.testing.fixtures;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomInputStream;
import org.dcm4che3.io.DicomOutputStream;
import org.dicoogle.sdk.ImplementationInfo;

public final class SyntheticDicomFixtureGenerator {

  public static final String FIXTURE_VERSION = "synthetic-study-v1";
  public static final String GENERATOR_VERSION = "1.0.0";

  public static final String STUDY_INSTANCE_UID = "1.2.826.0.1.3680043.2.1125.100.1";
  public static final String SERIES_A_INSTANCE_UID = "1.2.826.0.1.3680043.2.1125.100.1.1";
  public static final String INSTANCE_A_UID = "1.2.826.0.1.3680043.2.1125.100.1.1.1";
  public static final String SERIES_B_INSTANCE_UID = "1.2.826.0.1.3680043.2.1125.100.1.2";
  public static final String INSTANCE_B_1_UID = "1.2.826.0.1.3680043.2.1125.100.1.2.1";
  public static final String INSTANCE_B_2_UID = "1.2.826.0.1.3680043.2.1125.100.1.2.2";
  public static final String INSTANCE_B_3_UID = "1.2.826.0.1.3680043.2.1125.100.1.2.3";

  public static final String MULTIFRAME_SOP_CLASS_UID =
      UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage;
  public static final String SINGLE_FRAME_SOP_CLASS_UID = UID.SecondaryCaptureImageStorage;
  public static final String TRANSFER_SYNTAX_UID = UID.ExplicitVRLittleEndian;

  public static final int ROWS = 64;
  public static final int COLUMNS = 64;
  public static final int SAMPLES_PER_PIXEL = 1;
  public static final int BITS_ALLOCATED = 16;
  public static final int BITS_STORED = 16;
  public static final int HIGH_BIT = 15;
  public static final int PIXEL_REPRESENTATION = 0;
  public static final int MULTIFRAME_COUNT = 8;
  public static final int FRAME_SIZE_BYTES =
      ROWS * COLUMNS * SAMPLES_PER_PIXEL * (BITS_ALLOCATED / 8);

  public static final String SERIES_A_DIRECTORY = "series-a";
  public static final String SERIES_B_DIRECTORY = "series-b";
  public static final String INSTANCE_A_FILE = "instance-a.dcm";
  public static final String INSTANCE_B_FILE_PATTERN = "instance-b-%d.dcm";
  public static final String MANIFEST_FILE = "manifest.json";

  private static final String FIXED_DATE = "20260101";
  private static final String FIXED_TIME = "120000";
  private static final String FIXED_DATETIME = "20260101120000";
  private static final String SYNTHETIC_PATIENT_NAME = "SYNTHETIC^FIXTURE";
  private static final String SYNTHETIC_PATIENT_ID = "SYNTHETIC-001";
  private static final String SYNTHETIC_STUDY_ID = "SYNTHETIC-001";
  private static final String SYNTHETIC_MANUFACTURER = "Dicoogle-Next Synthetic Fixture";
  private static final String SYNTHETIC_IMAGE_COMMENT =
      "SYNTHETIC FIXTURE - NOT CLINICAL DATA";
  private static final String FRAME_INCREMENT_POINTER = "00182005";
  private static final List<String> SLICE_LOCATION_VECTOR =
      List.of("0", "1", "2", "3", "4", "5", "6", "7");

  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

  private SyntheticDicomFixtureGenerator() {}

  public enum OverwritePolicy {
    FAIL_IF_EXISTS,
    RESET_KNOWN_FILES
  }

  public record GeneratedFixture(
      Path outputDirectory, Path manifestPath, List<GeneratedInstance> instances) {
    public GeneratedFixture {
      instances = List.copyOf(instances);
    }
  }

  public record GeneratedInstance(
      Path path,
      String seriesInstanceUID,
      String sopClassUID,
      String sopInstanceUID,
      int seriesNumber,
      int instanceNumber,
      int numberOfFrames,
      int frameSizeBytes,
      int pixelDataBytes,
      List<String> frameSha256,
      String instanceSha256) {
    public GeneratedInstance {
      frameSha256 = List.copyOf(frameSha256);
    }
  }

  public static GeneratedFixture generate(Path outputBaseDirectory) throws IOException {
    return generate(outputBaseDirectory, OverwritePolicy.FAIL_IF_EXISTS);
  }

  public static GeneratedFixture generate(
      Path outputBaseDirectory, OverwritePolicy overwritePolicy) throws IOException {
    Path baseDirectory = outputBaseDirectory.toAbsolutePath().normalize();
    Files.createDirectories(baseDirectory);
    Path realBaseDirectory = baseDirectory.toRealPath();
    Path fixtureDirectory = realBaseDirectory.resolve(FIXTURE_VERSION).normalize();
    if (!realBaseDirectory.equals(fixtureDirectory.getParent())) {
      throw new IOException("Fixture output escaped the intended base directory: " + fixtureDirectory);
    }
    if (Files.isSymbolicLink(fixtureDirectory)) {
      throw new IOException("Refusing to use a symlinked fixture directory: " + fixtureDirectory);
    }

    prepareFixtureDirectory(fixtureDirectory, overwritePolicy);

    List<GeneratedInstance> instances = new ArrayList<>();
    instances.add(
        writeInstance(
            fixtureDirectory.resolve(SERIES_A_DIRECTORY).resolve(INSTANCE_A_FILE),
            MULTIFRAME_SOP_CLASS_UID,
            INSTANCE_A_UID,
            SERIES_A_INSTANCE_UID,
            1,
            1,
            "Synthetic multiframe",
            createFrames(0, MULTIFRAME_COUNT)));

    for (int index = 1; index <= 3; index++) {
      String sopInstanceUid = switch (index) {
        case 1 -> INSTANCE_B_1_UID;
        case 2 -> INSTANCE_B_2_UID;
        default -> INSTANCE_B_3_UID;
      };
      instances.add(
          writeInstance(
              fixtureDirectory
                  .resolve(SERIES_B_DIRECTORY)
                  .resolve(INSTANCE_B_FILE_PATTERN.formatted(index)),
              SINGLE_FRAME_SOP_CLASS_UID,
              sopInstanceUid,
              SERIES_B_INSTANCE_UID,
              2,
              index,
              "Synthetic single-frame " + index,
              List.of(pixelBytesForFrame(100 + index))));
    }

    List<String> validationAssertions = validateGeneratedInstances(instances);
    Path manifestPath = fixtureDirectory.resolve(MANIFEST_FILE);
    writeManifest(fixtureDirectory, manifestPath, instances, validationAssertions);

    return new GeneratedFixture(fixtureDirectory, manifestPath, instances);
  }

  static List<byte[]> extractFrames(Attributes attributes) throws IOException {
    int numberOfFrames = attributes.getInt(Tag.NumberOfFrames, 1);
    int rows = attributes.getInt(Tag.Rows, 0);
    int columns = attributes.getInt(Tag.Columns, 0);
    int samplesPerPixel = attributes.getInt(Tag.SamplesPerPixel, 0);
    int bitsAllocated = attributes.getInt(Tag.BitsAllocated, 0);
    if (rows <= 0 || columns <= 0 || samplesPerPixel <= 0 || bitsAllocated <= 0) {
      throw new IllegalStateException("Invalid image pixel dimensions or bit depth");
    }
    if (bitsAllocated % 8 != 0) {
      throw new IllegalStateException("Only byte-aligned pixel data is supported by this helper");
    }

    int frameSizeBytes =
        Math.multiplyExact(
            Math.multiplyExact(rows, columns),
            Math.multiplyExact(samplesPerPixel, bitsAllocated / 8));
    byte[] pixelData = attributes.getBytes(Tag.PixelData);
    if (pixelData == null) {
      throw new IllegalStateException("PixelData is missing");
    }
    int expectedBytes = Math.multiplyExact(frameSizeBytes, numberOfFrames);
    if (pixelData.length != expectedBytes) {
      throw new IllegalStateException(
          "PixelData length %d does not match expected %d"
              .formatted(pixelData.length, expectedBytes));
    }

    List<byte[]> frames = new ArrayList<>(numberOfFrames);
    for (int frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
      int from = Math.multiplyExact(frameIndex, frameSizeBytes);
      int to = Math.addExact(from, frameSizeBytes);
      frames.add(Arrays.copyOfRange(pixelData, from, to));
    }
    return List.copyOf(frames);
  }

  static String sha256Hex(byte[] bytes) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(bytes));
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException("SHA-256 is unavailable", ex);
    }
  }

  private static GeneratedInstance writeInstance(
      Path path,
      String sopClassUid,
      String sopInstanceUid,
      String seriesInstanceUid,
      int seriesNumber,
      int instanceNumber,
      String seriesDescription,
      List<byte[]> frames)
      throws IOException {
    if (frames.isEmpty()) {
      throw new IllegalArgumentException("An instance must contain at least one frame");
    }
    int frameSizeBytes = frames.getFirst().length;
    for (byte[] frame : frames) {
      if (frame.length != frameSizeBytes) {
        throw new IllegalArgumentException("All frames in an instance must have the same size");
      }
    }

    boolean multiframe = frames.size() > 1;
    byte[] pixelData = concatenate(frames);
    Attributes attributes =
        createAttributes(
            sopClassUid,
            sopInstanceUid,
            seriesInstanceUid,
            seriesNumber,
            instanceNumber,
            seriesDescription,
            multiframe,
            pixelData);

    Files.createDirectories(path.getParent());
    try (DicomOutputStream outputStream = new DicomOutputStream(path.toFile())) {
      outputStream.writeDataset(
          createFileMetaInformation(sopClassUid, sopInstanceUid), attributes);
    }

    List<String> frameHashes = frames.stream().map(SyntheticDicomFixtureGenerator::sha256Hex).toList();
    return new GeneratedInstance(
        path,
        seriesInstanceUid,
        sopClassUid,
        sopInstanceUid,
        seriesNumber,
        instanceNumber,
        frames.size(),
        frameSizeBytes,
        pixelData.length,
        frameHashes,
        sha256Hex(Files.readAllBytes(path)));
  }

  private static Attributes createAttributes(
      String sopClassUid,
      String sopInstanceUid,
      String seriesInstanceUid,
      int seriesNumber,
      int instanceNumber,
      String seriesDescription,
      boolean multiframe,
      byte[] pixelData) {
    Attributes attributes = new Attributes();
    attributes.setString(Tag.SpecificCharacterSet, VR.CS, "ISO_IR 100");
    attributes.setString(Tag.SOPClassUID, VR.UI, sopClassUid);
    attributes.setString(Tag.SOPInstanceUID, VR.UI, sopInstanceUid);
    attributes.setString(Tag.StudyInstanceUID, VR.UI, STUDY_INSTANCE_UID);
    attributes.setString(Tag.SeriesInstanceUID, VR.UI, seriesInstanceUid);

    attributes.setString(Tag.PatientName, VR.PN, SYNTHETIC_PATIENT_NAME);
    attributes.setString(Tag.PatientID, VR.LO, SYNTHETIC_PATIENT_ID);
    attributes.setString(Tag.PatientBirthDate, VR.DA, "");
    attributes.setString(Tag.PatientSex, VR.CS, "O");

    attributes.setString(Tag.StudyDate, VR.DA, FIXED_DATE);
    attributes.setString(Tag.StudyTime, VR.TM, FIXED_TIME);
    attributes.setString(Tag.ReferringPhysicianName, VR.PN, "");
    attributes.setString(Tag.StudyID, VR.SH, SYNTHETIC_STUDY_ID);
    attributes.setString(Tag.AccessionNumber, VR.SH, "");
    attributes.setString(Tag.StudyDescription, VR.LO, "Synthetic frame retrieval study");

    attributes.setString(Tag.Modality, VR.CS, "OT");
    attributes.setInt(Tag.SeriesNumber, VR.IS, seriesNumber);
    attributes.setString(Tag.SeriesDate, VR.DA, FIXED_DATE);
    attributes.setString(Tag.SeriesTime, VR.TM, FIXED_TIME);
    attributes.setString(Tag.SeriesDescription, VR.LO, seriesDescription);

    attributes.setString(Tag.Manufacturer, VR.LO, SYNTHETIC_MANUFACTURER);
    attributes.setString(Tag.ManufacturerModelName, VR.LO, "Synthetic Fixture Generator");
    attributes.setString(Tag.SoftwareVersions, VR.LO, GENERATOR_VERSION);
    attributes.setString(Tag.StationName, VR.SH, "SYNTHETIC");
    attributes.setString(Tag.InstitutionName, VR.LO, "Synthetic");
    attributes.setString(Tag.DeviceSerialNumber, VR.LO, SYNTHETIC_PATIENT_ID);
    attributes.setString(Tag.ConversionType, VR.CS, "SYN");

    attributes.setString(Tag.ImageType, VR.CS, "DERIVED\\SECONDARY");
    attributes.setInt(Tag.InstanceNumber, VR.IS, instanceNumber);
    attributes.setString(Tag.PatientOrientation, VR.CS, "");
    attributes.setString(Tag.ContentDate, VR.DA, FIXED_DATE);
    attributes.setString(Tag.ContentTime, VR.TM, "120002");
    attributes.setString(Tag.AcquisitionDateTime, VR.DT, FIXED_DATETIME);
    attributes.setString(Tag.InstanceCreationDate, VR.DA, FIXED_DATE);
    attributes.setString(Tag.InstanceCreationTime, VR.TM, "120003");
    attributes.setString(Tag.TimezoneOffsetFromUTC, VR.SH, "+0000");
    attributes.setString(Tag.ImageComments, VR.LT, SYNTHETIC_IMAGE_COMMENT);
    attributes.setString(Tag.BurnedInAnnotation, VR.CS, "NO");
    attributes.setString(Tag.RecognizableVisualFeatures, VR.CS, "NO");
    attributes.setString(Tag.QualityControlImage, VR.CS, "NO");
    attributes.setString(Tag.LossyImageCompression, VR.CS, "00");
    attributes.setString(Tag.PresentationLUTShape, VR.CS, "IDENTITY");

    attributes.setInt(Tag.Rows, VR.US, ROWS);
    attributes.setInt(Tag.Columns, VR.US, COLUMNS);
    attributes.setInt(Tag.SamplesPerPixel, VR.US, SAMPLES_PER_PIXEL);
    attributes.setString(Tag.PhotometricInterpretation, VR.CS, "MONOCHROME2");
    attributes.setInt(Tag.BitsAllocated, VR.US, BITS_ALLOCATED);
    attributes.setInt(Tag.BitsStored, VR.US, BITS_STORED);
    attributes.setInt(Tag.HighBit, VR.US, HIGH_BIT);
    attributes.setInt(Tag.PixelRepresentation, VR.US, PIXEL_REPRESENTATION);
    attributes.setBytes(Tag.PixelData, VR.OW, pixelData);

    if (multiframe) {
      attributes.setInt(Tag.NumberOfFrames, VR.IS, MULTIFRAME_COUNT);
      attributes.setString(Tag.FrameIncrementPointer, VR.AT, FRAME_INCREMENT_POINTER);
      attributes.setString(Tag.SliceLocationVector, VR.DS, String.join("\\", SLICE_LOCATION_VECTOR));
      attributes.setString(Tag.RescaleIntercept, VR.DS, "0");
      attributes.setString(Tag.RescaleSlope, VR.DS, "1");
      attributes.setString(Tag.RescaleType, VR.LO, "US");
    }

    return attributes;
  }

  private static Attributes createFileMetaInformation(
      String sopClassUid, String sopInstanceUid) {
    Attributes fileMetaInformation = new Attributes();
    fileMetaInformation.setBytes(
        Tag.FileMetaInformationVersion, VR.OB, new byte[] {0x00, 0x01});
    fileMetaInformation.setString(Tag.MediaStorageSOPClassUID, VR.UI, sopClassUid);
    fileMetaInformation.setString(Tag.MediaStorageSOPInstanceUID, VR.UI, sopInstanceUid);
    fileMetaInformation.setString(Tag.TransferSyntaxUID, VR.UI, TRANSFER_SYNTAX_UID);
    fileMetaInformation.setString(
        Tag.ImplementationClassUID, VR.UI, ImplementationInfo.IMPLEMENTATION_CLASS_UID);
    fileMetaInformation.setString(Tag.ImplementationVersionName, VR.SH, "DICOOGLE_FIXTURE");
    return fileMetaInformation;
  }

  private static List<byte[]> createFrames(int firstFrameIndex, int count) {
    List<byte[]> frames = new ArrayList<>(count);
    for (int index = 0; index < count; index++) {
      frames.add(pixelBytesForFrame(firstFrameIndex + index));
    }
    return List.copyOf(frames);
  }

  private static byte[] pixelBytesForFrame(int frameIndex) {
    byte[] frame = new byte[FRAME_SIZE_BYTES];
    int offset = 0;
    for (int y = 0; y < ROWS; y++) {
      for (int x = 0; x < COLUMNS; x++) {
        int value = (x * 257 + y * 131 + frameIndex * 4099) & 0xFFFF;
        frame[offset++] = (byte) (value & 0xFF);
        frame[offset++] = (byte) ((value >>> 8) & 0xFF);
      }
    }
    return frame;
  }

  private static byte[] concatenate(List<byte[]> frames) {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    for (byte[] frame : frames) {
      output.writeBytes(frame);
    }
    return output.toByteArray();
  }

  private static List<String> validateGeneratedInstances(List<GeneratedInstance> instances)
      throws IOException {
    List<String> assertions = new ArrayList<>();
    check(instances.size() == 4, "Generated four instances", assertions);
    check(
        instances.getFirst().sopClassUID().equals(MULTIFRAME_SOP_CLASS_UID),
        "First instance uses Multi-frame Grayscale Word Secondary Capture",
        assertions);
    check(
        instances.subList(1, 4).stream()
            .allMatch(instance -> instance.sopClassUID().equals(SINGLE_FRAME_SOP_CLASS_UID)),
        "Companion instances use Secondary Capture Image Storage",
        assertions);
    check(
        instances.getFirst().seriesInstanceUID().equals(SERIES_A_INSTANCE_UID),
        "Multiframe instance belongs to Series A",
        assertions);
    check(
        instances.subList(1, 4).stream()
            .allMatch(instance -> instance.seriesInstanceUID().equals(SERIES_B_INSTANCE_UID)),
        "Companion instances belong to Series B",
        assertions);

    for (GeneratedInstance instance : instances) {
      ParsedInstance parsed = read(instance.path());
      Attributes attributes = parsed.attributes();
      String suffix = " for " + instance.sopInstanceUID();

      check(
          TRANSFER_SYNTAX_UID.equals(parsed.transferSyntaxUID()),
          "Explicit VR Little Endian transfer syntax" + suffix,
          assertions);
      check(
          instance.sopClassUID().equals(attributes.getString(Tag.SOPClassUID, null)),
          "SOP Class UID matches" + suffix,
          assertions);
      check(
          instance.sopInstanceUID().equals(attributes.getString(Tag.SOPInstanceUID, null)),
          "SOP Instance UID matches" + suffix,
          assertions);
      check(
          STUDY_INSTANCE_UID.equals(attributes.getString(Tag.StudyInstanceUID, null)),
          "Study Instance UID matches" + suffix,
          assertions);
      check(
          instance.seriesInstanceUID().equals(attributes.getString(Tag.SeriesInstanceUID, null)),
          "Series Instance UID matches" + suffix,
          assertions);
      check(
          instance.seriesNumber() == attributes.getInt(Tag.SeriesNumber, -1),
          "Series Number matches" + suffix,
          assertions);
      check(
          instance.instanceNumber() == attributes.getInt(Tag.InstanceNumber, -1),
          "Instance Number matches" + suffix,
          assertions);
      check("OT".equals(attributes.getString(Tag.Modality, null)), "Modality is OT" + suffix, assertions);
      check(
          "SYN".equals(attributes.getString(Tag.ConversionType, null)),
          "Conversion Type is SYN" + suffix,
          assertions);
      check(
          ROWS == attributes.getInt(Tag.Rows, -1), "Rows match" + suffix, assertions);
      check(
          COLUMNS == attributes.getInt(Tag.Columns, -1), "Columns match" + suffix, assertions);
      check(
          SAMPLES_PER_PIXEL == attributes.getInt(Tag.SamplesPerPixel, -1),
          "Samples per Pixel matches" + suffix,
          assertions);
      check(
          "MONOCHROME2".equals(attributes.getString(Tag.PhotometricInterpretation, null)),
          "Photometric Interpretation is MONOCHROME2" + suffix,
          assertions);
      check(
          BITS_ALLOCATED == attributes.getInt(Tag.BitsAllocated, -1),
          "Bits Allocated is 16" + suffix,
          assertions);
      check(
          BITS_STORED == attributes.getInt(Tag.BitsStored, -1),
          "Bits Stored is 16" + suffix,
          assertions);
      check(
          HIGH_BIT == attributes.getInt(Tag.HighBit, -1), "High Bit is 15" + suffix, assertions);
      check(
          PIXEL_REPRESENTATION == attributes.getInt(Tag.PixelRepresentation, -1),
          "Pixel Representation is unsigned" + suffix,
          assertions);
      check(
          "NO".equals(attributes.getString(Tag.BurnedInAnnotation, null)),
          "Burned In Annotation is NO" + suffix,
          assertions);
      check(
          "IDENTITY".equals(attributes.getString(Tag.PresentationLUTShape, null)),
          "Presentation LUT Shape is IDENTITY" + suffix,
          assertions);

      byte[] pixelData = attributes.getBytes(Tag.PixelData);
      check(pixelData != null, "Pixel Data is present" + suffix, assertions);
      if (pixelData != null) {
        check(
            instance.pixelDataBytes() == pixelData.length,
            "Pixel Data length matches" + suffix,
            assertions);
      }

      List<byte[]> frames = extractFrames(attributes);
      check(
          instance.numberOfFrames() == frames.size(),
          "Extracted frame count matches" + suffix,
          assertions);
      check(
          instance.frameSizeBytes() == FRAME_SIZE_BYTES,
          "Frame size is 8192 bytes" + suffix,
          assertions);
      for (int frameIndex = 0; frameIndex < frames.size(); frameIndex++) {
        check(
            instance.frameSha256().get(frameIndex).equals(sha256Hex(frames.get(frameIndex))),
            "Frame %d SHA-256 matches%s".formatted(frameIndex + 1, suffix),
            assertions);
      }

      if (instance.numberOfFrames() > 1) {
        check(
            MULTIFRAME_COUNT == attributes.getInt(Tag.NumberOfFrames, -1),
            "Multiframe Number of Frames is 8" + suffix,
            assertions);
        check(
            FRAME_INCREMENT_POINTER.equals(attributes.getString(Tag.FrameIncrementPointer, null)),
            "Frame Increment Pointer targets Slice Location Vector" + suffix,
            assertions);
        String[] vector = attributes.getStrings(Tag.SliceLocationVector);
        check(
            vector != null && Arrays.equals(SLICE_LOCATION_VECTOR.toArray(String[]::new), vector),
            "Slice Location Vector has eight ordered values" + suffix,
            assertions);
        check(
            "0".equals(attributes.getString(Tag.RescaleIntercept, null)),
            "Rescale Intercept is 0" + suffix,
            assertions);
        check(
            "1".equals(attributes.getString(Tag.RescaleSlope, null)),
            "Rescale Slope is 1" + suffix,
            assertions);
        check(
            "US".equals(attributes.getString(Tag.RescaleType, null)),
            "Rescale Type is US" + suffix,
            assertions);
        check(
            new HashSet<>(instance.frameSha256()).size() == MULTIFRAME_COUNT,
            "All eight multiframe payloads are distinct" + suffix,
            assertions);
      } else {
        check(
            frames.size() == 1, "Single-frame companion has exactly one frame" + suffix, assertions);
        check(
            attributes.getString(Tag.FrameIncrementPointer, null) == null,
            "Single-frame companion has no Frame Increment Pointer" + suffix,
            assertions);
        check(
            attributes.getString(Tag.SliceLocationVector, null) == null,
            "Single-frame companion has no Slice Location Vector" + suffix,
            assertions);
      }
    }

    long distinctFrameHashes =
        instances.stream()
            .flatMap(instance -> instance.frameSha256().stream())
            .distinct()
            .count();
    check(distinctFrameHashes == 11, "All eleven frame payloads are distinct", assertions);
    check(
        instances.stream().map(GeneratedInstance::instanceSha256).distinct().count() == 4,
        "All four instance SHA-256 values are distinct",
        assertions);
    return List.copyOf(assertions);
  }

  private static ParsedInstance read(Path path) throws IOException {
    try (DicomInputStream inputStream = new DicomInputStream(path.toFile())) {
      Attributes attributes = inputStream.readDataset();
      return new ParsedInstance(attributes, inputStream.getTransferSyntax());
    }
  }

  private static void writeManifest(
      Path fixtureDirectory,
      Path manifestPath,
      List<GeneratedInstance> instances,
      List<String> validationAssertions)
      throws IOException {
    Map<String, Object> manifest = new LinkedHashMap<>();
    manifest.put("fixtureVersion", FIXTURE_VERSION);
    manifest.put("synthetic", true);
    manifest.put("generatorVersion", GENERATOR_VERSION);
    manifest.put("generatedAt", Instant.now().toString());
    manifest.put("studyInstanceUID", STUDY_INSTANCE_UID);
    manifest.put("transferSyntaxUID", TRANSFER_SYNTAX_UID);
    manifest.put("pixelProfile", pixelProfile());
    manifest.put("frameOrdering", frameOrdering());
    manifest.put(
        "hashPurpose",
        "Content identity only; not encryption, authentication, or freshness.");
    manifest.put("series", series(instances, fixtureDirectory));
    manifest.put("validation", validation(validationAssertions));
    OBJECT_MAPPER.writerWithDefaultPrettyPrinter().writeValue(manifestPath.toFile(), manifest);
  }

  private static Map<String, Object> pixelProfile() {
    Map<String, Object> pixelProfile = new LinkedHashMap<>();
    pixelProfile.put("rows", ROWS);
    pixelProfile.put("columns", COLUMNS);
    pixelProfile.put("samplesPerPixel", SAMPLES_PER_PIXEL);
    pixelProfile.put("photometricInterpretation", "MONOCHROME2");
    pixelProfile.put("bitsAllocated", BITS_ALLOCATED);
    pixelProfile.put("bitsStored", BITS_STORED);
    pixelProfile.put("highBit", HIGH_BIT);
    pixelProfile.put("pixelRepresentation", PIXEL_REPRESENTATION);
    pixelProfile.put("frameSizeBytes", FRAME_SIZE_BYTES);
    return pixelProfile;
  }

  private static Map<String, Object> frameOrdering() {
    Map<String, Object> frameOrdering = new LinkedHashMap<>();
    frameOrdering.put("frameNumberBasis", 1);
    frameOrdering.put("frameIncrementPointer", FRAME_INCREMENT_POINTER);
    frameOrdering.put("sliceLocationVector", SLICE_LOCATION_VECTOR);
    return frameOrdering;
  }

  private static List<Map<String, Object>> series(
      List<GeneratedInstance> instances, Path fixtureDirectory) {
    List<Map<String, Object>> series = new ArrayList<>();
    series.add(
        seriesMap(
            SERIES_A_INSTANCE_UID,
            1,
            "Synthetic multiframe",
            List.of(instances.get(0)),
            fixtureDirectory));
    series.add(
        seriesMap(
            SERIES_B_INSTANCE_UID,
            2,
            "Synthetic single-frame",
            instances.subList(1, 4),
            fixtureDirectory));
    return List.copyOf(series);
  }

  private static Map<String, Object> seriesMap(
      String seriesInstanceUid,
      int seriesNumber,
      String description,
      List<GeneratedInstance> instances,
      Path fixtureDirectory) {
    Map<String, Object> series = new LinkedHashMap<>();
    series.put("seriesInstanceUID", seriesInstanceUid);
    series.put("seriesNumber", seriesNumber);
    series.put("description", description);
    series.put("instances", instances.stream().map(instance -> instanceMap(instance, fixtureDirectory)).toList());
    return series;
  }

  private static Map<String, Object> instanceMap(
      GeneratedInstance instance, Path fixtureDirectory) {
    Map<String, Object> instanceMap = new LinkedHashMap<>();
    instanceMap.put("sopClassUID", instance.sopClassUID());
    instanceMap.put("sopInstanceUID", instance.sopInstanceUID());
    instanceMap.put("numberOfFrames", instance.numberOfFrames());
    instanceMap.put("rows", ROWS);
    instanceMap.put("columns", COLUMNS);
    instanceMap.put("samplesPerPixel", SAMPLES_PER_PIXEL);
    instanceMap.put("photometricInterpretation", "MONOCHROME2");
    instanceMap.put("bitsAllocated", BITS_ALLOCATED);
    instanceMap.put("bitsStored", BITS_STORED);
    instanceMap.put("highBit", HIGH_BIT);
    instanceMap.put("pixelRepresentation", PIXEL_REPRESENTATION);
    instanceMap.put("frameSizeBytes", instance.frameSizeBytes());
    instanceMap.put("pixelDataBytes", instance.pixelDataBytes());
    instanceMap.put("frameSha256", instance.frameSha256());
    instanceMap.put("instanceSha256", instance.instanceSha256());
    instanceMap.put(
        "path", fixtureDirectory.relativize(instance.path()).toString().replace('\\', '/'));
    if (instance.numberOfFrames() > 1) {
      instanceMap.put("frameIncrementPointer", FRAME_INCREMENT_POINTER);
      instanceMap.put("sliceLocationVector", SLICE_LOCATION_VECTOR);
    }
    return instanceMap;
  }

  private static Map<String, Object> validation(List<String> validationAssertions) {
    Map<String, Object> validation = new LinkedHashMap<>();
    validation.put("passed", true);
    validation.put(
        "scope",
        "Structural and module-attribute assertions only; no external IOD conformance certification.");
    validation.put("externalIodCertification", false);
    validation.put("structuralAssertions", validationAssertions);
    return validation;
  }

  private static void prepareFixtureDirectory(
      Path fixtureDirectory, OverwritePolicy overwritePolicy) throws IOException {
    if (Files.exists(fixtureDirectory) && !Files.isDirectory(fixtureDirectory)) {
      throw new IOException("Fixture output exists and is not a directory: " + fixtureDirectory);
    }
    if (Files.exists(fixtureDirectory)) {
      if (overwritePolicy == OverwritePolicy.FAIL_IF_EXISTS) {
        try (Stream<Path> entries = Files.list(fixtureDirectory)) {
          if (entries.findAny().isPresent()) {
            throw new IOException(
                "Fixture output already exists: "
                    + fixtureDirectory
                    + "; use the explicit reset policy only for this generated fixture");
          }
        }
      } else {
        validateResettable(fixtureDirectory);
        for (Path knownOutput : knownOutputPaths(fixtureDirectory)) {
          Files.deleteIfExists(knownOutput);
        }
        deleteIfEmpty(fixtureDirectory.resolve(SERIES_A_DIRECTORY));
        deleteIfEmpty(fixtureDirectory.resolve(SERIES_B_DIRECTORY));
      }
    }
    Files.createDirectories(fixtureDirectory.resolve(SERIES_A_DIRECTORY));
    Files.createDirectories(fixtureDirectory.resolve(SERIES_B_DIRECTORY));
  }

  private static void validateResettable(Path fixtureDirectory) throws IOException {
    List<Path> allowed = new ArrayList<>(knownOutputPaths(fixtureDirectory));
    allowed.add(fixtureDirectory.resolve(SERIES_A_DIRECTORY));
    allowed.add(fixtureDirectory.resolve(SERIES_B_DIRECTORY));
    try (Stream<Path> paths = Files.walk(fixtureDirectory)) {
      List<Path> unexpected =
          paths.filter(path -> !path.equals(fixtureDirectory))
              .filter(path -> !allowed.contains(path))
              .toList();
      if (!unexpected.isEmpty()) {
        throw new IOException(
            "Refusing to reset fixture directory with unknown entries: " + unexpected);
      }
    }
  }

  private static void deleteIfEmpty(Path directory) throws IOException {
    if (!Files.isDirectory(directory)) {
      return;
    }
    try (Stream<Path> entries = Files.list(directory)) {
      if (entries.findAny().isEmpty()) {
        Files.delete(directory);
      }
    }
  }

  private static List<Path> knownOutputPaths(Path fixtureDirectory) {
    return List.of(
        fixtureDirectory.resolve(SERIES_A_DIRECTORY).resolve(INSTANCE_A_FILE),
        fixtureDirectory.resolve(SERIES_B_DIRECTORY).resolve(INSTANCE_B_FILE_PATTERN.formatted(1)),
        fixtureDirectory.resolve(SERIES_B_DIRECTORY).resolve(INSTANCE_B_FILE_PATTERN.formatted(2)),
        fixtureDirectory.resolve(SERIES_B_DIRECTORY).resolve(INSTANCE_B_FILE_PATTERN.formatted(3)),
        fixtureDirectory.resolve(MANIFEST_FILE));
  }

  private static void check(boolean condition, String assertion, List<String> assertions) {
    assertions.add(assertion);
    if (!condition) {
      throw new IllegalStateException("Fixture validation failed: " + assertion);
    }
  }

  private record ParsedInstance(Attributes attributes, String transferSyntaxUID) {}
}
