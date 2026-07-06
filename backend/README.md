# Backend Quick Start

The backend now starts without an external database dependency.

## Build & Run

```bash
mvn install
java -jar dicoogle-next/target/dicoogle-next-0.0.1-SNAPSHOT.jar
```

Default profile is `dev`, which enables:

- DIMSE C-STORE on port `6666`
- DIMSE C-FIND/C-MOVE (Query-Retrieve) on port `1045`
- DIMSE C-ECHO verification available on both ports (Verification SOP class is always registered)
- Writable filesystem storage plugin (`file-rw`)
- Read-only filesystem fallback (`file-ro`)
- Startup validation requiring writable `file` scheme

DIMSE status (current):

- Implemented: C-ECHO, C-STORE, C-FIND (Study Root)
- Implemented: C-MOVE (Study Root)

DIMSE C-STORE currently uses a strict curated list of accepted transfer capabilities (SOP class +
transfer syntax combinations) under `app.dimse.cstore.accepted-transfer-capabilities`.
Incoming C-STORE payloads are normalized and persisted as PS3.10 DICOM files (with preamble and
file meta information).

You can change transfer capabilities at runtime via API:

- `GET /api/system/config/dimse/transfer-capabilities`
- `PUT /api/system/config/dimse/transfer-capabilities/{SOPClassUID}`
- `DELETE /api/system/config/dimse/transfer-capabilities/{SOPClassUID}`
- `POST /api/system/config/dimse/transfer-capabilities/replace`

C-FIND (Study Root) is always enabled when DIMSE server is enabled (`app.dimse.cstore.enabled=true`).
Supported query levels are `STUDY`, `SERIES`, and `IMAGE`.

C-MOVE (Study Root) uses destination AE aliases from
`app.dimse.cmove.destinations`.

Example destination config:

```yaml
app:
  dimse:
    cmove:
      destinations:
        DEST_AE:
          host: 127.0.0.1
          port: 11113
          ae-title: DEST_AE
```

Query behavior:

- Standard C-FIND keys are matched (`StudyInstanceUID`, `SeriesInstanceUID`, `SOPInstanceUID`,
  `PatientID`, `PatientName`, `Modality`, `StudyDescription`, `SeriesDescription`).
- Old Dicoogle-like free-text and `keyword:value` filters are accepted on the same endpoint.
- Mixed queries are supported (for example: free text + strict DICOM keys together).
- Broad queries without UIDs are supported by scanning indexed instances and filtering in-memory.
- Response size is capped by `app.dimse.cfind.max-results` (default `1000`).
- Optional query negotiation supported: `FUZZY` (PN fuzzy matching) and `DATETIME`
  (DT matching/ranges).
- Sequence/nested matching keys are supported for sequence items in the query dataset.
- C-CANCEL stops response emission and now also short-circuits plugin scanning.
- Invalid C-FIND identifiers (missing/unsupported level, invalid range syntax, DT ranges without
  DATETIME negotiation) are rejected with `IdentifierDoesNotMatchSOPClass`.

`keyword:value` filters:

- Any DICOM keyword present in the object can be used (case-insensitive), for example
  `StudyDate`, `AccessionNumber`, `PatientID`, `Modality`, `StudyDescription`.

Config source options:

- `app.dimse.cstore.config.source=yaml` (single-node runtime updates)
- `app.dimse.cstore.config.source=jdbc` (shared multi-node config via DB-backed versioned store)

For JDBC mode, configure:

- `app.dimse.cstore.config.jdbc.url`
- `app.dimse.cstore.config.jdbc.username`
- `app.dimse.cstore.config.jdbc.password`

Default storage root:

- `./data/storage`

Default API auth credentials:

- username: `dicoogle`
- password: `dicoogle`

## HTTP Endpoints

- `GET /api/system/ping` - Public ping endpoint.
- `GET /api/system/status` - Protected runtime status endpoint.
- `GET /api/system/plugins` - Protected list of loaded plugins.
- `GET /api/actuator/health` - Public health endpoint.
- `GET /api/dicom-web/studies/{StudyUID}/series/{SeriesUID}/instances/{SOPUID}` - Retrieve DICOM instance (`application/dicom`).
- `GET /api/dicom-web/studies` - QIDO-RS study search (`application/dicom+json`).
- `GET /api/dicom-web/studies/{StudyUID}/series` - QIDO-RS series search (`application/dicom+json`).
- `GET /api/dicom-web/studies/{StudyUID}/series/{SeriesUID}/instances` - QIDO-RS instance search (`application/dicom+json`).
- `GET /api/dicom-web/studies/{StudyUID}/metadata` - Study metadata in DICOM JSON (`application/dicom+json`).
- `GET /api/dicom-web/studies/{StudyUID}/series/{SeriesUID}/metadata` - Series metadata in DICOM JSON (`application/dicom+json`).
- `GET /api/dicom-web/studies/{StudyUID}/series/{SeriesUID}/instances/{SOPUID}/metadata` - Instance metadata in DICOM JSON (`application/dicom+json`).

## Manual Testing

### 1) Verify runtime

```bash
curl -u dicoogle:dicoogle http://localhost:8080/api/system/plugins
curl -u dicoogle:dicoogle http://localhost:8080/api/system/status
curl http://localhost:8080/api/actuator/health
```

### 2) DICOM tools used

```
dcmtk
```

### 3) Send one DICOM with C-STORE

```bash
storescu -aet TESTSCU -aec DICOOGLE localhost 6666 /path/to/sample.dcm
```

### 4) Extract UIDs from the same file

```bash
dcmdump +P 0010,0020 +P 0020,000D +P 0020,000E +P 0008,0018 /path/to/sample.dcm
```

Collect:

- `PatientID` (`0010,0020`)
- `StudyInstanceUID` (`0020,000D`)
- `SeriesInstanceUID` (`0020,000E`)
- `SOPInstanceUID` (`0008,0018`)

### 5) Check file storage hierarchy

Stored files use old-style hierarchy under `./data/storage`:

`PatientID/StudyInstanceUID/SeriesInstanceUID/SOPInstanceUID.dcm`

### 6) Retrieve through WADO-RS

```bash
curl -u dicoogle:dicoogle -H "Accept: application/dicom" -o retrieved.dcm \
"http://localhost:8080/api/dicom-web/studies/<StudyUID>/series/<SeriesUID>/instances/<SOPUID>"

curl -u dicoogle:dicoogle \
"http://localhost:8080/api/dicom-web/studies/<StudyUID>/series/<SeriesUID>/instances/<SOPUID>/metadata"
```

### 7) Negative test

```bash
curl -i -u dicoogle:dicoogle \
"http://localhost:8080/api/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.9"
```

Expected: `404` with `application/problem+json`.

### 8) Query through QIDO-RS

Study-level search:

```bash
curl -u dicoogle:dicoogle \
  "http://localhost:8080/api/dicom-web/studies?PatientName=FELIX&limit=10"
```

Series-level search inside a study:

```bash
curl -u dicoogle:dicoogle \
  "http://localhost:8080/api/dicom-web/studies/<StudyUID>/series?Modality=MR"
```

Instance-level search inside a series:

```bash
curl -u dicoogle:dicoogle \
  "http://localhost:8080/api/dicom-web/studies/<StudyUID>/series/<SeriesUID>/instances?includefield=PatientName&includefield=PatientID"
```

Supported QIDO query parameters:

- Matching keys via DICOM keyword or tag form (e.g. `PatientName`, `StudyDate`, `00100020`).
- `fuzzymatching=true|false` (mapped to PN fuzzy behavior).
- `limit` and `offset` for paging.
- `includefield=all` or repeated `includefield=<Keyword>` for projected responses.

### 9) C-FIND examples (findscu)

Standard Study Root by UID:

```bash
findscu -v -S -k QueryRetrieveLevel=STUDY -k StudyInstanceUID=<StudyUID> \
  -aet TESTSCU -aec DICOOGLE localhost 1045
```

Mixed free-text + keyword filter on same request (old Dicoogle style):

```bash
findscu -v -S -k QueryRetrieveLevel=STUDY -k "PatientName=brain modality:MR" \
  -aet TESTSCU -aec DICOOGLE localhost 1045
```

### 10) C-MOVE example (movescu)

```bash
movescu -v -S -k QueryRetrieveLevel=STUDY -k StudyInstanceUID=<StudyUID> \
  -aet TESTSCU -aec DICOOGLE localhost 1045 DEST_AE
```
