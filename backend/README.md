# Backend Quick Start

The backend now starts without an external database dependency.

## Build & Run

```bash
mvn install
java -jar dicoogle-next/target/dicoogle-next-0.0.1-SNAPSHOT.jar
```

Default profile is `dev`, which enables:

- DIMSE C-STORE on port `11112`
- DIMSE C-ECHO verification on port `11112`
- Writable filesystem storage plugin (`file-rw`)
- Read-only filesystem fallback (`file-ro`)
- Startup validation requiring writable `file` scheme

DIMSE status (current):

- Implemented: C-ECHO, C-STORE, C-FIND (Study Root)
- Not implemented yet: C-MOVE

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

- username: `developer`
- password: `developer`

## HTTP Endpoints

- `GET /api/system/ping` - Public ping endpoint.
- `GET /api/system/status` - Protected runtime status endpoint.
- `GET /api/system/plugins` - Protected list of loaded plugins.
- `GET /api/actuator/health` - Public health endpoint.
- `GET /api/dicom-web/studies/{StudyUID}/series/{SeriesUID}/instances/{SOPUID}` - Retrieve DICOM instance (`application/dicom`).
- `GET /api/dicom-web/studies/{StudyUID}/metadata` - Study metadata in DICOM JSON (`application/dicom+json`).
- `GET /api/dicom-web/studies/{StudyUID}/series/{SeriesUID}/metadata` - Series metadata in DICOM JSON (`application/dicom+json`).
- `GET /api/dicom-web/studies/{StudyUID}/series/{SeriesUID}/instances/{SOPUID}/metadata` - Instance metadata in DICOM JSON (`application/dicom+json`).

## Manual Testing

### 1) Verify runtime

```bash
curl -u developer:developer http://localhost:8080/api/system/plugins
curl -u developer:developer http://localhost:8080/api/system/status
curl http://localhost:8080/api/actuator/health
```

### 2) DICOM tools used

```
dcmtk
```

### 3) Send one DICOM with C-STORE

```bash
storescu -aet TESTSCU -aec DICOOGLE localhost 11112 /path/to/sample.dcm
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
curl -u developer:developer -H "Accept: application/dicom" -o retrieved.dcm \
"http://localhost:8080/api/dicom-web/studies/<StudyUID>/series/<SeriesUID>/instances/<SOPUID>"

curl -u developer:developer \
"http://localhost:8080/api/dicom-web/studies/<StudyUID>/series/<SeriesUID>/instances/<SOPUID>/metadata"
```

### 7) Negative test

```bash
curl -i -u developer:developer \
"http://localhost:8080/api/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.9"
```

Expected: `404` with `application/problem+json`.

### 8) C-FIND examples (findscu)

Standard Study Root by UID:

```bash
findscu -v -S -k QueryRetrieveLevel=STUDY -k StudyInstanceUID=<StudyUID> \
  -aet TESTSCU -aec DICOOGLE localhost 11112
```

Mixed free-text + keyword filter on same request (old Dicoogle style):

```bash
findscu -v -S -k QueryRetrieveLevel=STUDY -k "PatientName=brain modality:MR" \
  -aet TESTSCU -aec DICOOGLE localhost 11112
```
