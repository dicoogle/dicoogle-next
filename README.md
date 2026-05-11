# Dicoogle Next

Dicoogle Next is an ongoing rework of the Dicoogle PACS platform.

The goal is to modernize the application stack and developer experience (backend API, frontend UI, and extensibility) while keeping the same core domain: DICOM storage, indexing, search, and viewing workflows.

Today, the Next web interface (`webapp/`) is already usable by connecting to the current Dicoogle implementation and its existing endpoints. In parallel, this repository also contains the new backend effort (`backend/`), which is evolving as part of the rework.

Demo: <https://demo.dicoogle.com/next/>

## Repository Layout

```text
.
  backend/            # Spring Boot backend (Java 21)
  webapp/             # React + TypeScript + Vite frontend
  docker-compose.yml  # Container entry points (currently frontend-focused)
  license.md          # Project license (GPLv3)
```

## Components

### Backend (`backend/`)

- Spring Boot (Java 21), Maven multi-module project
- Default API context path: `/api` (see `backend/dicoogle-next/src/main/resources/application.yml`)
- OpenAPI/Swagger UI available when enabled in the backend configuration

### Frontend (`webapp/`)

- React 18 + TypeScript, built with Vite
- Focuses on day-to-day PACS workflows (auth, search, study/series exploration, viewing, indexing/import, admin)
- See `webapp/README.md` for full frontend documentation

## Quick Start (Local)

Prereqs:

- Java 21+
- Node.js 18+ (Node 20 recommended)

Run the backend:

```bash
cd backend
./mvnw -pl dicoogle-next spring-boot:run
```

Run the webapp:

```bash
cd webapp
npm ci
npm run dev
```

If the backend is not on the default URL expected by the frontend (e.g., when pointing the webapp to an existing Dicoogle instance), configure `VITE_API_BASE_URL` before starting the dev server (see `webapp/README.md`).

## Docker

`docker-compose.yml` builds and runs the frontend container. The backend service is present as a stub/commented section and may be enabled/extended as the deployment setup evolves.

## License

GPLv3. See `license.md`.
