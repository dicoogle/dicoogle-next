package org.dicoogle.protocol.dimse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.IOException;
import java.util.List;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dcm4che3.net.Status;
import org.dcm4che3.net.service.DicomServiceException;
import org.dicoogle.sdk.PluginMetadata;
import org.dicoogle.sdk.query.DimseFindAccessPolicy;
import org.dicoogle.sdk.query.DimseFindServicePlugin;
import org.junit.jupiter.api.Test;

class CFindServiceTest {

  @Test
  void failsWhenQueryLevelMissing() {
    CFindService service =
        new CFindService(
            List.of(new DummyFindPlugin()),
            List.<DimseFindAccessPolicy>of(),
            new DimseCFindProperties(),
            new SimpleMeterRegistry());
    Attributes keys = new Attributes();

    DicomServiceException ex =
        assertThrows(
            DicomServiceException.class,
            () -> service.find("1.2.840.10008.5.1.4.1.2.2.1", keys, "A", "B", 10));
    assertEquals(Status.IdentifierDoesNotMatchSOPClass, ex.getStatus());
  }

  @Test
  void supportsFreeTextAndLevel() throws Exception {
    CFindService service =
        new CFindService(
            List.of(new DummyFindPlugin()),
            List.<DimseFindAccessPolicy>of(),
            new DimseCFindProperties(),
            new SimpleMeterRegistry());
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");
    keys.setString(Tag.AccessionNumber, VR.SH, "brain");

    List<Attributes> matches =
        service.find("1.2.840.10008.5.1.4.1.2.2.1", keys, "CALLING", "CALLED", 77);

    assertEquals(1, matches.size());
    assertEquals("1.2.3", matches.get(0).getString(Tag.StudyInstanceUID));
  }

  @Test
  void appliesConfiguredMaxResults() throws Exception {
    DimseCFindProperties properties = new DimseCFindProperties();
    properties.setMaxResults(1);
    CFindService service =
        new CFindService(
            List.of(new MultiResultFindPlugin()),
            List.<DimseFindAccessPolicy>of(),
            properties,
            new SimpleMeterRegistry());

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");

    List<Attributes> matches =
        service.find("1.2.840.10008.5.1.4.1.2.2.1", keys, "CALLING", "CALLED", 88);
    assertEquals(1, matches.size());
  }

  @Test
  void deniesQueryWhenPolicyRejects() {
    DimseFindAccessPolicy denyPolicy =
        new DimseFindAccessPolicy() {
          @Override
          public org.dicoogle.sdk.PluginMetadata metadata() {
            return new org.dicoogle.sdk.PluginMetadata(
                "deny-cfind", "Deny C-FIND", "1.0.0", "query-index");
          }

          @Override
          public Decision evaluate(DimseFindServicePlugin.FindRequest request) {
            return Decision.deny("denied by policy");
          }
        };
    CFindService service =
        new CFindService(
            List.of(new DummyFindPlugin()),
            List.of(denyPolicy),
            new DimseCFindProperties(),
            new SimpleMeterRegistry());

    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");

    DicomServiceException ex =
        assertThrows(
            DicomServiceException.class,
            () -> service.find("1.2.840.10008.5.1.4.1.2.2.1", keys, "CALLING", "CALLED", 99));
    assertEquals(Status.UnableToProcess, ex.getStatus());
  }

  private static final class DummyFindPlugin implements DimseFindServicePlugin {

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("dummy-find", "Dummy Find", "1.0.0", "query-index");
    }

    @Override
    public List<Attributes> find(FindRequest request) throws IOException {
      Attributes a = new Attributes();
      a.setString(
          Tag.StudyInstanceUID, VR.UI, request.keys().getString(Tag.StudyInstanceUID, "1.2.3"));
      a.setString(Tag.QueryRetrieveLevel, VR.CS, request.level().name());
      return List.of(a);
    }
  }

  private static final class MultiResultFindPlugin implements DimseFindServicePlugin {

    @Override
    public PluginMetadata metadata() {
      return new PluginMetadata("multi-find", "Multi Find", "1.0.0", "query-index");
    }

    @Override
    public List<Attributes> find(FindRequest request) throws IOException {
      Attributes a1 = new Attributes();
      a1.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");
      Attributes a2 = new Attributes();
      a2.setString(Tag.StudyInstanceUID, VR.UI, "1.2.4");
      return List.of(a1, a2);
    }
  }
}
