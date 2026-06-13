package org.dicoogle.protocol.dimse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.IOException;
import java.net.URI;
import java.util.List;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dcm4che3.net.Status;
import org.dcm4che3.net.service.DicomServiceException;
import org.dicoogle.core.query.QueryRouter;
import org.dicoogle.sdk.PluginMetadata;
import org.dicoogle.sdk.query.DimseAccessPolicy;
import org.dicoogle.sdk.query.QueryMoveService;
import org.junit.jupiter.api.Test;

class CMoveServiceTest {

  private static DimseProperties emptyDim() {
    DimseProperties p = new DimseProperties();
    p.setDimProviders(List.of());
    return p;
  }

  @Test
  void rejectsUnknownDestination() {
    CMoveService service =
        new CMoveService(
            router(new DummyMovePlugin()),
            List.of(),
            new DimseCFindProperties(),
            new DimseCMoveProperties(),
            emptyDim(),
            new SimpleMeterRegistry(),
            null);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");

    DicomServiceException ex =
        assertThrows(
            DicomServiceException.class,
            () ->
                service.resolve(
                    CMoveService.STUDY_ROOT_MOVE_UID,
                    keys,
                    "UNKNOWN",
                    "CALLING",
                    "CALLED",
                    1,
                    () -> false));
    assertEquals(Status.MoveDestinationUnknown, ex.getStatus());
  }

  @Test
  void rejectsMissingQueryLevel() {
    DimseCMoveProperties properties = new DimseCMoveProperties();
    properties.setDestinations(java.util.Map.of("DEST", destination("127.0.0.1", 11113, "DEST")));
    CMoveService service =
        new CMoveService(
            router(new DummyMovePlugin()),
            List.of(),
            new DimseCFindProperties(),
            properties,
            emptyDim(),
            new SimpleMeterRegistry(),
            null);

    DicomServiceException ex =
        assertThrows(
            DicomServiceException.class,
            () ->
                service.resolve(
                    CMoveService.STUDY_ROOT_MOVE_UID,
                    new Attributes(),
                    "DEST",
                    "CALLING",
                    "CALLED",
                    2,
                    () -> false));
    assertEquals(Status.IdentifierDoesNotMatchSOPClass, ex.getStatus());
  }

  @Test
  void resolvesCandidatesAndAppliesMaxResults() throws Exception {
    DimseCMoveProperties properties = new DimseCMoveProperties();
    properties.setMaxResults(1);
    properties.setDestinations(java.util.Map.of("DEST", destination("127.0.0.1", 11113, "DEST")));

    CMoveService service =
        new CMoveService(
            router(new MultiMovePlugin()),
            List.of(),
            new DimseCFindProperties(),
            properties,
            emptyDim(),
            new SimpleMeterRegistry(),
            null);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");

    List<QueryMoveService.MoveCandidate> out =
        service.resolve(
            CMoveService.STUDY_ROOT_MOVE_UID, keys, "DEST", "CALLING", "CALLED", 3, () -> false);
    assertEquals(1, out.size());
  }

  @Test
  void rejectsStudyLevelWithoutStudyUid() {
    DimseCMoveProperties properties = new DimseCMoveProperties();
    properties.setDestinations(java.util.Map.of("DEST", destination("127.0.0.1", 11113, "DEST")));

    CMoveService service =
        new CMoveService(
            router(new DummyMovePlugin()),
            List.of(),
            new DimseCFindProperties(),
            properties,
            emptyDim(),
            new SimpleMeterRegistry(),
            null);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");

    DicomServiceException ex =
        assertThrows(
            DicomServiceException.class,
            () ->
                service.resolve(
                    CMoveService.STUDY_ROOT_MOVE_UID,
                    keys,
                    "DEST",
                    "CALLING",
                    "CALLED",
                    5,
                    () -> false));
    assertEquals(Status.IdentifierDoesNotMatchSOPClass, ex.getStatus());
  }

  @Test
  void rejectsSeriesLevelWithoutSeriesUid() {
    DimseCMoveProperties properties = new DimseCMoveProperties();
    properties.setDestinations(java.util.Map.of("DEST", destination("127.0.0.1", 11113, "DEST")));

    CMoveService service =
        new CMoveService(
            router(new DummyMovePlugin()),
            List.of(),
            new DimseCFindProperties(),
            properties,
            emptyDim(),
            new SimpleMeterRegistry(),
            null);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "SERIES");
    keys.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");

    DicomServiceException ex =
        assertThrows(
            DicomServiceException.class,
            () ->
                service.resolve(
                    CMoveService.STUDY_ROOT_MOVE_UID,
                    keys,
                    "DEST",
                    "CALLING",
                    "CALLED",
                    6,
                    () -> false));
    assertEquals(Status.IdentifierDoesNotMatchSOPClass, ex.getStatus());
  }

  @Test
  void deniesWhenPolicyBlocksRequest() {
    DimseCMoveProperties properties = new DimseCMoveProperties();
    properties.setDestinations(java.util.Map.of("DEST", destination("127.0.0.1", 11113, "DEST")));

    DimseAccessPolicy<QueryMoveService.MoveRequest> deny =
        request -> DimseAccessPolicy.Decision.deny("blocked");

    CMoveService service =
        new CMoveService(
            router(new DummyMovePlugin()),
            List.of(deny),
            new DimseCFindProperties(),
            properties,
            emptyDim(),
            new SimpleMeterRegistry(),
            null);

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");

    DicomServiceException ex =
        assertThrows(
            DicomServiceException.class,
            () ->
                service.resolve(
                    CMoveService.STUDY_ROOT_MOVE_UID,
                    keys,
                    "DEST",
                    "CALLING",
                    "CALLED",
                    4,
                    () -> false));
    assertEquals(Status.UnableToProcess, ex.getStatus());
  }

  private static DimseCMoveProperties.Destination destination(String host, int port, String ae) {
    DimseCMoveProperties.Destination d = new DimseCMoveProperties.Destination();
    d.setHost(host);
    d.setPort(port);
    d.setAeTitle(ae);
    return d;
  }

  private static QueryRouter router(QueryMoveService... plugins) {
    return new QueryRouter(List.of(), List.of(plugins), 2, 1000);
  }

  private static final class DummyMovePlugin implements QueryMoveService {

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("dummy-move", "Dummy Move", "1.0.0", "query-index");
    }

    @Override
    public List<MoveCandidate> resolve(MoveRequest request) throws IOException {
      return List.of(
          new MoveCandidate("1.2.840.10008.5.1.4.1.1.7", "1.2.3", URI.create("file:/tmp/one.dcm")));
    }
  }

  private static final class MultiMovePlugin implements QueryMoveService {

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("multi-move", "Multi Move", "1.0.0", "query-index");
    }

    @Override
    public List<MoveCandidate> resolve(MoveRequest request) throws IOException {
      return List.of(
          new MoveCandidate("1.2.840.10008.5.1.4.1.1.7", "1.2.3", URI.create("file:/tmp/one.dcm")),
          new MoveCandidate("1.2.840.10008.5.1.4.1.1.7", "1.2.4", URI.create("file:/tmp/two.dcm")));
    }
  }
}
