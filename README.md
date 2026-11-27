# Dicoogle Next

**Dicoogle Next** is the new generation of [Dicoogle](https://github.com/dicoogle/dicoogle),
the open-source PACS archive, and the path towards **Dicoogle 4**.

It is a rewrite on a modern stack, with a plugin-based architecture for storage, indexing/query
and DICOM protocols (DIMSE, DICOMweb), and a legacy proxy for compatibility with existing
Dicoogle deployments.

> **Status:** early development (`0.0.x`). APIs and configuration may change.

## Repository layout

| Path | Description |
|---|---|
| [`backend/`](backend/README.md) | Spring Boot backend (Java 21, Maven): core, SDK, protocols and plugins |
| [`webapp/`](webapp/README.md) | Web interface (React, TypeScript, Vite), also published as an npm package ([`LIBRARY.md`](webapp/LIBRARY.md)) |
| `scripts/` | Maintenance scripts (e.g. `bump-version.sh`) |

## Quick start

```bash
# Backend
cd backend && ./mvnw package -DskipTests
java -jar dicoogle-next/target/dicoogle-next-*-exec.jar

# Or with Docker (after building the backend jar above)
docker compose up --build
```

By default Docker Compose mounts `./dicom` into the backend at `/data/dicom`. Point it at your own
DICOM folder with `DICOM_DIR=/path/to/dicom docker compose up --build`.

Prebuilt Docker images and Maven artifacts are published to GitHub Packages.
See [`backend/README.md`](backend/README.md) for details.

## License

The same license as [Dicoogle](https://github.com/dicoogle/dicoogle) applies. See [`license.md`](license.md).
