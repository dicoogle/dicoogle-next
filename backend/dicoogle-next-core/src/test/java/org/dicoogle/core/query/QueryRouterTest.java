package org.dicoogle.core.query;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Map;
import org.dcm4che3.data.Attributes;
import org.dcm4che3.data.Tag;
import org.dcm4che3.data.VR;
import org.dicoogle.sdk.PluginMetadata;
import org.dicoogle.sdk.query.QueryMoveService;
import org.dicoogle.sdk.query.QueryRetrieveLevel;
import org.dicoogle.sdk.query.QueryService;
import org.junit.jupiter.api.Test;

class QueryRouterTest {

  private static final PluginMetadata META_A =
      new PluginMetadata("query-a", "Plugin A", "0.1.0", "query-index");
  private static final PluginMetadata META_B =
      new PluginMetadata("query-b", "Plugin B", "0.1.0", "query-index");
  private static final PluginMetadata META_MOVE =
      new PluginMetadata("query-move", "Move Plugin", "0.1.0", "query-index");

  private static final URI URI_1 = URI.create("file:///inst1.dcm");
  private static final URI URI_2 = URI.create("file:///inst2.dcm");
  private static final URI URI_3 = URI.create("file:///inst3.dcm");
  private static final QueryService.QueryRequest REQ =
      new QueryService.QueryRequest(
          QueryService.InformationModel.STUDY_ROOT,
          QueryRetrieveLevel.IMAGE,
          "CALLING",
          "CALLED",
          1,
          new Attributes(),
          null,
          Map.of(),
          false,
          false,
          () -> false);

  private static Attributes attrs(String study, String series, String sop) {
    Attributes a = new Attributes();
    a.setString(Tag.StudyInstanceUID, VR.UI, study);
    a.setString(Tag.SeriesInstanceUID, VR.UI, series);
    a.setString(Tag.SOPInstanceUID, VR.UI, sop);
    return a;
  }

  private static QueryService stubQuery(String id, List<QueryService.QueryResult> results) {
    return new QueryService() {
      @Override
      public PluginMetadata metadata() {
        return new PluginMetadata(id, id, "0.1.0", "query-index");
      }

      @Override
      public List<QueryResult> query(QueryRequest request) {
        return results;
      }
    };
  }

  private static QueryService stubQueryThrowing(String id) {
    return new QueryService() {
      @Override
      public PluginMetadata metadata() {
        return new PluginMetadata(id, id, "0.1.0", "query-index");
      }

      @Override
      public List<QueryResult> query(QueryRequest request) throws IOException {
        throw new IOException("simulated failure");
      }
    };
  }

  private static QueryMoveService stubMove(
      String id, List<QueryMoveService.MoveCandidate> results) {
    return new QueryMoveService() {
      @Override
      public PluginMetadata metadata() {
        return new PluginMetadata(id, id, "0.1.0", "query-index");
      }

      @Override
      public List<MoveCandidate> resolve(MoveRequest request) {
        return results;
      }
    };
  }

  @Test
  void emptyProvidersReturnsEmpty() {
    var router = new QueryRouter(List.of(), List.of(), 4, 100);
    assertTrue(router.query(REQ, List.of()).isEmpty());
    assertTrue(router.queryAll(REQ).isEmpty());
    router.shutdown();
  }

  @Test
  void singleProviderReturnsResults() {
    var result = new QueryService.QueryResult(attrs("1", "2", "3"), URI_1);
    var plugin = stubQuery("query-a", List.of(result));
    var router = new QueryRouter(List.of(plugin), List.of(), 4, 100);

    var out = router.query(REQ, List.of("query-a"));
    assertEquals(1, out.size());
    assertEquals(URI_1, out.getFirst().storageUri());
    router.shutdown();
  }

  @Test
  void queryAllDispatchesToEveryProvider() {
    var r1 = new QueryService.QueryResult(attrs("1", "2", "3"), URI_1);
    var r2 = new QueryService.QueryResult(attrs("4", "5", "6"), URI_2);
    var pA = stubQuery("query-a", List.of(r1));
    var pB = stubQuery("query-b", List.of(r2));
    var router = new QueryRouter(List.of(pA, pB), List.of(), 4, 100);

    var out = router.queryAll(REQ);
    assertEquals(2, out.size());
    router.shutdown();
  }

  @Test
  void dedupByUid() {
    var dup = new QueryService.QueryResult(attrs("S", "S", "I"), URI_1);
    var pA = stubQuery("query-a", List.of(dup));
    var pB = stubQuery("query-b", List.of(dup));
    var router = new QueryRouter(List.of(pA, pB), List.of(), 4, 100);

    var out = router.queryAll(REQ);
    assertEquals(1, out.size());
    router.shutdown();
  }

  @Test
  void dedupFallsBackToStorageUri() {
    var blank = new Attributes();
    var dup = new QueryService.QueryResult(blank, URI_1);
    var pA = stubQuery("query-a", List.of(dup));
    var pB = stubQuery("query-b", List.of(dup));
    var router = new QueryRouter(List.of(pA, pB), List.of(), 4, 100);

    var out = router.queryAll(REQ);
    assertEquals(1, out.size());
    router.shutdown();
  }

  @Test
  void distinctUidsFromDifferentProvidersAreBothReturned() {
    var rA = new QueryService.QueryResult(attrs("S1", "S1", "I1"), URI_1);
    var rB = new QueryService.QueryResult(attrs("S2", "S2", "I2"), URI_2);
    var pA = stubQuery("query-a", List.of(rA));
    var pB = stubQuery("query-b", List.of(rB));
    var router = new QueryRouter(List.of(pA, pB), List.of(), 4, 100);

    var out = router.queryAll(REQ);
    assertEquals(2, out.size());
    router.shutdown();
  }

  @Test
  void maxResultsRespected() {
    var r1 = new QueryService.QueryResult(attrs("1", "1", "1"), URI_1);
    var r2 = new QueryService.QueryResult(attrs("2", "2", "2"), URI_2);
    var r3 = new QueryService.QueryResult(attrs("3", "3", "3"), URI_3);
    var pA = stubQuery("query-a", List.of(r1, r2, r3));
    var router = new QueryRouter(List.of(pA), List.of(), 4, 1);

    var out = router.queryAll(REQ);
    assertEquals(1, out.size());
    router.shutdown();
  }

  @Test
  void errorIsolation() {
    var rA = new QueryService.QueryResult(attrs("1", "2", "3"), URI_1);
    var pGood = stubQuery("query-a", List.of(rA));
    var pBad = stubQueryThrowing("query-b");
    var router = new QueryRouter(List.of(pGood, pBad), List.of(), 4, 100);

    var out = router.queryAll(REQ);
    assertEquals(1, out.size());
    assertEquals(URI_1, out.getFirst().storageUri());
    router.shutdown();
  }

  @Test
  void emptyProviderNamesQueriesAll() {
    var rA = new QueryService.QueryResult(attrs("1", "2", "3"), URI_1);
    var pA = stubQuery("query-a", List.of(rA));
    var router = new QueryRouter(List.of(pA), List.of(), 4, 100);

    var out = router.query(REQ, List.of());
    assertEquals(1, out.size());
    router.shutdown();
  }

  @Test
  void nullProviderNamesQueriesAll() {
    var rA = new QueryService.QueryResult(attrs("1", "2", "3"), URI_1);
    var pA = stubQuery("query-a", List.of(rA));
    var router = new QueryRouter(List.of(pA), List.of(), 4, 100);

    var out = router.query(REQ, null);
    assertEquals(1, out.size());
    router.shutdown();
  }

  @Test
  void unknownProviderNameIsSilentlySkipped() {
    var rA = new QueryService.QueryResult(attrs("1", "2", "3"), URI_1);
    var pA = stubQuery("query-a", List.of(rA));
    var router = new QueryRouter(List.of(pA), List.of(), 4, 100);

    var out = router.query(REQ, List.of("nonexistent"));
    assertTrue(out.isEmpty());
    router.shutdown();
  }

  @Test
  void mixedKnownAndUnknownProviderNames() {
    var rA = new QueryService.QueryResult(attrs("1", "2", "3"), URI_1);
    var pA = stubQuery("query-a", List.of(rA));
    var router = new QueryRouter(List.of(pA), List.of(), 4, 100);

    var out = router.query(REQ, List.of("query-a", "nonexistent"));
    assertEquals(1, out.size());
    router.shutdown();
  }

  @Test
  void moveResolutionDispatchesAndDeduplicates() {
    var mc = new QueryMoveService.MoveCandidate("1.2.3", "1.2.3.4", URI_1);
    var pMove = stubMove("query-move", List.of(mc));
    var router = new QueryRouter(List.of(), List.of(pMove), 4, 100);

    var req =
        new QueryMoveService.MoveRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.IMAGE,
            "CALLING",
            "CALLED",
            "DEST",
            1,
            new Attributes(),
            () -> false);

    var out = router.resolve(req, List.of("query-move"));
    assertEquals(1, out.size());
    assertEquals(URI_1, out.getFirst().location());
    router.shutdown();
  }

  @Test
  void resolveAllReturnsFromAllMoveProviders() {
    var mc1 = new QueryMoveService.MoveCandidate("1.2.3", "1.2.3.4", URI_1);
    var mc2 = new QueryMoveService.MoveCandidate("4.5.6", "4.5.6.7", URI_2);
    var pA = stubMove("move-a", List.of(mc1));
    var pB = stubMove("move-b", List.of(mc2));
    var router = new QueryRouter(List.of(), List.of(pA, pB), 4, 100);

    var req =
        new QueryMoveService.MoveRequest(
            QueryService.InformationModel.STUDY_ROOT,
            QueryRetrieveLevel.IMAGE,
            "CALLING",
            "CALLED",
            "DEST",
            1,
            new Attributes(),
            () -> false);

    var out = router.resolveAll(req);
    assertEquals(2, out.size());
    router.shutdown();
  }
}
