package org.dicoogle.app.testing.fixtures;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.io.DicomInputStream;
import org.dcm4che3.util.TagUtils;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SyntheticDicomFixtureGeneratorTest {

  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

  @TempDir Path tempDirectory;

  @Test
  void generatesAllFourObjectsWithExpectedIdentityAndProfile() throws IOException {
    SyntheticDicomFixtureGenerator.GeneratedFixture fixture =
        SyntheticDicomFixtureGenerator.generate(tempDirectory);

    assertThat(fixture.instances()).hasSize(4);
    assertThat(fixture.outputDirectory()).isDirectory();
    assertThat(fixture.outputDirectory()).startsWith(tempDirectory.toRealPath());
    assertThat(fixture.manifestPath()).exists();

    SyntheticDicomFixtureGenerator.GeneratedInstance multiframe = fixture.instances().getFirst();
    assertThat(multiframe.sopClassUID())
        .isEqualTo(UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage);
    assertThat(multiframe.seriesInstanceUID())
        .isEqualTo(SyntheticDicomFixtureGenerator.SERIES_A_INSTANCE_UID);
    assertThat(multiframe.sopInstanceUID())
        .isEqualTo(SyntheticDicomFixtureGenerator.INSTANCE_A_UID);
    assertThat(multiframe.numberOfFrames()).isEqualTo(8);
    assertThat(multiframe.frameSizeBytes()).isEqualTo(8192);
    assertThat(multiframe.pixelDataBytes()).isEqualTo(65536);

    ParsedInstance parsed = read(multiframe.path());
    Attributes attributes = parsed.attributes();
    assertThat(parsed.transferSyntaxUID()).isEqualTo(UID.ExplicitVRLittleEndian);
    assertThat(attributes.getString(Tag.SOPClassUID, null))
        .isEqualTo(UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage);
    assertThat(attributes.getString(Tag.SOPInstanceUID, null))
        .isEqualTo(SyntheticDicomFixtureGenerator.INSTANCE_A_UID);
    assertThat(attributes.getString(Tag.StudyInstanceUID, null))
        .isEqualTo(SyntheticDicomFixtureGenerator.STUDY_INSTANCE_UID);
    assertThat(attributes.getString(Tag.SeriesInstanceUID, null))
        .isEqualTo(SyntheticDicomFixtureGenerator.SERIES_A_INSTANCE_UID);
    assertThat(attributes.getInt(Tag.SeriesNumber, -1)).isEqualTo(1);
    assertThat(attributes.getInt(Tag.InstanceNumber, -1)).isEqualTo(1);
    assertThat(attributes.getString(Tag.Modality, null)).isEqualTo("OT");
    assertThat(attributes.getString(Tag.ConversionType, null)).isEqualTo("SYN");
    assertThat(attributes.getString(Tag.ImageType, null)).isEqualTo("DERIVED");
    assertThat(attributes.getStrings(Tag.ImageType)).containsExactly("DERIVED", "SECONDARY");
    assertThat(attributes.getInt(Tag.Rows, -1)).isEqualTo(64);
    assertThat(attributes.getInt(Tag.Columns, -1)).isEqualTo(64);
    assertThat(attributes.getInt(Tag.SamplesPerPixel, -1)).isEqualTo(1);
    assertThat(attributes.getString(Tag.PhotometricInterpretation, null))
        .isEqualTo("MONOCHROME2");
    assertThat(attributes.getInt(Tag.BitsAllocated, -1)).isEqualTo(16);
    assertThat(attributes.getInt(Tag.BitsStored, -1)).isEqualTo(16);
    assertThat(attributes.getInt(Tag.HighBit, -1)).isEqualTo(15);
    assertThat(attributes.getInt(Tag.PixelRepresentation, -1)).isZero();
    assertThat(attributes.getString(Tag.BurnedInAnnotation, null)).isEqualTo("NO");
    assertThat(attributes.getString(Tag.PresentationLUTShape, null)).isEqualTo("IDENTITY");
    assertThat(attributes.getString(Tag.RescaleIntercept, null)).isEqualTo("0");
    assertThat(attributes.getString(Tag.RescaleSlope, null)).isEqualTo("1");
    assertThat(attributes.getString(Tag.RescaleType, null)).isEqualTo("US");
    assertThat(attributes.getBytes(Tag.PixelData)).hasSize(65536);

    for (int index = 1; index <= 3; index++) {
      SyntheticDicomFixtureGenerator.GeneratedInstance singleFrame = fixture.instances().get(index);
      assertThat(singleFrame.sopClassUID()).isEqualTo(UID.SecondaryCaptureImageStorage);
      assertThat(singleFrame.seriesInstanceUID())
          .isEqualTo(SyntheticDicomFixtureGenerator.SERIES_B_INSTANCE_UID);
      assertThat(singleFrame.numberOfFrames()).isEqualTo(1);
      assertThat(singleFrame.frameSizeBytes()).isEqualTo(8192);
      assertThat(singleFrame.pixelDataBytes()).isEqualTo(8192);

      ParsedInstance singleParsed = read(singleFrame.path());
      Attributes singleAttributes = singleParsed.attributes();
      assertThat(singleParsed.transferSyntaxUID()).isEqualTo(UID.ExplicitVRLittleEndian);
      assertThat(singleAttributes.getString(Tag.SOPClassUID, null))
          .isEqualTo(UID.SecondaryCaptureImageStorage);
      assertThat(singleAttributes.getString(Tag.StudyInstanceUID, null))
          .isEqualTo(SyntheticDicomFixtureGenerator.STUDY_INSTANCE_UID);
      assertThat(singleAttributes.getString(Tag.SeriesInstanceUID, null))
          .isEqualTo(SyntheticDicomFixtureGenerator.SERIES_B_INSTANCE_UID);
      assertThat(singleAttributes.getInt(Tag.SeriesNumber, -1)).isEqualTo(2);
      assertThat(singleAttributes.getInt(Tag.InstanceNumber, -1)).isEqualTo(index);
      assertThat(singleAttributes.getInt(Tag.NumberOfFrames, 1)).isEqualTo(1);
      assertThat(singleAttributes.getString(Tag.FrameIncrementPointer, null)).isNull();
      assertThat(singleAttributes.getString(Tag.SliceLocationVector, null)).isNull();
      assertThat(singleAttributes.getString(Tag.ConversionType, null)).isEqualTo("SYN");
      assertThat(singleAttributes.getString(Tag.BurnedInAnnotation, null)).isEqualTo("NO");
      assertThat(singleAttributes.getString(Tag.PresentationLUTShape, null))
          .isEqualTo("IDENTITY");
      assertThat(singleAttributes.getInt(Tag.Rows, -1)).isEqualTo(64);
      assertThat(singleAttributes.getInt(Tag.Columns, -1)).isEqualTo(64);
      assertThat(singleAttributes.getInt(Tag.SamplesPerPixel, -1)).isEqualTo(1);
      assertThat(singleAttributes.getString(Tag.PhotometricInterpretation, null))
          .isEqualTo("MONOCHROME2");
      assertThat(singleAttributes.getInt(Tag.BitsAllocated, -1)).isEqualTo(16);
      assertThat(singleAttributes.getInt(Tag.BitsStored, -1)).isEqualTo(16);
      assertThat(singleAttributes.getInt(Tag.HighBit, -1)).isEqualTo(15);
      assertThat(singleAttributes.getInt(Tag.PixelRepresentation, -1)).isZero();
      assertThat(singleAttributes.getBytes(Tag.PixelData)).hasSize(8192);
    }
  }

  @Test
  void multiframeFrameIncrementPointerAndOrderingVectorAreValid() throws IOException {
    SyntheticDicomFixtureGenerator.GeneratedFixture fixture =
        SyntheticDicomFixtureGenerator.generate(tempDirectory);
    Attributes attributes = read(fixture.instances().getFirst().path()).attributes();

    assertThat(attributes.getInt(Tag.NumberOfFrames, -1)).isEqualTo(8);
    assertThat(attributes.getString(Tag.FrameIncrementPointer, null)).isEqualTo("00182005");
    assertThat(TagUtils.toHexString(Tag.SliceLocationVector)).isEqualTo("00182005");
    assertThat(attributes.getStrings(Tag.SliceLocationVector))
        .containsExactly("0", "1", "2", "3", "4", "5", "6", "7");
  }

  @Test
  void multiframeFramesHaveExpectedKnownPixelsAndDistinctPayloads() throws IOException {
    SyntheticDicomFixtureGenerator.GeneratedFixture fixture =
        SyntheticDicomFixtureGenerator.generate(tempDirectory);
    Attributes attributes = read(fixture.instances().getFirst().path()).attributes();
    List<byte[]> frames = SyntheticDicomFixtureGenerator.extractFrames(attributes);

    assertThat(frames).hasSize(8);
    assertThat(unsignedShortLE(frames.get(0), 0)).isZero();
    assertThat(unsignedShortLE(frames.get(0), 1)).isEqualTo(257);
    assertThat(unsignedShortLE(frames.get(0), 64)).isEqualTo(131);
    assertThat(unsignedShortLE(frames.get(7), 0)).isEqualTo(28693);
    assertThat(unsignedShortLE(frames.get(7), 1)).isEqualTo(28950);

    Set<String> frameHashes = new HashSet<>();
    for (byte[] frame : frames) {
      frameHashes.add(SyntheticDicomFixtureGenerator.sha256Hex(frame));
    }
    assertThat(frameHashes).hasSize(8);
    for (int left = 0; left < frames.size(); left++) {
      for (int right = left + 1; right < frames.size(); right++) {
        assertThat(Arrays.equals(frames.get(left), frames.get(right))).isFalse();
      }
    }
    assertThat(fixture.instances().getFirst().frameSha256())
        .containsExactlyElementsOf(
            frames.stream().map(SyntheticDicomFixtureGenerator::sha256Hex).toList());
  }

  @Test
  void singleFrameCompanionsHaveExactlyOneFrameEach() throws IOException {
    SyntheticDicomFixtureGenerator.GeneratedFixture fixture =
        SyntheticDicomFixtureGenerator.generate(tempDirectory);

    Set<String> frameHashes = new HashSet<>();
    for (int index = 1; index <= 3; index++) {
      SyntheticDicomFixtureGenerator.GeneratedInstance instance = fixture.instances().get(index);
      Attributes attributes = read(instance.path()).attributes();
      List<byte[]> frames = SyntheticDicomFixtureGenerator.extractFrames(attributes);

      assertThat(frames).hasSize(1);
      assertThat(frames.getFirst()).hasSize(8192);
      assertThat(attributes.getInt(Tag.NumberOfFrames, 1)).isEqualTo(1);
      assertThat(attributes.getString(Tag.FrameIncrementPointer, null)).isNull();
      assertThat(attributes.getString(Tag.SliceLocationVector, null)).isNull();
      assertThat(attributes.getInt(Tag.InstanceNumber, -1)).isEqualTo(index);
      frameHashes.add(SyntheticDicomFixtureGenerator.sha256Hex(frames.getFirst()));
    }
    assertThat(frameHashes).hasSize(3);
  }

  @Test
  void manifestDescribesIdentifiersDimensionsCountsSizesAndHashes() throws IOException {
    SyntheticDicomFixtureGenerator.GeneratedFixture fixture =
        SyntheticDicomFixtureGenerator.generate(tempDirectory);
    JsonNode manifest = OBJECT_MAPPER.readTree(fixture.manifestPath().toFile());

    assertThat(manifest.path("fixtureVersion").asText())
        .isEqualTo(SyntheticDicomFixtureGenerator.FIXTURE_VERSION);
    assertThat(manifest.path("synthetic").asBoolean()).isTrue();
    assertThat(manifest.path("generatorVersion").asText())
        .isEqualTo(SyntheticDicomFixtureGenerator.GENERATOR_VERSION);
    assertThat(manifest.path("studyInstanceUID").asText())
        .isEqualTo(SyntheticDicomFixtureGenerator.STUDY_INSTANCE_UID);
    assertThat(manifest.path("transferSyntaxUID").asText())
        .isEqualTo(UID.ExplicitVRLittleEndian);
    assertThat(manifest.path("pixelProfile").path("rows").asInt()).isEqualTo(64);
    assertThat(manifest.path("pixelProfile").path("columns").asInt()).isEqualTo(64);
    assertThat(manifest.path("pixelProfile").path("samplesPerPixel").asInt()).isEqualTo(1);
    assertThat(manifest.path("pixelProfile").path("photometricInterpretation").asText())
        .isEqualTo("MONOCHROME2");
    assertThat(manifest.path("pixelProfile").path("bitsAllocated").asInt()).isEqualTo(16);
    assertThat(manifest.path("pixelProfile").path("bitsStored").asInt()).isEqualTo(16);
    assertThat(manifest.path("pixelProfile").path("highBit").asInt()).isEqualTo(15);
    assertThat(manifest.path("pixelProfile").path("pixelRepresentation").asInt()).isZero();
    assertThat(manifest.path("pixelProfile").path("frameSizeBytes").asInt()).isEqualTo(8192);
    assertThat(manifest.path("frameOrdering").path("frameNumberBasis").asInt()).isEqualTo(1);
    assertThat(manifest.path("frameOrdering").path("frameIncrementPointer").asText())
        .isEqualTo("00182005");
    assertThat(manifest.path("frameOrdering").path("sliceLocationVector").size()).isEqualTo(8);

    assertThat(manifest.path("series").size()).isEqualTo(2);
    JsonNode seriesA = manifest.path("series").get(0);
    assertThat(seriesA.path("seriesInstanceUID").asText())
        .isEqualTo(SyntheticDicomFixtureGenerator.SERIES_A_INSTANCE_UID);
    assertThat(seriesA.path("instances").size()).isEqualTo(1);
    JsonNode instanceA = seriesA.path("instances").get(0);
    assertThat(instanceA.path("sopClassUID").asText())
        .isEqualTo(UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage);
    assertThat(instanceA.path("sopInstanceUID").asText())
        .isEqualTo(SyntheticDicomFixtureGenerator.INSTANCE_A_UID);
    assertThat(instanceA.path("numberOfFrames").asInt()).isEqualTo(8);
    assertThat(instanceA.path("frameSizeBytes").asInt()).isEqualTo(8192);
    assertThat(instanceA.path("pixelDataBytes").asInt()).isEqualTo(65536);
    assertThat(instanceA.path("frameSha256").size()).isEqualTo(8);
    assertThat(instanceA.path("instanceSha256").asText())
        .isEqualTo(fixture.instances().getFirst().instanceSha256());
    assertThat(instanceA.path("instanceSha256").asText())
        .isEqualTo(
            SyntheticDicomFixtureGenerator.sha256Hex(
                Files.readAllBytes(fixture.instances().getFirst().path())));

    List<String> manifestFrameHashes = new ArrayList<>();
    instanceA.path("frameSha256").forEach(node -> manifestFrameHashes.add(node.asText()));
    assertThat(manifestFrameHashes)
        .containsExactlyElementsOf(fixture.instances().getFirst().frameSha256());

    JsonNode seriesB = manifest.path("series").get(1);
    assertThat(seriesB.path("seriesInstanceUID").asText())
        .isEqualTo(SyntheticDicomFixtureGenerator.SERIES_B_INSTANCE_UID);
    assertThat(seriesB.path("instances").size()).isEqualTo(3);
    for (JsonNode instance : seriesB.path("instances")) {
      assertThat(instance.path("numberOfFrames").asInt()).isEqualTo(1);
      assertThat(instance.path("frameSizeBytes").asInt()).isEqualTo(8192);
      assertThat(instance.path("pixelDataBytes").asInt()).isEqualTo(8192);
      assertThat(instance.path("frameSha256").size()).isEqualTo(1);
    }

    assertThat(manifest.path("validation").path("passed").asBoolean()).isTrue();
    assertThat(manifest.path("validation").path("externalIodCertification").asBoolean())
        .isFalse();
    assertThat(manifest.path("validation").path("scope").asText())
        .contains("no external IOD conformance certification");
    assertThat(manifest.path("validation").path("structuralAssertions").size())
        .isGreaterThan(0);
    assertThat(manifest.path("hashPurpose").asText()).contains("not encryption");
    assertThat(manifest.path("generatedAt").asText()).isNotBlank();
  }

  @Test
  void regenerationProducesIdenticalNativePixelContent() throws IOException {
    SyntheticDicomFixtureGenerator.GeneratedFixture first =
        SyntheticDicomFixtureGenerator.generate(
            tempDirectory, SyntheticDicomFixtureGenerator.OverwritePolicy.RESET_KNOWN_FILES);
    List<String> firstFrameHashes = new ArrayList<>();
    for (SyntheticDicomFixtureGenerator.GeneratedInstance instance : first.instances()) {
      firstFrameHashes.addAll(instance.frameSha256());
    }

    SyntheticDicomFixtureGenerator.GeneratedFixture second =
        SyntheticDicomFixtureGenerator.generate(
            tempDirectory, SyntheticDicomFixtureGenerator.OverwritePolicy.RESET_KNOWN_FILES);

    for (int index = 0; index < first.instances().size(); index++) {
      SyntheticDicomFixtureGenerator.GeneratedInstance firstInstance =
          first.instances().get(index);
      SyntheticDicomFixtureGenerator.GeneratedInstance secondInstance =
          second.instances().get(index);
      assertThat(Files.readAllBytes(secondInstance.path()))
          .containsExactly(Files.readAllBytes(firstInstance.path()));
      assertThat(secondInstance.frameSha256())
          .containsExactlyElementsOf(firstInstance.frameSha256());
    }

    List<String> secondFrameHashes = new ArrayList<>();
    for (SyntheticDicomFixtureGenerator.GeneratedInstance instance : second.instances()) {
      secondFrameHashes.addAll(instance.frameSha256());
    }
    assertThat(secondFrameHashes).containsExactlyElementsOf(firstFrameHashes);
  }

  @Test
  void defaultPolicyRefusesExistingFixtureOutput() throws IOException {
    SyntheticDicomFixtureGenerator.generate(
        tempDirectory, SyntheticDicomFixtureGenerator.OverwritePolicy.RESET_KNOWN_FILES);

    assertThatThrownBy(() -> SyntheticDicomFixtureGenerator.generate(tempDirectory))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("already exists");
  }

  @Test
  void resetRefusesUnknownEntriesAndPreservesThem() throws IOException {
    SyntheticDicomFixtureGenerator.GeneratedFixture first =
        SyntheticDicomFixtureGenerator.generate(
            tempDirectory, SyntheticDicomFixtureGenerator.OverwritePolicy.RESET_KNOWN_FILES);
    Path unknown = first.outputDirectory().resolve("unexpected.txt");
    Files.writeString(unknown, "preserve me");

    assertThatThrownBy(
            () ->
                SyntheticDicomFixtureGenerator.generate(
                    tempDirectory,
                    SyntheticDicomFixtureGenerator.OverwritePolicy.RESET_KNOWN_FILES))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("unknown entries");

    assertThat(unknown).exists();
    assertThat(first.manifestPath()).exists();
  }

  @Test
  void writesContractFixtureToTarget() throws IOException {
    Path targetBase = Path.of("target", "synthetic-dicom-fixtures");
    SyntheticDicomFixtureGenerator.GeneratedFixture fixture =
        SyntheticDicomFixtureGenerator.generate(
            targetBase, SyntheticDicomFixtureGenerator.OverwritePolicy.RESET_KNOWN_FILES);

    assertThat(fixture.outputDirectory())
        .isEqualTo(targetBase.toRealPath().resolve(SyntheticDicomFixtureGenerator.FIXTURE_VERSION));
    assertThat(fixture.outputDirectory()).startsWith(targetBase.toRealPath());
    assertThat(fixture.manifestPath()).exists();
    assertThat(fixture.instances()).hasSize(4);
  }

  private static ParsedInstance read(Path path) throws IOException {
    try (DicomInputStream inputStream = new DicomInputStream(path.toFile())) {
      return new ParsedInstance(inputStream.readDataset(), inputStream.getTransferSyntax());
    }
  }

  private static int unsignedShortLE(byte[] frame, int pixelIndex) {
    int offset = pixelIndex * 2;
    return (frame[offset] & 0xFF) | ((frame[offset + 1] & 0xFF) << 8);
  }

  private record ParsedInstance(Attributes attributes, String transferSyntaxUID) {}
}
