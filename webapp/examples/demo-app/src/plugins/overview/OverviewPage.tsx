import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  dicoogleService,
  getAppConfig,
  pluginRegistry,
  useAuthStore,
  usePlugins,
  type SearchResult,
} from "@dicoogle/dicoogle-next-webapp";
import { onExportsChanged, recentExports } from "./exportsLog";

interface ServerInfo {
  version?: string;
  providers: string[];
  error?: string;
}

export function OverviewPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [archive, setArchive] = useState<SearchResult[] | null>(null);
  const plugins = usePlugins();
  const [server, setServer] = useState<ServerInfo>({ providers: [] });
  const [exports, setExports] = useState(recentExports);

  // Talk to Dicoogle Next through the same service the app uses.
  useEffect(() => {
    Promise.all([dicoogleService.getVersion(), dicoogleService.getQueryProviders()])
      .then(([version, providers]) => setServer({ version: version.version, providers }))
      .catch((error) => setServer({ providers: [], error: String(error?.message ?? error) }));
  }, []);

  // Run a query of our own: every indexed instance (fine for a demo archive, not a large one).
  useEffect(() => {
    dicoogleService
      .search({ query: "*:*" })
      .then((response) => setArchive(response.results))
      .catch(() => setArchive([]));
  }, []);

  // Exports announced by the CSV export package, collected by this plugin's init().
  useEffect(() => onExportsChanged(() => setExports(recentExports())), []);

  // Studies per modality: results are instances, so count each study once.
  const byModality = useMemo(() => {
    const studyModality = new Map<string, string>();
    for (const result of archive ?? []) {
      const uid = String(result.fields.StudyInstanceUID ?? result.uri);
      if (!studyModality.has(uid)) studyModality.set(uid, String(result.fields.Modality ?? "?"));
    }
    const counts = new Map<string, number>();
    for (const modality of studyModality.values()) {
      counts.set(modality, (counts.get(modality) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [archive]);
  const maxCount = byModality[0]?.[1] ?? 1;

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-muted-foreground">
          {getAppConfig().branding.appName} — everything on this page comes from demo plugins.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Server</CardTitle>
            <CardDescription>From dicoogleService</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {server.error ? (
              <p className="text-destructive">Could not reach the server: {server.error}</p>
            ) : (
              <>
                <Row label="Dicoogle Next version" value={server.version ?? "…"} />
                <Row label="Query providers" value={server.providers.join(", ") || "none"} />
              </>
            )}
            <Row label="Signed in as" value={`${user?.user ?? "?"}${user?.admin ? " (admin)" : ""}`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Studies by modality</CardTitle>
            <CardDescription>A query of its own through dicoogleService.search</CardDescription>
          </CardHeader>
          <CardContent>
            {archive === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : byModality.length === 0 ? (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Nothing indexed yet.</p>
                <Button size="sm" onClick={() => navigate("/search")}>Go to Search</Button>
              </div>
            ) : (
              <ul className="space-y-2">
                {byModality.map(([modality, count]) => (
                  <li key={modality} className="flex items-center gap-3 text-sm">
                    <span className="w-10 font-mono">{modality}</span>
                    <span
                      className="h-3 rounded bg-primary"
                      style={{ width: `${(count / maxCount) * 70}%` }}
                    />
                    <span className="text-muted-foreground">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plugins</CardTitle>
            <CardDescription>From the plugin registry</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {plugins.map((plugin) => {
                const id = plugin.metadata?.id ?? "?";
                const enabled = pluginRegistry.isPluginEnabled(id);
                return (
                  <li key={id} className="flex items-center justify-between py-2">
                    <span>
                      {plugin.metadata?.name}{" "}
                      <span className="text-muted-foreground">v{plugin.metadata?.version}</span>
                    </span>
                    <span className={enabled ? "text-success" : "text-muted-foreground"}>
                      {enabled ? "enabled" : "disabled"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent CSV exports</CardTitle>
            <CardDescription>Events from the CSV export plugin package</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {exports.length === 0 ? (
              <p className="text-muted-foreground">
                None yet. Run a search and use the &quot;Export CSV&quot; batch action.
              </p>
            ) : (
              <ul className="space-y-1">
                {exports.map((event) => (
                  <li key={event.at}>
                    <code>{event.filename}</code> — {event.count} studies
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
