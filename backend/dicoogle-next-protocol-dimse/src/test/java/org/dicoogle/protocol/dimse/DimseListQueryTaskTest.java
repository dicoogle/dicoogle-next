package org.dicoogle.protocol.dimse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.lang.reflect.Field;
import java.util.List;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.junit.jupiter.api.Test;

class DimseListQueryTaskTest {

  @Test
  void onCancelRequestMarksTaskAsCanceled() throws Exception {
    Attributes rq = new Attributes();
    rq.setInt(Tag.MessageID, VR.US, 7);
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");

    Attributes match = new Attributes();
    match.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");

    DimseListQueryTask task = new DimseListQueryTask(null, null, rq, keys, List.of(match));

    task.onCancelRQ(null);

    Field canceledField = task.getClass().getSuperclass().getDeclaredField("canceled");
    canceledField.setAccessible(true);
    assertEquals(true, canceledField.getBoolean(task));
  }

  @Test
  void returnsProvidedMatchesInOrder() throws Exception {
    Attributes rq = new Attributes();
    rq.setInt(Tag.MessageID, VR.US, 9);
    Attributes keys = new Attributes();
    keys.setString(Tag.QueryRetrieveLevel, VR.CS, "STUDY");

    Attributes first = new Attributes();
    first.setString(Tag.StudyInstanceUID, VR.UI, "1.2.3");
    Attributes second = new Attributes();
    second.setString(Tag.StudyInstanceUID, VR.UI, "1.2.4");

    DimseListQueryTask task = new DimseListQueryTask(null, null, rq, keys, List.of(first, second));

    assertEquals(true, invokeHasMore(task));
    assertEquals("1.2.3", invokeNext(task).getString(Tag.StudyInstanceUID));
    assertEquals(true, invokeHasMore(task));
    assertEquals("1.2.4", invokeNext(task).getString(Tag.StudyInstanceUID));
    assertFalse(invokeHasMore(task));
  }

  private boolean invokeHasMore(DimseListQueryTask task) throws Exception {
    var method = DimseListQueryTask.class.getDeclaredMethod("hasMoreMatches");
    method.setAccessible(true);
    return (boolean) method.invoke(task);
  }

  private Attributes invokeNext(DimseListQueryTask task) throws Exception {
    var method = DimseListQueryTask.class.getDeclaredMethod("nextMatch");
    method.setAccessible(true);
    Attributes out = (Attributes) method.invoke(task);
    assertNotNull(out);
    return out;
  }
}
