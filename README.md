# Dicoogle Next

**Dicoogle Next** is the new generation of [Dicoogle](https://github.com/bioinformatics-ua/dicoogle),
the open-source PACS archive, and the path towards **Dicoogle 4**.

It is a rewrite on a modern stack, with a plugin-based architecture for storage, indexing/query
and DICOM protocols (DIMSE, DICOMweb), and a legacy proxy for compatibility with existing
Dicoogle deployments.

> **Status:** early development (`0.0.x`). APIs and configuration may change.

## Repository layout

| Path | Description |
|---|---|
| [`backend/`](backend/README.md) | Spring Boot backend (Java 21, Maven): core, SDK, protocols and plugins |
| [`webapp/`](webapp/README.md) | Web interface (React, TypeScript, Vite) |
| `scripts/` | Maintenance scripts (e.g. `bump-version.sh`) |

## Quick start

```bash
# Backend
cd backend && ./mvnw package -DskipTests
java -jar dicoogle-next/target/dicoogle-next-*-exec.jar

# Or everything with Docker
docker compose up --build
```

Prebuilt Docker images and Maven artifacts are published to GitHub Packages.
See [`backend/README.md`](backend/README.md) for details.

## License

GPL-3.0. See [`license.md`](license.md).
