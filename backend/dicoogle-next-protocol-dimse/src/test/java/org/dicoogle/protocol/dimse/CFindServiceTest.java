package org.dicoogle.protocol.dimse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Set;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dcm4che3.net.QueryOption;
import org.dcm4che3.net.Status;
import org.dcm4che3.net.service.DicomServiceException;
import org.dicoogle.core.query.QueryRouter;
import org.dicoogle.sdk.PluginMetadata;
import org.dicoogle.sdk.query.DimseAccessPolicy;
import org.dicoogle.sdk.query.QueryService;
import org.junit.jupiter.api.Test;

class CFindServiceTest {

  private static DimseProperties emptyDim() {
    DimseProperties p = new DimseProperties();
    p.setDimProviders(List.of());
    return p;
  }

  @Test
  void failsWhenQueryLevelMissing() {
    CFindService service =
        new CFindService(
            router(new DummyFindPlugin()),
            List.<DimseAccessPolicy<QueryService.QueryRequest>>of(),
            new DimseCFindProperties(),
            emptyDim(),
            new SimpleMeterRegistry());
    Attributes keys = new Attributes();

    DicomServiceException ex =
        assertThrows(
            DicomServiceException.class,
            () -> service.find("1.2.840.10008.5.1.4.1.2.2.1", keys, "A", "B", 10, Set.of(), null));
    assertEquals(Status.IdentifierDoesNotMatchSOPClass, ex.getStatus());
  }

  @Test
  void supportsFreeTextAndLevel() throws Exception {
    CFindService service =
        new CFindService(
            router(new DummyFindPlugin()),
            List.<DimseAccessPolicy<QueryService.QueryRequest>>of(),
            new DimseCFindProperties(),
            emptyDim(),
            new SimpleMeterRegistry());
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");
    keys.setString(Tag.AccessionNumber, VR.SH, "brain");

    List<Attributes> matches =
        service.find("1.2.840.10008.5.1.4.1.2.2.1", keys, "CALLING", "CALLED", 77, Set.of(), null);

    assertEquals(1, matches.size());
    assertEquals("1.2.3", matches.get(0).getString(Tag.StudyInstanceUID));
  }

  @Test
  void rejectsDateTimeRangeWithoutNegotiation() {
    CFindService service =
        new CFindService(
            router(new DummyFindPlugin()),
            List.<DimseAccessPolicy<QueryService.QueryRequest>>of(),
            new DimseCFindProperties(),
            emptyDim(),
            new SimpleMeterRegistry());
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.AcquisitionDateTime, VR.DT, "20240101000000-20241231235959");

    DicomServiceException ex =
        assertThrows(
            DicomServiceException.class,
            () ->
                service.find(
                    "1.2.840.10008.5.1.4.1.2.2.1", keys, "CALLING", "CALLED", 90, Set.of(), null));
    assertEquals(Status.IdentifierDoesNotMatchSOPClass, ex.getStatus());
  }

  @Test
  void rejectsInvalidRangeSyntax() {
    CFindService service =
        new CFindService(
            router(new DummyFindPlugin()),
            List.<DimseAccessPolicy<QueryService.QueryRequest>>of(),
            new DimseCFindProperties(),
            emptyDim(),
            new SimpleMeterRegistry());
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyDate, VR.DA, "-");

    DicomServiceException ex =
        assertThrows(
            DicomServiceException.class,
            () ->
                service.find(
                    "1.2.840.10008.5.1.4.1.2.2.1", keys, "CALLING", "CALLED", 91, Set.of(), null));
    assertEquals(Status.IdentifierDoesNotMatchSOPClass, ex.getStatus());
  }

  @Test
  void acceptsDateTimeRangeWithNegotiation() throws Exception {
    CFindService service =
        new CFindService(
            router(new DummyFindPlugin()),
            List.<DimseAccessPolicy<QueryService.QueryRequest>>of(),
            new DimseCFindProperties(),
            emptyDim(),
            new SimpleMeterRegistry());
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.AcquisitionDateTime, VR.DT, "20240101000000-20241231235959");

    List<Attributes> matches =
        service.find(
            "1.2.840.10008.5.1.4.1.2.2.1",
            keys,
            "CALLING",
            "CALLED",
            92,
            Set.of(QueryOption.DATETIME),
            null);
    assertEquals(1, matches.size());
  }

  @Test
  void appliesConfiguredMaxResults() throws Exception {
    DimseCFindProperties properties = new DimseCFindProperties();
    properties.setMaxResults(1);
    CFindService service =
        new CFindService(
            router(new MultiResultFindPlugin()),
            List.<DimseAccessPolicy<QueryService.QueryRequest>>of(),
            properties,
            emptyDim(),
            new SimpleMeterRegistry());

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");

    List<Attributes> matches =
        service.find("1.2.840.10008.5.1.4.1.2.2.1", keys, "CALLING", "CALLED", 88, Set.of(), null);
    assertEquals(1, matches.size());
  }

  @Test
  void deniesQueryWhenPolicyRejects() {
    DimseAccessPolicy<QueryService.QueryRequest> denyPolicy =
        request -> DimseAccessPolicy.Decision.deny("denied by policy");
    CFindService service =
        new CFindService(
            router(new DummyFindPlugin()),
            List.of(denyPolicy),
            new DimseCFindProperties(),
            emptyDim(),
            new SimpleMeterRegistry());

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");

    DicomServiceException ex =
        assertThrows(
            DicomServiceException.class,
            () ->
                service.find(
                    "1.2.840.10008.5.1.4.1.2.2.1", keys, "CALLING", "CALLED", 99, Set.of(), null));
    assertEquals(Status.UnableToProcess, ex.getStatus());
  }

  private static QueryRouter router(QueryService... plugins) {
    return new QueryRouter(List.of(plugins), List.of(), 2, 1000);
  }

  private static final class DummyFindPlugin implements QueryService {

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("dummy-find", "Dummy Find", "1.0.0", "query-index");
    }

    @Override
    public List<QueryResult> query(QueryRequest request) throws IOException {
      Attributes a = new Attributes();
      a.setString(
          Tag.StudyInstanceUID, VR.UI, request.keys().getString(Tag.StudyInstanceUID, "1.2.3"));
      a.setString(Tag.QueryRetrieveLevel, VR.CS, request.level().name());
      return List.of(new QueryResult(a, URI.create("file:///dummy")));
    }
  }

  private static final class MultiResultFindPlugin implements QueryService {

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("multi-find", "Multi Find", "1.0.0", "query-index");
    }

    @Override
    public List<QueryResult> query(QueryRequest request) throws IOException {
      Attributes a1 = new Attributes();
      a1.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");
      Attributes a2 = new Attributes();
      a2.setString(Tag.StudyInstanceUID, VR.UI, "1.2.4");
      return List.of(
          new QueryResult(a1, URI.create("file:///dummy")),
          new QueryResult(a2, URI.create("file:///dummy")));
    }
  }
}
