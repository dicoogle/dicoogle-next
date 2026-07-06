# Dicoogle Next — Proxy Test Environment

## Prerequisites

- Docker and Docker Compose
- `dcmtk` tools: `storescu`, `findscu`, `movescu`, `storescp`, `dcmdump`
- Java 21 (for building the new backend fat JAR)
- A DICOM test file (default: `~/FELIX/IM-0001-0074...dcm`)
- `python3` (for JSON parsing in the test script)

## Directory Structure

```
docker-test/
├── README.md
├── docker-compose.yml
├── Dockerfile.legacy
├── Dockerfile.next              # overwritten by test-matrix.sh per test
├── dicoogle.jar                 # legacy Dicoogle v3 (branch 751)
├── dicoogle-next-0.0.1-SNAPSHOT.jar  # new backend fat JAR
├── test-matrix.sh               # full mode combination matrix test
└── Plugins/
    ├── filestorage-3.5.1.jar    # legacy file storage provider
    ├── lucene-3.5.1.jar         # legacy Lucene query/index provider
    └── settings/
        ├── file-storage.xml     # storage root: /dicoogle-storage (shared volume)
        └── luceneset.xml        # Lucene indexer config
```

### Shared Storage Volume

Both containers share a Docker named volume `dicoogle-storage` mounted at `/dicoogle-storage`. This allows mixed-mode deployments (e.g., storage on legacy, query on new) to access the same files.

| Container | Storage root | Source |
|-----------|-------------|--------|
| legacy | `/dicoogle-storage` | `file-storage.xml` → `root-dir` |
| next | `/dicoogle-storage` | `--app.storage.file-rw.root-dir` |

## Quick Start

### 1. Build the new backend fat JAR

```bash
cd /path/to/dicoogle-next/backend
mvn clean package -DskipTests
cp dicoogle-next/target/dicoogle-next-0.0.1-SNAPSHOT.jar docker-test/
```

### 2. Run the full test matrix

```bash
cd docker-test
chmod +x test-matrix.sh
./test-matrix.sh
```

This runs **5 mode combinations** in sequence, each testing C-STORE, C-FIND, C-MOVE, HTTP /search, and HTTP /system/index.

### 3. Run a single manual test

```bash
docker compose down
docker compose up --build -d
docker compose logs -f next  # wait for "Started DicoogleNextApplication"
```

Then in another terminal, run dcmtk commands (see [Manual Testing](#manual-testing) below).

## Credentials

### New Backend (HTTP API)

- **Username:** `dicoogle`
- **Password:** `dicoogle`
- Auth type: Bearer token (POST /login → JWT)

```bash
# Login
TOKEN=$(curl -s -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=dicoogle&password=dicoogle' \
  http://localhost:8082/api/login \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Use token
curl -H "Authorization: Bearer $TOKEN" http://localhost:8082/api/search?query=*
```

### Legacy Dicoogle

- **Username:** `dicoogle`
- **Password:** `dicoogle`
- Auth type: Form POST → JWT token

```bash
# Login
TOKEN=$(curl -s -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=dicoogle&password=dicoogle' \
  http://localhost:8080/login \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Use token
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/search?query=*
```

### Proxy-to-Legacy Auth (new backend → legacy)

When the new backend calls legacy endpoints, it authenticates automatically. The credentials are configured via:

```yaml
dicoogle:
  legacy-proxy:
    auth:
      username: dicoogle   # default in application.yml is "admin" — must match legacy
      password: dicoogle   # default in application.yml is "admin" — must match legacy
```

The test script overrides these to `dicoogle:dicoogle` via CLI flags.

## Ports

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| Legacy web API | `8080` | HTTP | REST endpoints (login, search, storage, index) |
| Legacy DICOM query-retrieve | `1045` | DICOM | (exposed, not used in tests) |
| Legacy DICOM storage SCP | `6666` | DICOM | C-MOVE destination |
| New backend web API | `8082` | HTTP | REST endpoints (context-path `/api`) |
| New backend DIMSE SCP | `11113` | DICOM | C-STORE, C-FIND, C-MOVE |

## Mode Flags

Two independent mode flags control routing for each domain group:

### `dicoogle.legacy-proxy.storage-retrieve-mode`

Controls **C-STORE** (storage) and **C-MOVE** (retrieval) routing.

| Value | Behavior |
|-------|----------|
| `AUTO` | Use local plugin if present, fallback to legacy if missing. **Default.** |
| `LEGACY` | Always route to legacy Dicoogle. |
| `NEW` | Always use local plugins. Fails if no local plugin available. |

### `dicoogle.legacy-proxy.query-index-mode`

Controls **C-FIND** (query), **HTTP /search**, and **HTTP /system/index** routing.

| Value | Behavior |
|-------|----------|
| `AUTO` | Use local plugin if present, fallback to legacy if missing. **Default.** |
| `LEGACY` | Always route to legacy Dicoogle. |
| `NEW` | Always use local plugins. Fails if no local plugin available. |

### Configuration

In `application.yml`:

```yaml
dicoogle:
  legacy-proxy:
    enabled: true
    storage-retrieve-mode: AUTO
    query-index-mode: AUTO
    base-url: http://localhost:8080
    timeout: 30s
    auth:
      username: dicoogle
      password: dicoogle
```

Or via CLI flags:

```bash
--dicoogle.legacy-proxy.enabled=true
--dicoogle.legacy-proxy.storage-retrieve-mode=LEGACY
--dicoogle.legacy-proxy.query-index-mode=NEW
--dicoogle.legacy-proxy.base-url=http://legacy:8080
--dicoogle.legacy-proxy.auth.username=dicoogle
--dicoogle.legacy-proxy.auth.password=dicoogle
```

## Mode Combination Matrix

The test script runs all 5 meaningful combinations:

| # | storage-retrieve | query-index | Plugins | What It Tests |
|---|-----------------|-------------|---------|---------------|
| 1 | LEGACY | LEGACY | both off | Everything routes to legacy |
| 2 | NEW | NEW | both on | Everything runs locally |
| 3 | LEGACY | NEW | storage off, query on | Storage to legacy, query local |
| 4 | NEW | LEGACY | storage on, query off | Storage local, query to legacy |
| 5 | AUTO | AUTO | both off | Auto-detect, all fallback to legacy |

## Manual Testing

### C-STORE

```bash
storescu -v -aet STORESCU -aec DICOOGLE localhost 11113 ~/FELIX/IM-0001-0074...dcm
```

Expected: `Received Store Response (Success)` in output.

After storing, trigger reindexing:

```bash
# Login first
TOKEN=$(curl -s -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=dicoogle&password=dicoogle' \
  http://localhost:8082/api/login \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Local reindex
curl -H "Authorization: Bearer $TOKEN" -X POST \
  -H 'Content-Type: application/json' \
  -d '{"uris":["file:///dicoogle-storage"]}' \
  http://localhost:8082/api/system/index/index

# Legacy reindex (needs JWT token)
curl -H "Authorization: Bearer $TOKEN" -X POST \
  'http://localhost:8080/management/tasks/index?uri=file:///dicoogle-storage'
```

### C-FIND

```bash
findscu -v -aet FINDSCU -aec DICOOGLE -S \
  -k QueryRetrieveLevel=STUDY \
  -k StudyInstanceUID=1.2.840.113745.101000.1008000.38446.6272.7138759 \
  localhost 11113
```

Expected: `Received Final Find Response (Success)` with 1 study found.

### C-MOVE

```bash
movescu -v -aet MOVESCU -aec DICOOGLE -S \
  -k QueryRetrieveLevel=STUDY \
  -k StudyInstanceUID=1.2.840.113745.101000.1008000.38446.6272.7138759 \
  -aem LEGACYSCP \
  localhost 11113
```

Move destination is configured via:

```bash
--app.dimse.cmove.destinations.LEGACYSCP.host=legacy
--app.dimse.cmove.destinations.LEGACYSCP.port=6666
--app.dimse.cmove.destinations.LEGACYSCP.ae-title=DICOOGLE
```

Expected: `Received Final Move Response (Success)`.

### HTTP Search

```bash
curl -H "Authorization: Bearer $TOKEN" 'http://localhost:8082/api/search?query=FELIX'
```

### HTTP Index Status

```bash
curl -H "Authorization: Bearer $TOKEN" 'http://localhost:8082/api/system/index/status'
```

### HTTP Trigger Reindex

```bash
curl -H "Authorization: Bearer $TOKEN" -X POST \
  -H 'Content-Type: application/json' \
  -d '{"uris":["file:///dicoogle-storage"]}' \
  'http://localhost:8082/api/system/index/index'
```

## Legacy Dicoogle Setup

### Branch

Use branch `751-expose-internal-provider-operations-in-the-web-api` (commit `8193069a`).

This branch adds the HTTP storage endpoints (`POST /storage`, `GET /storage`, `GET /storage/list`) required for the proxy.

### Running standalone (without Docker)

```bash
cd /path/to/dicoogle
git checkout 751-expose-internal-provider-operations-in-the-web-api
cd dicoogle
mvn package -DskipTests
java -jar target/dicoogle.jar -s
```

Make sure `Plugins/` directory contains `filestorage-3.6.0.jar` and `lucene-3.6.0.jar`.

### Storage

Files are stored in `/dicoogle-storage` (shared volume, configured in `Plugins/settings/file-storage.xml`).

After storing DICOM files, trigger reindexing so the Lucene plugin can find them:

```bash
# Login
TOKEN=$(curl -s -X POST -d 'username=dicoogle&password=dicoogle' http://localhost:8080/login \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Reindex
curl -H "Authorization: Bearer $TOKEN" -X POST \
  'http://localhost:8080/management/tasks/index?uri=file:///dicoogle-storage'
```

## Disabling the Proxy

To run the new backend standalone (no fallback to legacy):

```yaml
dicoogle:
  legacy-proxy:
    enabled: false
```

Or:

```bash
--dicoogle.legacy-proxy.enabled=false
```

The `LegacyProxyService` bean is not created when disabled (`@ConditionalOnProperty`). All service classes use `@Autowired(required = false)` with null-checks on `legacyProxyService`, so the system degrades cleanly without NPEs.
