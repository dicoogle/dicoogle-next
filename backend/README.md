# Backend Quick Start

The backend now starts without an external database dependency.

## Build & Run

```bash
mvn install
java -jar dicoogle-next/target/dicoogle-next-0.0.1-SNAPSHOT.jar
```

Default profile is `dev`, which enables:

- DIMSE C-STORE on port `11112`
- Writable filesystem storage plugin (`file-rw`)
- Read-only filesystem fallback (`file-ro`)
- Startup validation requiring writable `file` scheme

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
- `GET /api/dicom-web/studies/{StudyUID}/metadata` - Study metadata JSON.
- `GET /api/dicom-web/studies/{StudyUID}/series/{SeriesUID}/metadata` - Series metadata JSON.
- `GET /api/dicom-web/studies/{StudyUID}/series/{SeriesUID}/instances/{SOPUID}/metadata` - Instance metadata JSON.

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
