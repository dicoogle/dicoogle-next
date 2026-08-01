# Legacy Proxy

The legacy proxy allows dicoogle-next to coexist with a legacy Dicoogle v3 instance, forwarding operations that the new backend does not handle locally to the old server. This enables incremental migration: you can run both backends side by side, gradually moving functionality to dicoogle-next while the legacy instance still handles the rest.

## How It Works

When enabled, dicoogle-next inspects each incoming operation and decides whether to handle it locally (via its own plugins) or forward it to the legacy Dicoogle instance over HTTP. The decision is controlled by two independent mode flags — one for storage/retrieve operations and one for query/index operations.

The proxy also acts as a catch-all for unmapped HTTP routes. Any request that reaches Spring MVC without a handler (404 `NoResourceFoundException`) is transparently forwarded to legacy Dicoogle via `LegacyProxyExceptionResolver`, making dicoogle-next a superset of legacy for paths not yet reimplemented.

## Module Structure

The proxy lives in the `dicoogle-next-protocol-legacy-proxy` module:

```
dicoogle-next-protocol-legacy-proxy/
└── src/main/java/org/dicoogle/protocol/legacyproxy/
    ├── config/
    │   ├── LegacyProxyProperties.java   # Configuration binding (dicoogle.legacy-proxy.*)
    │   └── LegacyProxyConfig.java       # WebClient bean, @ConditionalOnProperty
    ├── LegacyProxyService.java          # HTTP forwarding (search, storage, index, generic)
    ├── LegacyProxyAuthService.java      # JWT auth with legacy /login endpoint
    ├── LegacyProxyExceptionResolver.java # Catch-all 404 → legacy fallback
    └── LegacyProxyAuthException.java    # Auth failure exception
```

All beans are conditional — when `dicoogle.legacy-proxy.enabled=false`, no proxy beans are created and the system degrades cleanly. Service classes that use the proxy annotate the dependency with `@Autowired(required = false)` and null-check before use.

## Configuration

All properties live under `dicoogle.legacy-proxy` in `application.yml`:

```yaml
dicoogle:
  legacy-proxy:
    enabled: false                   # master switch (default: false)
    base-url: http://localhost:8080  # legacy Dicoogle HTTP root
    timeout: 30s                     # connect + response timeout
    storage-retrieve-mode: AUTO      # routing for C-STORE / C-MOVE
    query-index-mode: AUTO           # routing for C-FIND / HTTP /search / HTTP /index
    auth:
      username: dicoogle             # credentials for legacy POST /login
      password: dicoogle
```

Or via CLI flags:

```bash
--dicoogle.legacy-proxy.enabled=true
--dicoogle.legacy-proxy.base-url=http://legacy:8080
--dicoogle.legacy-proxy.storage-retrieve-mode=AUTO
--dicoogle.legacy-proxy.query-index-mode=AUTO
--dicoogle.legacy-proxy.auth.username=dicoogle
--dicoogle.legacy-proxy.auth.password=dicoogle
```

### Mode Flags

Two independent enums control routing per domain group:

| Mode | Behavior |
|------|----------|
| `AUTO` | Use local plugin if present, fallback to legacy if missing. **Default.** |
| `LEGACY` | Always route to legacy Dicoogle. |
| `NEW` | Always use local plugins. Fails if no local plugin is available. |

**`storage-retrieve-mode`** governs:

- DICOM C-STORE (receiving studies)
- DICOM C-MOVE (sending studies to a move destination)
- HTTP `POST /storage` (storing raw DICOM bytes)
- HTTP `GET /storage` (retrieving raw DICOM files)

**`query-index-mode`** governs:

- DICOM C-FIND (querying studies/series/instances)
- HTTP `GET /search` (querying the index)
- HTTP `POST /system/index/index` (triggering reindex)

### Routing Decision Logic

```
shouldUseLegacy(hasLocalPlugin):
  enabled=false          → false (never proxy)
  mode=LEGACY            → true  (always proxy)
  mode=NEW               → false (always local, fail if missing)
  mode=AUTO              → !hasLocalPlugin
```

## Authentication

The proxy authenticates with legacy Dicoogle via `POST /login` using form-encoded credentials (`username` + `password`). The returned JWT token is cached in memory and attached as a `Bearer` header on every forwarded request.

If a 401 or 403 is received from legacy, the proxy automatically re-authenticates and retries the request once. Hop-by-hop headers (`connection`, `keep-alive`, `transfer-encoding`, etc.) are stripped from forwarded requests per RFC 7230.

## Proxied Endpoints

The proxy handles these legacy Dicoogle endpoints:

| Operation | Legacy endpoint | New backend method |
|-----------|----------------|-------------------|
| Search/query | `GET /search?query=...&psize=...&field=...` | `LegacyProxyService.searchQuery()` |
| Store DICOM | `POST /storage?scheme=file` (octet-stream body) | `LegacyProxyService.postStorage()` |
| Retrieve file | `GET /storage?uri=...` | `LegacyProxyService.getFile()` |
| Trigger index | `POST /management/tasks/index?uri=...` | `LegacyProxyService.postIndex()` |
| Catch-all 404 | Any unmatched path | `LegacyProxyExceptionResolver` → `forward()` |

## Disabling the Proxy

To run dicoogle-next standalone (no legacy fallback):

```yaml
dicoogle:
  legacy-proxy:
    enabled: false
```

Or:

```bash
--dicoogle.legacy-proxy.enabled=false
```

When disabled:

- The `LegacyProxyConfig` bean is not created (`@ConditionalOnProperty`).
- `LegacyProxyService`, `LegacyProxyAuthService`, and `LegacyProxyExceptionResolver` are not instantiated.
- Service classes that optionally depend on the proxy (e.g., storage, query services) use `@Autowired(required = false)` with null-checks, so the system degrades cleanly without NPEs.
- All requests are handled exclusively by local plugins. If a local plugin is not available for an operation, it fails rather than falling back.

## Running with Docker

Both backends can run side by side using Docker Compose. The new backend connects to the legacy instance via its container hostname (`legacy`) over the Docker network.

### docker-compose.yml

```yaml
services:
  legacy:
    build:
      context: .
      dockerfile: Dockerfile.legacy
    container_name: dicoogle-legacy
    ports:
      - "8080:8080"    # legacy HTTP API
      - "1045:1045"    # legacy DICOM query-retrieve
      - "6666:6666"    # legacy DICOM storage SCP
    volumes:
      - dicoogle-storage:/dicoogle-storage
      - dicoogle-staging:/dicoogle-staging

  next:
    build:
      context: .
      dockerfile: Dockerfile.next
    container_name: dicoogle-next
    depends_on:
      - legacy
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "8082:8082"    # new backend HTTP API (context-path /api)
      - "11113:11113"  # new backend DIMSE C-STORE SCP
      - "11114:11114"  # new backend DIMSE query-retrieve
    volumes:
      - dicoogle-storage:/dicoogle-storage
      - dicoogle-staging:/dicoogle-staging

volumes:
  dicoogle-storage:
  dicoogle-staging:
```

### Dockerfile.legacy

```dockerfile
FROM eclipse-temurin:8-jre
WORKDIR /root
COPY dicoogle.jar .
COPY Plugins/ Plugins/
CMD ["java", "-jar", "dicoogle.jar", "-s"]
```

The legacy container runs Dicoogle v3 with its bundled plugins (`filestorage-3.5.1.jar`, `lucene-3.5.1.jar`) and settings under `Plugins/settings/`.

### Dockerfile.next

```dockerfile
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY dicoogle-next-0.0.1-SNAPSHOT.jar app.jar
CMD java -jar app.jar
```

Configuration is done via `application.yml` (or `application-dev.yml` for the dev profile). Copy your customized YAML into the image or mount it at runtime:

```bash
# Option A: mount at runtime
docker compose run -v ./my-application.yml:/app/config/application.yml next

# Option B: bake into the image (add to Dockerfile)
# COPY application.yml config/application.yml
```

The key properties to configure for proxy mode:

```yaml
# application.yml
dicoogle:
  legacy-proxy:
    enabled: true
    base-url: http://legacy:8080    # Docker DNS name for the legacy container
    storage-retrieve-mode: AUTO
    query-index-mode: AUTO
    auth:
      username: dicoogle
      password: dicoogle

app:
  dimse:
    cstore:
      enabled: true
      port: 11113
      bind-address: 0.0.0.0
    query-retrieve:
      enabled: true
      port: 11114
      bind-address: 0.0.0.0
    cmove:
      destinations:
        LEGACYSCP:
          host: legacy
          port: 6666
          ae-title: DICOOGLE
  storage:
    file-rw:
      enabled: false     # disable local storage → forces legacy fallback
      root-dir: /dicoogle-storage
  query:
    lucene:
      enabled: false     # disable local query → forces legacy fallback
```

To use local plugins instead, set `enabled: true` on the relevant plugins and change the mode to `NEW`.

### Building and Running

```bash
# Build the new backend fat JAR
cd backend
mvn clean package -DskipTests

# Start both containers (adjust paths to your docker-compose.yml)
docker compose up --build -d

# Wait for startup
docker compose logs -f next  # look for "Started DicoogleNextApplication"

# Verify
curl http://localhost:8082/api/system/ping
curl http://localhost:8080/search?query=*   # legacy
```

### Port Summary

| Service | Host port | Container port | Protocol | Purpose |
|---------|-----------|---------------|----------|---------|
| Legacy HTTP | 8080 | 8080 | HTTP | REST API (login, search, storage, index) |
| Legacy DICOM QR | 1045 | 1045 | DICOM | Query-Retrieve (exposed, not used in proxy) |
| Legacy DICOM SCP | 6666 | 6666 | DICOM | C-MOVE destination |
| Next HTTP | 8082 | 8082 | HTTP | REST API (context-path `/api`) |
| Next DIMSE C-STORE | 11113 | 11113 | DICOM | Receives C-STORE requests |
| Next DIMSE QR | 11114 | 11114 | DICOM | C-FIND, C-MOVE |

### Shared Storage Volume

Both containers share Docker named volumes for DICOM data:

| Volume | Mount path | Purpose |
|--------|-----------|---------|
| `dicoogle-storage` | `/dicoogle-storage` | Main DICOM file storage (both read/write) |
| `dicoogle-staging` | `/dicoogle-staging` | Staging area for test DICOM files |

| Container | Storage root | Configured via |
|-----------|-------------|---------------|
| legacy | `/dicoogle-storage` | `Plugins/settings/file-storage.xml` → `root-dir` |
| next | `/dicoogle-storage` | `--app.storage.file-rw.root-dir=/dicoogle-storage` |

This allows mixed-mode deployments (e.g., storage on legacy, query on new) to access the same files on disk.


