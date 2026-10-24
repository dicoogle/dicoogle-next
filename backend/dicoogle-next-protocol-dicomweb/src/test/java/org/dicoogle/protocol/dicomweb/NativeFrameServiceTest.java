package org.dicoogle.protocol.dicomweb;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Fragments;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.data.VR;
import org.dcm4che3.io.DicomOutputStream;
import org.dicoogle.core.query.QueryRouter;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.ImplementationInfo;
import org.dicoogle.sdk.PluginMetadata;
import org.dicoogle.sdk.service.StorageRetrieveEventListener;
import org.dicoogle.sdk.storage.DicomInstanceLocator;
import org.dicoogle.sdk.storage.ReadableStoragePlugin;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class NativeFrameServiceTest {

  private static final String STUDY = "1.2.826.0.1.3680043.2.1125.100.1";
  private static final String SERIES_A = "1.2.826.0.1.3680043.2.1125.100.1.1";
  private static final String INSTANCE_A = "1.2.826.0.1.3680043.2.1125.100.1.1.1";
  private static final String SERIES_B = "1.2.826.0.1.3680043.2.1125.100.1.2";
  private static final String INSTANCE_B = "1.2.826.0.1.3680043.2.1125.100.1.2.1";
  private static final int FRAME_SIZE = 8192;

  @Test
  void returnsFrameOneAndFrameEightNativeBytes() {
    StubPlugin plugin = new StubPlugin(multiframe());
    NativeFrameResponse response = retrieve(service(plugin), "1,8");

    assertArrayEquals(frameBytes(1), parts(response).get(0).payload());
    assertArrayEquals(frameBytes(8), parts(response).get(1).payload());
    assertEquals(16384, response.responseFrameBytes());
    assertEquals(plugin.payload.length, response.serverInstanceBytesRead());
    assertEquals(1, response.backendInstanceReads());
    assertTrue(plugin.closed.get());
  }

  @Test
  void preservesNonSequentialRequestedOrder() {
    NativeFrameResponse response = retrieve(service(new StubPlugin(multiframe())), "8,1,3");

    assertEquals(List.of(8, 1, 3), response.frameNumbers());
    List<Part> parts = parts(response);
    assertEquals(3, parts.size());
    assertEquals(8, parts.get(0).frameNumber());
    assertEquals(1, parts.get(1).frameNumber());
    assertEquals(3, parts.get(2).frameNumber());
    assertArrayEquals(frameBytes(8), parts.get(0).payload());
    assertArrayEquals(frameBytes(1), parts.get(1).payload());
    assertArrayEquals(frameBytes(3), parts.get(2).payload());
  }

  @Test
  void returnsFrameOneForSingleFrameInstance() {
    byte[] dicom = singleFrame(true);
    NativeFrameResponse response =
        service(new StubPlugin(dicom))
            .retrieveFrames(STUDY, SERIES_B, INSTANCE_B, "1");

    List<Part> parts = parts(response);
    assertEquals(1, parts.size());
    assertEquals(1, parts.get(0).frameNumber());
    assertArrayEquals(frameBytes(1), parts.get(0).payload());
  }

  @Test
  void treatsMissingNumberOfFramesAsOneForSingleFrameSop() {
    NativeFrameResponse response =
        service(new StubPlugin(singleFrame(false)))
            .retrieveFrames(STUDY, SERIES_B, INSTANCE_B, "1");

    assertEquals(1, parts(response).size());
    expectStatus(
        HttpStatus.BAD_REQUEST,
        () ->
            service(new StubPlugin(singleFrame(false)))
                .retrieveFrames(STUDY, SERIES_B, INSTANCE_B, "2"));
  }

  @Test
  void rejectsMalformedDuplicateAndOutOfRangeFrameLists() {
    NativeFrameService service = service(new StubPlugin(multiframe()));

    for (String frameList : List.of("", "1,,2", "a", "0", "-1", "9", "1,1", "1,2,3,4,5,6,7,8,9")) {
      expectStatus(HttpStatus.BAD_REQUEST, () -> retrieve(service, frameList));
    }
  }

  @Test
  void rejectsStudySeriesAndSopMismatchAsNotFound() {
    NativeFrameService service = service(new StubPlugin(multiframe()));

    expectStatus(
        HttpStatus.NOT_FOUND,
        () -> service.retrieveFrames("wrong-study", SERIES_A, INSTANCE_A, "1"));
    expectStatus(
        HttpStatus.NOT_FOUND,
        () -> service.retrieveFrames(STUDY, "wrong-series", INSTANCE_A, "1"));
    expectStatus(
        HttpStatus.NOT_FOUND,
        () -> service.retrieveFrames(STUDY, SERIES_A, "wrong-sop", "1"));
  }

  @Test
  void rejectsUnsupportedPixelProfileAndTransferSyntax() {
    byte[] monochrome1 =
        dicom(
            UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage,
            UID.ExplicitVRLittleEndian,
            STUDY,
            SERIES_A,
            INSTANCE_A,
            64,
            64,
            8,
            16,
            16,
            15,
            0,
            "MONOCHROME1",
            1,
            allFrames(8),
            true);
    byte[] implicitVr =
        dicom(
            UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage,
            UID.ImplicitVRLittleEndian,
            STUDY,
            SERIES_A,
            INSTANCE_A,
            64,
            64,
            8,
            16,
            16,
            15,
            0,
            "MONOCHROME2",
            1,
            allFrames(8),
            true);
    byte[] eightBit =
        dicom(
            UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage,
            UID.ExplicitVRLittleEndian,
            STUDY,
            SERIES_A,
            INSTANCE_A,
            64,
            64,
            8,
            8,
            8,
            7,
            0,
            "MONOCHROME2",
            1,
            allFrames(8),
            true);

    expectStatus(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        () -> retrieve(service(new StubPlugin(monochrome1)), "1"));
    expectStatus(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        () -> retrieve(service(new StubPlugin(implicitVr)), "1"));
    expectStatus(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE, () -> retrieve(service(new StubPlugin(eightBit)), "1"));
  }

  /**
   * Intentionally encapsulated, not a supported native-frame fixture. The supported transfer
   * syntax and valid pixel metadata ensure the request reaches the fragment-specific profile
   * branch rather than an earlier transfer-syntax or pixel-organisation rejection.
   */
  @Test
  void rejectsEncapsulatedPixelDataAsUnsupportedProfile() {
    expectStatus(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        () -> retrieve(service(new StubPlugin(encapsulatedPixelDataInstance())), "1"));
  }

  @Test
  void rejectsMissingOrInconsistentPixelDataAndFrameCount() {
    byte[] missingPixelData =
        dicom(
            UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage,
            UID.ExplicitVRLittleEndian,
            STUDY,
            SERIES_A,
            INSTANCE_A,
            64,
            64,
            8,
            16,
            16,
            15,
            0,
            "MONOCHROME2",
            1,
            null,
            true);
    byte[] missingFramesTag =
        dicom(
            UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage,
            UID.ExplicitVRLittleEndian,
            STUDY,
            SERIES_A,
            INSTANCE_A,
            64,
            64,
            8,
            16,
            16,
            15,
            0,
            "MONOCHROME2",
            1,
            allFrames(8),
            false);
    byte[] wrongPixelLength =
        dicom(
            UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage,
            UID.ExplicitVRLittleEndian,
            STUDY,
            SERIES_A,
            INSTANCE_A,
            64,
            64,
            7,
            16,
            16,
            15,
            0,
            "MONOCHROME2",
            1,
            allFrames(8),
            true);

    expectStatus(
        HttpStatus.UNPROCESSABLE_ENTITY,
        () -> retrieve(service(new StubPlugin(missingPixelData)), "1"));
    expectStatus(
        HttpStatus.UNPROCESSABLE_ENTITY,
        () -> retrieve(service(new StubPlugin(missingFramesTag)), "1"));
    expectStatus(
        HttpStatus.UNPROCESSABLE_ENTITY,
        () -> retrieve(service(new StubPlugin(wrongPixelLength)), "1"));
  }

  @Test
  void rejectsCheckedArithmeticOverflow() {
    byte[] hugeFrameCount =
        dicom(
            UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage,
            UID.ExplicitVRLittleEndian,
            STUDY,
            SERIES_A,
            INSTANCE_A,
            64,
            64,
            Integer.MAX_VALUE,
            16,
            16,
            15,
            0,
            "MONOCHROME2",
            1,
            allFrames(8),
            true);

    expectStatus(
        HttpStatus.UNPROCESSABLE_ENTITY,
        () -> retrieve(service(new StubPlugin(hugeFrameCount)), "1"));
  }

  @Test
  void rejectsOversizedInputDuringBoundedReadAndClosesStream() {
    StubPlugin plugin = new StubPlugin(multiframe());
    NativeFrameLimits limits = new NativeFrameLimits(1024, 16 * 1024 * 1024, 64 * 1024 * 1024, 8);

    expectStatus(HttpStatus.PAYLOAD_TOO_LARGE, () -> retrieve(service(plugin, limits), "1"));
    assertTrue(plugin.closed.get());
  }

  @Test
  void rejectsPerFrameAndPerResponseLimits() {
    byte[] dicom = multiframe();
    NativeFrameLimits frameLimit = new NativeFrameLimits(64 * 1024 * 1024, 100, 64 * 1024 * 1024, 8);
    NativeFrameLimits responseLimit = new NativeFrameLimits(64 * 1024 * 1024, 16 * 1024 * 1024, 100, 8);

    expectStatus(
        HttpStatus.PAYLOAD_TOO_LARGE,
        () -> retrieve(service(new StubPlugin(dicom), frameLimit), "1"));
    expectStatus(
        HttpStatus.PAYLOAD_TOO_LARGE,
        () -> retrieve(service(new StubPlugin(dicom), responseLimit), "1,2"));
  }

  @Test
  void storageOpenAndReadFailuresReturnServerErrorAndCloseStreams() {
    StubPlugin openFailure = new StubPlugin(multiframe());
    openFailure.openFailure = new IOException("open failed");
    expectStatus(HttpStatus.INTERNAL_SERVER_ERROR, () -> retrieve(service(openFailure), "1"));

    StubPlugin readFailure = new StubPlugin(multiframe());
    readFailure.readFailure = new IOException("read failed");
    expectStatus(HttpStatus.INTERNAL_SERVER_ERROR, () -> retrieve(service(readFailure), "1"));
    assertTrue(readFailure.closed.get());
  }

  @Test
  void unsupportedSourceDoesNotProducePreviewOrLegacyFallback() {
    byte[] implicitVr =
        dicom(
            UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage,
            UID.ImplicitVRLittleEndian,
            STUDY,
            SERIES_A,
            INSTANCE_A,
            64,
            64,
            8,
            16,
            16,
            15,
            0,
            "MONOCHROME2",
            1,
            allFrames(8),
            true);

    expectStatus(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        () -> retrieve(service(new StubPlugin(implicitVr)), "1"));
  }

  @Test
  void existingFullInstanceRetrievalStillWorks() {
    StubPlugin plugin = new StubPlugin(multiframe());
    DicomwebRetrieveService retrieveService =
        new DicomwebRetrieveService(
            List.<DicomInstanceLocator>of(plugin),
            emptyRouter(),
            new StorageRouter(List.of(plugin)),
            List.<StorageRetrieveEventListener>of(),
            new SimpleMeterRegistry());

    byte[] retrieved = retrieveService.retrieveInstance(STUDY, SERIES_A, INSTANCE_A);
    assertArrayEquals(plugin.payload, retrieved);
  }

  private static NativeFrameService service(StubPlugin plugin) {
    return service(plugin, NativeFrameLimits.defaults());
  }

  private static NativeFrameService service(StubPlugin plugin, NativeFrameLimits limits) {
    return new NativeFrameService(
        List.of(plugin), new StorageRouter(List.of(plugin)), new SimpleMeterRegistry(), limits);
  }

  private static NativeFrameResponse retrieve(NativeFrameService service, String frameList) {
    return service.retrieveFrames(STUDY, SERIES_A, INSTANCE_A, frameList);
  }

  private static void expectStatus(HttpStatus status, Runnable action) {
    ResponseStatusException ex = assertThrows(ResponseStatusException.class, action::run);
    assertEquals(status, ex.getStatusCode());
  }

  private static QueryRouter emptyRouter() {
    return new QueryRouter(List.of(), List.of(), 4, 1000);
  }

  private static byte[] multiframe() {
    return dicom(
        UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage,
        UID.ExplicitVRLittleEndian,
        STUDY,
        SERIES_A,
        INSTANCE_A,
        64,
        64,
        8,
        16,
        16,
        15,
        0,
        "MONOCHROME2",
        1,
        allFrames(8),
        true);
  }

  private static byte[] encapsulatedPixelDataInstance() {
    try {
      Attributes fmi = new Attributes();
      fmi.setString(Tag.TransferSyntaxUID, VR.UI, UID.ExplicitVRLittleEndian);
      fmi.setString(
          Tag.MediaStorageSOPClassUID,
          VR.UI,
          UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage);
      fmi.setString(Tag.MediaStorageSOPInstanceUID, VR.UI, INSTANCE_A);
      fmi.setString(
          Tag.ImplementationClassUID, VR.UI, ImplementationInfo.IMPLEMENTATION_CLASS_UID);

      Attributes attributes = new Attributes();
      attributes.setString(
          Tag.SOPClassUID,
          VR.UI,
          UID.MultiFrameGrayscaleWordSecondaryCaptureImageStorage);
      attributes.setString(Tag.SOPInstanceUID, VR.UI, INSTANCE_A);
      attributes.setString(Tag.StudyInstanceUID, VR.UI, STUDY);
      attributes.setString(Tag.SeriesInstanceUID, VR.UI, SERIES_A);
      attributes.setInt(Tag.Rows, VR.US, 64);
      attributes.setInt(Tag.Columns, VR.US, 64);
      attributes.setInt(Tag.SamplesPerPixel, VR.US, 1);
      attributes.setString(Tag.PhotometricInterpretation, VR.CS, "MONOCHROME2");
      attributes.setInt(Tag.BitsAllocated, VR.US, 16);
      attributes.setInt(Tag.BitsStored, VR.US, 16);
      attributes.setInt(Tag.HighBit, VR.US, 15);
      attributes.setInt(Tag.PixelRepresentation, VR.US, 0);
      attributes.setInt(Tag.NumberOfFrames, VR.IS, 1);
      Fragments fragments = attributes.newFragments(Tag.PixelData, VR.OB, 2);
      fragments.add(null);
      fragments.add(frameBytes(1));

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

  private static byte[] singleFrame(boolean includeNumberOfFrames) {
    return dicom(
        UID.SecondaryCaptureImageStorage,
        UID.ExplicitVRLittleEndian,
        STUDY,
        SERIES_B,
        INSTANCE_B,
        64,
        64,
        1,
        16,
        16,
        15,
        0,
        "MONOCHROME2",
        1,
        frameBytes(1),
        includeNumberOfFrames);
  }

  private static byte[] dicom(
      String sopClassUid,
      String transferSyntaxUid,
      String studyInstanceUid,
      String seriesInstanceUid,
      String sopInstanceUid,
      int rows,
      int columns,
      int numberOfFrames,
      int bitsAllocated,
      int bitsStored,
      int highBit,
      int pixelRepresentation,
      String photometricInterpretation,
      int samplesPerPixel,
      byte[] pixelData,
      boolean includeNumberOfFrames) {
    try {
      Attributes fmi = new Attributes();
      fmi.setString(Tag.TransferSyntaxUID, VR.UI, transferSyntaxUid);
      fmi.setString(Tag.MediaStorageSOPClassUID, VR.UI, sopClassUid);
      fmi.setString(Tag.MediaStorageSOPInstanceUID, VR.UI, sopInstanceUid);
      fmi.setString(Tag.ImplementationClassUID, VR.UI, ImplementationInfo.IMPLEMENTATION_CLASS_UID);

      Attributes attributes = new Attributes();
      attributes.setString(Tag.SOPClassUID, VR.UI, sopClassUid);
      attributes.setString(Tag.SOPInstanceUID, VR.UI, sopInstanceUid);
      attributes.setString(Tag.StudyInstanceUID, VR.UI, studyInstanceUid);
      attributes.setString(Tag.SeriesInstanceUID, VR.UI, seriesInstanceUid);
      attributes.setInt(Tag.Rows, VR.US, rows);
      attributes.setInt(Tag.Columns, VR.US, columns);
      attributes.setInt(Tag.SamplesPerPixel, VR.US, samplesPerPixel);
      attributes.setString(Tag.PhotometricInterpretation, VR.CS, photometricInterpretation);
      attributes.setInt(Tag.BitsAllocated, VR.US, bitsAllocated);
      attributes.setInt(Tag.BitsStored, VR.US, bitsStored);
      attributes.setInt(Tag.HighBit, VR.US, highBit);
      attributes.setInt(Tag.PixelRepresentation, VR.US, pixelRepresentation);
      if (includeNumberOfFrames) {
        attributes.setInt(Tag.NumberOfFrames, VR.IS, numberOfFrames);
      }
      if (pixelData != null) {
        attributes.setBytes(Tag.PixelData, VR.OW, pixelData);
      }

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

  private static List<Part> parts(NativeFrameResponse response) {
    return parts(response.body(), response.boundary());
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

  private static final class StubPlugin implements ReadableStoragePlugin, DicomInstanceLocator {

    private static final URI LOCATION = URI.create("file:/tmp/native-frame-test/instance.dcm");

    private final byte[] payload;
    private final AtomicBoolean closed = new AtomicBoolean();
    private IOException openFailure;
    private IOException readFailure;

    private StubPlugin(byte[] payload) {
      this.payload = payload;
    }

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("native-frame-test", "native-frame-test", "1", "storage");
    }

    @Override
    public String scheme() {
      return "file";
    }

    @Override
    public InputStream openForRead(URI location) throws IOException {
      if (openFailure != null) {
        throw openFailure;
      }
      return new InputStream() {
        private int position;

        @Override
        public int read() throws IOException {
          byte[] single = new byte[1];
          int read = read(single, 0, 1);
          return read < 0 ? -1 : single[0] & 0xFF;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
          if (readFailure != null) {
            throw readFailure;
          }
          if (position >= payload.length) {
            return -1;
          }
          int count = Math.min(length, payload.length - position);
          System.arraycopy(payload, position, buffer, offset, count);
          position += count;
          return count;
        }

        @Override
        public void close() {
          closed.set(true);
        }
      };
    }

    @Override
    public Optional<URI> locateInstance(
        String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) {
      return Optional.of(LOCATION);
    }

    @Override
    public List<URI> listStudyInstances(String studyInstanceUid) {
      return List.of(LOCATION);
    }

    @Override
    public List<URI> listSeriesInstances(String studyInstanceUid, String seriesInstanceUid) {
      return List.of(LOCATION);
    }
  }
}
