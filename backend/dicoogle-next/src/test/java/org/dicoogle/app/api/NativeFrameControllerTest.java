package org.dicoogle.app.api;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomInputStream;
import org.dcm4che3.io.DicomOutputStream;
import org.dicoogle.app.testing.fixtures.SyntheticDicomFixtureGenerator;
import org.dicoogle.sdk.ImplementationInfo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@DirtiesContext
@AutoConfigureMockMvc
@ActiveProfiles("test")
class NativeFrameControllerTest {

  private static final String BAD_STUDY = "1.2.826.0.1.3680043.2.1125.200.1";
  private static final String BAD_SERIES = "1.2.826.0.1.3680043.2.1125.200.1.1";
  private static final String BAD_SOP = "1.2.826.0.1.3680043.2.1125.200.1.1.1";
  private static final int FRAME_SIZE = 8192;

  @Autowired private MockMvc mockMvc;

  @TempDir Path tempDirectory;

  private Path multiframePath;
  private Path singleFramePath;

  @BeforeEach
  void setUp() throws IOException {
    SyntheticDicomFixtureGenerator.GeneratedFixture fixture =
        SyntheticDicomFixtureGenerator.generate(tempDirectory);
    multiframePath = storeFixture(fixture.instances().getFirst());
    singleFramePath = storeFixture(fixture.instances().get(1));
  }

  @Test
  void authenticatedRequestReturnsMultipartFramesInRequestedOrder() throws Exception {
    MvcResult result =
        mockMvc
            .perform(
                get(framePath(
                        SyntheticDicomFixtureGenerator.STUDY_INSTANCE_UID,
                        SyntheticDicomFixtureGenerator.SERIES_A_INSTANCE_UID,
                        SyntheticDicomFixtureGenerator.INSTANCE_A_UID,
                        "8,1,3"))
                    .with(user("dicoogle").roles("ADMIN")))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("multipart/related"))
            .andExpect(header().string("X-Frame-Representation", "native-frame-v1"))
            .andExpect(
                header()
                    .string(
                        "X-Frame-Transfer-Syntax",
                        SyntheticDicomFixtureGenerator.TRANSFER_SYNTAX_UID))
            .andExpect(header().string("X-Frame-Number-Basis", "1"))
            .andExpect(header().string("X-Frame-Source", "next"))
            .andExpect(header().string("X-Frame-Cache", "bypass"))
            .andExpect(header().string("Cache-Control", "no-store"))
            .andReturn();

    String boundary =
        MediaType.parseMediaType(result.getResponse().getContentType()).getParameter("boundary");
    List<Part> parts = parts(result.getResponse().getContentAsByteArray(), boundary);
    List<byte[]> expected = readFrames(multiframePath);

    assertEquals(3, parts.size());
    assertEquals(8, parts.get(0).frameNumber());
    assertEquals(1, parts.get(1).frameNumber());
    assertEquals(3, parts.get(2).frameNumber());
    assertArrayEquals(expected.get(7), parts.get(0).payload());
    assertArrayEquals(expected.get(0), parts.get(1).payload());
    assertArrayEquals(expected.get(2), parts.get(2).payload());
    assertFalse(Arrays.equals(parts.get(0).payload(), parts.get(1).payload()));
  }

  @Test
  void unauthenticatedRequestReturns401WithoutFramePayload() throws Exception {
    MvcResult result =
        mockMvc
            .perform(
                get(framePath(
                    SyntheticDicomFixtureGenerator.STUDY_INSTANCE_UID,
                    SyntheticDicomFixtureGenerator.SERIES_A_INSTANCE_UID,
                    SyntheticDicomFixtureGenerator.INSTANCE_A_UID,
                    "1")))
            .andExpect(status().isUnauthorized())
            .andReturn();

    assertNoMultipartBody(result);
  }

  @Test
  void singleFrameRequestReturnsExactlyOneFrame() throws Exception {
    MvcResult result =
        mockMvc
            .perform(
                get(framePath(
                        SyntheticDicomFixtureGenerator.STUDY_INSTANCE_UID,
                        SyntheticDicomFixtureGenerator.SERIES_B_INSTANCE_UID,
                        SyntheticDicomFixtureGenerator.INSTANCE_B_1_UID,
                        "1"))
                    .with(user("dicoogle").roles("ADMIN")))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("multipart/related"))
            .andReturn();

    String boundary =
        MediaType.parseMediaType(result.getResponse().getContentType()).getParameter("boundary");
    List<Part> parts = parts(result.getResponse().getContentAsByteArray(), boundary);
    assertEquals(1, parts.size());
    assertEquals(1, parts.get(0).frameNumber());
    assertArrayEquals(readFrames(singleFramePath).getFirst(), parts.get(0).payload());
  }

  @Test
  void duplicateFrameReturns400WithoutMultipartBody() throws Exception {
    MvcResult result =
        mockMvc
            .perform(
                get(framePath(
                        SyntheticDicomFixtureGenerator.STUDY_INSTANCE_UID,
                        SyntheticDicomFixtureGenerator.SERIES_A_INSTANCE_UID,
                        SyntheticDicomFixtureGenerator.INSTANCE_A_UID,
                        "1,1"))
                    .with(user("dicoogle").roles("ADMIN")))
            .andExpect(status().isBadRequest())
            .andExpect(content().contentType("application/problem+json"))
            .andReturn();

    assertNoMultipartBody(result);
  }

  @Test
  void missingInstanceReturns404WithoutMultipartBody() throws Exception {
    MvcResult result =
        mockMvc
            .perform(
                get(framePath("1.2.3", "4.5.6", "7.8.9", "1"))
                    .with(user("dicoogle").roles("ADMIN")))
            .andExpect(status().isNotFound())
            .andExpect(content().contentType("application/problem+json"))
            .andReturn();

    assertNoMultipartBody(result);
  }

  @Test
  void unacceptableMediaTypeReturns406WithoutMultipartBody() throws Exception {
    MvcResult result =
        mockMvc
            .perform(
                get(framePath(
                        SyntheticDicomFixtureGenerator.STUDY_INSTANCE_UID,
                        SyntheticDicomFixtureGenerator.SERIES_A_INSTANCE_UID,
                        SyntheticDicomFixtureGenerator.INSTANCE_A_UID,
                        "1"))
                    .accept(MediaType.APPLICATION_JSON)
                    .with(user("dicoogle").roles("ADMIN")))
            .andExpect(status().isNotAcceptable())
            .andReturn();

    assertNoMultipartBody(result);
  }

  @Test
  void unsupportedTransferSyntaxReturns415WithoutMultipartBody() throws Exception {
    storeDicom(BAD_STUDY, BAD_SERIES, BAD_SOP, UID.ImplicitVRLittleEndian, 8, allFrames(8));

    MvcResult result =
        mockMvc
            .perform(
                get(framePath(BAD_STUDY, BAD_SERIES, BAD_SOP, "1"))
                    .with(user("dicoogle").roles("ADMIN")))
            .andExpect(status().isUnsupportedMediaType())
            .andExpect(content().contentType("application/problem+json"))
            .andReturn();

    assertNoMultipartBody(result);
  }

  @Test
  void inconsistentPixelDataReturns422WithoutMultipartBody() throws Exception {
    storeDicom(
        BAD_STUDY,
        BAD_SERIES,
        BAD_SOP,
        UID.ExplicitVRLittleEndian,
        8,
        frameBytes(1));

    MvcResult result =
        mockMvc
            .perform(
                get(framePath(BAD_STUDY, BAD_SERIES, BAD_SOP, "1"))
                    .with(user("dicoogle").roles("ADMIN")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(content().contentType("application/problem+json"))
            .andReturn();

    assertNoMultipartBody(result);
  }

  @Test
  void existingFullInstanceRouteStillWorks() throws Exception {
    mockMvc
        .perform(
            get("/dicom-web/studies/"
                    + SyntheticDicomFixtureGenerator.STUDY_INSTANCE_UID
                    + "/series/"
                    + SyntheticDicomFixtureGenerator.SERIES_A_INSTANCE_UID
                    + "/instances/"
                    + SyntheticDicomFixtureGenerator.INSTANCE_A_UID)
                .with(user("dicoogle").roles("ADMIN")))
        .andExpect(status().isOk())
        .andExpect(content().contentType("application/dicom"));
  }

  private Path storeFixture(SyntheticDicomFixtureGenerator.GeneratedInstance instance)
      throws IOException {
    Path path =
        Path.of("target/test-storage/wado")
            .resolve("PATIENT-01")
            .resolve(SyntheticDicomFixtureGenerator.STUDY_INSTANCE_UID)
            .resolve(instance.seriesInstanceUID())
            .resolve(instance.sopInstanceUID() + ".dcm");
    Files.createDirectories(path.getParent());
    Files.copy(instance.path(), path, StandardCopyOption.REPLACE_EXISTING);
    return path;
  }

  private void storeDicom(
      String studyInstanceUid,
      String seriesInstanceUid,
      String sopInstanceUid,
      String transferSyntaxUid,
      int numberOfFrames,
      byte[] pixelData)
      throws IOException {
    Path path =
        Path.of("target/test-storage/wado")
            .resolve("PATIENT-ERROR")
            .resolve(studyInstanceUid)
            .resolve(seriesInstanceUid)
            .resolve(sopInstanceUid + ".dcm");
    Files.createDirectories(path.getParent());
    Files.write(
        path,
        dicom(
            studyInstanceUid,
            seriesInstanceUid,
            sopInstanceUid,
            transferSyntaxUid,
            numberOfFrames,
            pixelData));
  }

  private static byte[] dicom(
      String studyInstanceUid,
      String seriesInstanceUid,
      String sopInstanceUid,
      String transferSyntaxUid,
      int numberOfFrames,
      byte[] pixelData) {
    try {
      Attributes fmi = new Attributes();
      fmi.setString(Tag.TransferSyntaxUID, VR.UI, transferSyntaxUid);
      fmi.setString(
          Tag.MediaStorageSOPClassUID,
          VR.UI,
          UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage);
      fmi.setString(Tag.MediaStorageSOPInstanceUID, VR.UI, sopInstanceUid);
      fmi.setString(Tag.ImplementationClassUID, VR.UI, ImplementationInfo.IMPLEMENTATION_CLASS_UID);

      Attributes attributes = new Attributes();
      attributes.setString(
          Tag.SOPClassUID,
          VR.UI,
          UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage);
      attributes.setString(Tag.SOPInstanceUID, VR.UI, sopInstanceUid);
      attributes.setString(Tag.StudyInstanceUID, VR.UI, studyInstanceUid);
      attributes.setString(Tag.SeriesInstanceUID, VR.UI, seriesInstanceUid);
      attributes.setInt(Tag.Rows, VR.US, 64);
      attributes.setInt(Tag.Columns, VR.US, 64);
      attributes.setInt(Tag.SamplesPerPixel, VR.US, 1);
      attributes.setString(Tag.PhotometricInterpretation, VR.CS, "MONOCHROME2");
      attributes.setInt(Tag.BitsAllocated, VR.US, 16);
      attributes.setInt(Tag.BitsStored, VR.US, 16);
      attributes.setInt(Tag.HighBit, VR.US, 15);
      attributes.setInt(Tag.PixelRepresentation, VR.US, 0);
      attributes.setInt(Tag.NumberOfFrames, VR.IS, numberOfFrames);
      attributes.setBytes(Tag.PixelData, VR.OW, pixelData);

      ByteArrayOutputStream output = new ByteArrayOutputStream();
      try (DicomOutputStream dicomOutput =
          new DicomOutputStream(output, UID.ExplicitVRLittleEndian)) {
        dicomOutput.writeDataset(fmi, attributes);
      }
      return output.toByteArray();
    } catch (IOException ex) {
      throw new IllegalStateException(ex);
    }
  }

  private static List<byte[]> readFrames(Path path) throws IOException {
    try (DicomInputStream inputStream = new DicomInputStream(path.toFile())) {
      Attributes attributes = inputStream.readDataset();
      byte[] pixelData = attributes.getBytes(Tag.PixelData);
      int numberOfFrames = attributes.getInt(Tag.NumberOfFrames, 1);
      List<byte[]> frames = new ArrayList<>(numberOfFrames);
      for (int index = 0; index < numberOfFrames; index++) {
        frames.add(
            Arrays.copyOfRange(pixelData, index * FRAME_SIZE, (index + 1) * FRAME_SIZE));
      }
      return frames;
    }
  }

  private static byte[] allFrames(int count) {
    ByteArrayOutputStream output = new ByteArrayOutputStream(count * FRAME_SIZE);
    for (int frame = 1; frame <= count; frame++) {
      output.writeBytes(frameBytes(frame));
    }
    return output.toByteArray();
  }

  private static byte[] frameBytes(int frameNumber) {
    byte[] frame = new byte[FRAME_SIZE];
    int offset = 0;
    for (int y = 0; y < 64; y++) {
      for (int x = 0; x < 64; x++) {
        int value = (x * 257 + y * 131 + (frameNumber - 1) * 4099) & 0xFFFF;
        frame[offset++] = (byte) (value & 0xFF);
        frame[offset++] = (byte) ((value >>> 8) & 0xFF);
      }
    }
    return frame;
  }

  private static String framePath(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid, String frameList) {
    return "/dicom-web/studies/"
        + studyInstanceUid
        + "/series/"
        + seriesInstanceUid
        + "/instances/"
        + sopInstanceUid
        + "/frames/"
        + frameList;
  }

  private static void assertNoMultipartBody(MvcResult result) {
    String contentType = result.getResponse().getContentType();
    if (contentType != null) {
      assertFalse(contentType.toLowerCase().contains("multipart/related"));
    }
    byte[] body = result.getResponse().getContentAsByteArray();
    assertTrue(body.length == 0 || !new String(body, StandardCharsets.ISO_8859_1).contains("X-Frame-Number"));
  }

  private static List<Part> parts(byte[] body, String boundary) {
    byte[] marker = ("--" + boundary + "\r\n").getBytes(StandardCharsets.US_ASCII);
    byte[] separator = ("\r\n--" + boundary).getBytes(StandardCharsets.US_ASCII);
    byte[] headerSeparator = "\r\n\r\n".getBytes(StandardCharsets.US_ASCII);
    List<Part> result = new ArrayList<>();
    int position = 0;
    while (startsWith(body, marker, position)) {
      position += marker.length;
      int headerEnd = indexOf(body, headerSeparator, position);
      if (headerEnd < 0) {
        throw new AssertionError("Multipart part header is not terminated");
      }
      String headers = new String(body, position, headerEnd - position, StandardCharsets.US_ASCII);
      int dataStart = headerEnd + headerSeparator.length;
      int next = indexOf(body, separator, dataStart);
      if (next < 0) {
        throw new AssertionError("Multipart part payload is not terminated");
      }
      result.add(new Part(frameNumber(headers), Arrays.copyOfRange(body, dataStart, next)));
      position = next + 2;
      if (startsWith(body, ("--" + boundary + "--").getBytes(StandardCharsets.US_ASCII), position)) {
        break;
      }
      if (!startsWith(body, marker, position)) {
        throw new AssertionError("Multipart boundary framing is invalid");
      }
    }
    return result;
  }

  private static int frameNumber(String headers) {
    for (String line : headers.split("\r\n")) {
      if (line.regionMatches(true, 0, "X-Frame-Number:", 0, "X-Frame-Number:".length())) {
        return Integer.parseInt(line.substring("X-Frame-Number:".length()).trim());
      }
    }
    throw new AssertionError("Missing X-Frame-Number header");
  }

  private static boolean startsWith(byte[] data, byte[] prefix, int offset) {
    if (offset + prefix.length > data.length) {
      return false;
    }
    for (int index = 0; index < prefix.length; index++) {
      if (data[offset + index] != prefix[index]) {
        return false;
      }
    }
    return true;
  }

  private static int indexOf(byte[] data, byte[] needle, int from) {
    for (int index = from; index <= data.length - needle.length; index++) {
      if (startsWith(data, needle, index)) {
        return index;
      }
    }
    return -1;
  }

  private record Part(int frameNumber, byte[] payload) {}
}
