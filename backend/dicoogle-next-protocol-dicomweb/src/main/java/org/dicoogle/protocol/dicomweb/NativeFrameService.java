package org.dicoogle.protocol.dicomweb;

import io.micrometer.core.instrument.MeterRegistry;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Fragments;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.UID;
import org.dcm4che3.io.DicomInputStream;
import org.dicoogle.core.storage.StorageRouter;
import org.dicoogle.sdk.storage.DicomInstanceLocator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class NativeFrameService {

  static final String REPRESENTATION = "native-frame-v1";
  private static final Logger LOGGER = LoggerFactory.getLogger(NativeFrameService.class);
  private static final Pattern FRAME_TOKEN = Pattern.compile("\\d+");
  private static final int READ_BUFFER_BYTES = 8192;

  private final List<DicomInstanceLocator> locators;
  private final StorageRouter storageRouter;
  private final MeterRegistry meterRegistry;
  private final NativeFrameLimits limits;

  @Autowired
  public NativeFrameService(
      List<DicomInstanceLocator> locators,
      StorageRouter storageRouter,
      MeterRegistry meterRegistry) {
    this(locators, storageRouter, meterRegistry, NativeFrameLimits.defaults());
  }

  public NativeFrameService(
      List<DicomInstanceLocator> locators,
      StorageRouter storageRouter,
      MeterRegistry meterRegistry,
      NativeFrameLimits limits) {
    this.locators = List.copyOf(locators);
    this.storageRouter = storageRouter;
    this.meterRegistry = meterRegistry;
    this.limits = limits;
  }

  public NativeFrameResponse retrieveFrames(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid, String frameList) {
    increment("dicoogle.nativeframes.requests");
    try {
      NativeFrameResponse response =
          doRetrieve(studyInstanceUid, seriesInstanceUid, sopInstanceUid, frameList);
      increment("dicoogle.nativeframes.success");
      meterRegistry
          .counter("dicoogle.nativeframes.bytes", "type", "instance-read")
          .increment(response.serverInstanceBytesRead());
      meterRegistry
          .counter("dicoogle.nativeframes.bytes", "type", "frame-response")
          .increment(response.responseFrameBytes());
      meterRegistry.counter("dicoogle.nativeframes.backend-reads").increment();
      return response;
    } catch (ResponseStatusException ex) {
      increment("dicoogle.nativeframes.failure");
      throw ex;
    } catch (LimitExceededException ex) {
      increment("dicoogle.nativeframes.failure");
      throw new ResponseStatusException(
          HttpStatus.PAYLOAD_TOO_LARGE,
          "Requested frame response exceeds the configured resource limit",
          ex);
    } catch (IOException ex) {
      increment("dicoogle.nativeframes.failure");
      LOGGER.error("Native-frame storage read or parse failed: {}", ex.getClass().getSimpleName());
      throw new ResponseStatusException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "Failed to read or parse the stored DICOM instance",
          ex);
    }
  }

  private NativeFrameResponse doRetrieve(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid, String frameList)
      throws IOException {
    List<Integer> requestedFrames = parseFrameList(frameList);
    LocatedInstance located = locate(studyInstanceUid, seriesInstanceUid, sopInstanceUid);

    byte[] instanceBytes;
    try (InputStream stream =
        storageRouter
            .requireReadable(located.location().getScheme())
            .openForRead(located.location())) {
      instanceBytes = readBounded(stream, limits.maxStoredInstanceBytes());
    }

    ParsedInstance parsed = parse(instanceBytes);
    validateIdentity(parsed.attributes(), studyInstanceUid, seriesInstanceUid, sopInstanceUid);
    validateSupportedProfile(parsed.transferSyntaxUID(), parsed.attributes());
    FramePlan plan = planFrames(parsed.attributes(), requestedFrames);

    String boundary = UUID.randomUUID().toString();
    MultipartBody multipart = buildMultipart(plan, boundary);
    return new NativeFrameResponse(
        multipart.body(),
        boundary,
        parsed.transferSyntaxUID(),
        requestedFrames,
        instanceBytes.length,
        multipart.frameBytes(),
        1);
  }

  private LocatedInstance locate(
      String studyInstanceUid, String seriesInstanceUid, String sopInstanceUid) {
    for (DicomInstanceLocator locator : locators) {
      try {
        Optional<URI> location =
            locator.locateInstance(studyInstanceUid, seriesInstanceUid, sopInstanceUid);
        if (location.isPresent()) {
          storageRouter.requireReadable(location.get().getScheme());
          return new LocatedInstance(location.get());
        }
      } catch (IOException ex) {
        throw new ResponseStatusException(
            HttpStatus.INTERNAL_SERVER_ERROR, "Failed to resolve the stored DICOM instance", ex);
      }
    }
    throw notFound();
  }

  private static byte[] readBounded(InputStream stream, long maxBytes) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[READ_BUFFER_BYTES];
    long total = 0;
    int read;
    while ((read = stream.read(buffer)) != -1) {
      try {
        total = Math.addExact(total, read);
      } catch (ArithmeticException ex) {
        throw new LimitExceededException();
      }
      if (total > maxBytes) {
        throw new LimitExceededException();
      }
      output.write(buffer, 0, read);
    }
    return output.toByteArray();
  }

  private static ParsedInstance parse(byte[] payload) throws IOException {
    try (DicomInputStream inputStream = new DicomInputStream(new ByteArrayInputStream(payload))) {
      inputStream.setIncludeBulkData(DicomInputStream.IncludeBulkData.YES);
      Attributes attributes = inputStream.readDataset();
      return new ParsedInstance(attributes, inputStream.getTransferSyntax());
    }
  }

  private static void validateIdentity(
      Attributes attributes,
      String studyInstanceUid,
      String seriesInstanceUid,
      String sopInstanceUid) {
    if (!Objects.equals(studyInstanceUid, attributes.getString(Tag.StudyInstanceUID))
        || !Objects.equals(seriesInstanceUid, attributes.getString(Tag.SeriesInstanceUID))
        || !Objects.equals(sopInstanceUid, attributes.getString(Tag.SOPInstanceUID))) {
      throw notFound();
    }
  }

  private static void validateSupportedProfile(String transferSyntaxUid, Attributes attributes) {
    if (!UID.ExplicitVRLittleEndian.equals(transferSyntaxUid)) {
      throw unsupported("Unsupported transfer syntax for native-frame retrieval");
    }

    requirePresent(attributes, Tag.Rows);
    requirePresent(attributes, Tag.Columns);
    requirePresent(attributes, Tag.SamplesPerPixel);
    requirePresent(attributes, Tag.PhotometricInterpretation);
    requirePresent(attributes, Tag.BitsAllocated);
    requirePresent(attributes, Tag.BitsStored);
    requirePresent(attributes, Tag.HighBit);
    requirePresent(attributes, Tag.PixelRepresentation);

    int rows = attributes.getInt(Tag.Rows, -1);
    int columns = attributes.getInt(Tag.Columns, -1);
    if (rows <= 0 || columns <= 0) {
      throw inconsistent();
    }

    int samplesPerPixel = attributes.getInt(Tag.SamplesPerPixel, -1);
    if (samplesPerPixel <= 0) {
      throw inconsistent();
    }
    if (samplesPerPixel != 1) {
      throw unsupported("Unsupported pixel organisation for native-frame retrieval");
    }

    String photometricInterpretation = attributes.getString(Tag.PhotometricInterpretation);
    if (photometricInterpretation == null) {
      throw inconsistent();
    }
    if (!"MONOCHROME1".equals(photometricInterpretation)
        && !"MONOCHROME2".equals(photometricInterpretation)) {
      throw unsupported("Unsupported pixel organisation for native-frame retrieval");
    }

    int bitsAllocated = attributes.getInt(Tag.BitsAllocated, -1);
    int bitsStored = attributes.getInt(Tag.BitsStored, -1);
    int highBit = attributes.getInt(Tag.HighBit, -1);
    int pixelRepresentation = attributes.getInt(Tag.PixelRepresentation, -1);
    if (bitsAllocated <= 0 || bitsStored <= 0 || highBit < 0 || pixelRepresentation < 0) {
      throw inconsistent();
    }
    if (bitsAllocated != 8 && bitsAllocated != 16) {
      throw unsupported("Unsupported Bits Allocated for native-frame retrieval");
    }
    if (bitsStored > bitsAllocated || highBit != bitsStored - 1) {
      throw inconsistent();
    }
    if (pixelRepresentation != 0 && pixelRepresentation != 1) {
      throw unsupported("Unsupported Pixel Representation for native-frame retrieval");
    }

    Object pixelValue = attributes.getValue(Tag.PixelData);
    if (pixelValue instanceof Fragments) {
      throw unsupported("Encapsulated pixel data is not supported for native-frame retrieval");
    }
    if (!(pixelValue instanceof byte[])) {
      throw inconsistent();
    }
  }

  private FramePlan planFrames(Attributes attributes, List<Integer> requestedFrames) {
    int frameCount =
        attributes.contains(Tag.NumberOfFrames) ? attributes.getInt(Tag.NumberOfFrames, -1) : 1;
    if (frameCount <= 0) {
      throw inconsistent();
    }

    long frameSize = calculateFrameSize(attributes);
    if (frameSize > limits.maxFrameBytes()) {
      throw new LimitExceededException();
    }

    byte[] pixelData = (byte[]) attributes.getValue(Tag.PixelData);
    long expectedPixelDataBytes;
    try {
      expectedPixelDataBytes = Math.multiplyExact(frameSize, (long) frameCount);
    } catch (ArithmeticException ex) {
      throw inconsistent();
    }
    if (expectedPixelDataBytes != pixelData.length) {
      throw inconsistent();
    }

    for (int frameNumber : requestedFrames) {
      if (frameNumber > frameCount) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Frame number is out of range");
      }
    }

    long responseFrameBytes;
    try {
      responseFrameBytes = Math.multiplyExact(frameSize, (long) requestedFrames.size());
    } catch (ArithmeticException ex) {
      throw new LimitExceededException();
    }
    if (responseFrameBytes > limits.maxResponseBytes()) {
      throw new LimitExceededException();
    }

    return new FramePlan(pixelData, frameSize, requestedFrames, responseFrameBytes);
  }

  private static long calculateFrameSize(Attributes attributes) {
    int rows = attributes.getInt(Tag.Rows, -1);
    int columns = attributes.getInt(Tag.Columns, -1);
    int bytesPerSample = attributes.getInt(Tag.BitsAllocated, -1) / 8;
    try {
      long pixels = Math.multiplyExact((long) rows, columns);
      return Math.multiplyExact(pixels, (long) bytesPerSample);
    } catch (ArithmeticException ex) {
      throw inconsistent();
    }
  }

  private MultipartBody buildMultipart(FramePlan plan, String boundary) {
    int initialCapacity = (int) Math.min(plan.responseFrameBytes() + 1024L, Integer.MAX_VALUE);
    ByteArrayOutputStream output = new ByteArrayOutputStream(initialCapacity);
    long frameBytes = 0;
    try {
      for (int frameNumber : plan.requestedFrames()) {
        long offset = Math.multiplyExact((long) (frameNumber - 1), plan.frameSize());
        int start = Math.toIntExact(offset);
        int end = Math.toIntExact(Math.addExact(offset, plan.frameSize()));
        writeAscii(output, "--" + boundary + "\r\n");
        writeAscii(output, "Content-Type: application/octet-stream\r\n");
        writeAscii(output, "X-Frame-Number: " + frameNumber + "\r\n\r\n");
        output.write(plan.pixelData(), start, end - start);
        writeAscii(output, "\r\n");
        frameBytes = Math.addExact(frameBytes, plan.frameSize());
      }
      writeAscii(output, "--" + boundary + "--\r\n");
    } catch (ArithmeticException ex) {
      throw inconsistent();
    }
    return new MultipartBody(output.toByteArray(), frameBytes);
  }

  private List<Integer> parseFrameList(String frameList) {
    if (frameList == null || frameList.isEmpty()) {
      throw invalidFrameList();
    }
    String[] tokens = frameList.split(",", -1);
    List<Integer> frames = new ArrayList<>(tokens.length);
    Set<Integer> seen = new HashSet<>();
    for (String token : tokens) {
      String trimmed = token.trim();
      if (trimmed.isEmpty() || !FRAME_TOKEN.matcher(trimmed).matches()) {
        throw invalidFrameList();
      }
      int frameNumber;
      try {
        frameNumber = Integer.parseInt(trimmed);
      } catch (NumberFormatException ex) {
        throw invalidFrameList();
      }
      if (frameNumber <= 0 || !seen.add(frameNumber)) {
        throw invalidFrameList();
      }
      frames.add(frameNumber);
      if (frames.size() > limits.maxFramesPerRequest()) {
        throw invalidFrameList();
      }
    }
    return List.copyOf(frames);
  }

  private static void requirePresent(Attributes attributes, int tag) {
    if (!attributes.contains(tag)) {
      throw inconsistent();
    }
  }

  private static void writeAscii(ByteArrayOutputStream output, String value) {
    output.writeBytes(value.getBytes(StandardCharsets.US_ASCII));
  }

  private void increment(String metric) {
    meterRegistry.counter(metric).increment();
  }

  private static ResponseStatusException notFound() {
    return new ResponseStatusException(
        HttpStatus.NOT_FOUND, "DICOM instance not found for study/series/SOP identifiers");
  }

  private static ResponseStatusException invalidFrameList() {
    return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid frame list");
  }

  private static ResponseStatusException unsupported(String detail) {
    return new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, detail);
  }

  private static ResponseStatusException inconsistent() {
    return new ResponseStatusException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Stored DICOM object is structurally inconsistent for native-frame retrieval");
  }

  private record LocatedInstance(URI location) {}

  private record ParsedInstance(Attributes attributes, String transferSyntaxUID) {}

  private record FramePlan(
      byte[] pixelData, long frameSize, List<Integer> requestedFrames, long responseFrameBytes) {}

  private record MultipartBody(byte[] body, long frameBytes) {}

  private static final class LimitExceededException extends RuntimeException {}
}
