package org.dicoogle.protocol.dimse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.util.List;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dcm4che3.net.Status;
import org.dcm4che3.net.service.DicomServiceException;
import org.dicoogle.sdk.PluginMetadata;
import org.dicoogle.sdk.query.DimseFindServicePlugin;
import org.junit.jupiter.api.Test;

class CFindServiceTest {

  @Test
  void failsWhenQueryLevelMissing() {
    CFindService service =
        new CFindService(List.of(new DummyFindPlugin()), new DimseCFindProperties());
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
        new CFindService(List.of(new DummyFindPlugin()), new DimseCFindProperties());
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");
    keys.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");
    keys.setString(Tag.AccessionNumber, VR.SH, "brain");

    List<Attributes> matches =
        service.find("1.2.840.10008.5.1.4.1.2.2.1", keys, "CALLING", "CALLED", 77);

    assertEquals(1, matches.size());
    assertEquals("1.2.3", matches.get(0).getString(Tag.StudyInstanceUID));
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
}
