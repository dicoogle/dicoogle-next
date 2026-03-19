# Backend Quick Start

The backend now starts without an external database dependency.

## Build

```bash
./mvnw -pl dicoogle-next clean package
```

## Run

```bash
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

Useful endpoints:

- `http://localhost:8080/api/system/plugins`
- `http://localhost:8080/api/system/status`
- `http://localhost:8080/api/actuator/health`
