# Dicoogle Next Webapp

Modern web interface for Dicoogle, built with React, TypeScript, and Vite.

This webapp focuses on day-to-day PACS workflows: authentication, DICOM search, study exploration, image visualization, indexing/import orchestration, and administrative configuration.

## Core Functionalities

### Authentication and session handling

- Login/logout flow backed by Dicoogle authentication endpoints
- Session restoration on app startup
- Route protection for authenticated and admin-only areas

### DICOM search and study exploration

- Query-based search using Dicoogle query syntax and free text
- Result aggregation and deduplication from available providers
- Study/series grouping with expandable navigation and metadata access
- Metadata inspection modal for DICOM attributes

### Image viewing

- Quick preview and advanced viewer paths
- Cornerstone-based rendering pipeline for DICOM image display
- Series-level navigation and instance browsing

### Import and indexing workflows

- Manual indexing start from user-provided paths
- Task monitoring (progress, completion, errors, cancellation)
- Auto-index settings UI (watcher path and enable/disable state)

### Management area (admin)

- Service controls for query/storage behavior
- Storage server configuration
- User management (create, update, delete)
- Transfer syntax capability settings with search and pagination
- System/log-related operational views

### Plugin extension environment (brief)

The app includes a plugin extension environment that allows adding UI capabilities at build time and using them at runtime through extension hooks (routes, menu items, filters, renderers, settings, and actions).

For full architecture, lifecycle, API contracts, and extension types, see `docs/plugin-system-docs.md`.

### Filesystem manager transition note

The standalone filesystem manager backend helper is removed from deployment. File browsing currently uses Dicoogle's existing deprecated `/indexer?action=pathcontents` endpoint, while the modal/UI code is kept in place for a future backend replacement.

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- `dicoogle-client`
- Cornerstone (`@cornerstonejs/*`)

## Project Structure

```text
webapp/
  src/
    components/        # shared UI primitives, layout, route guards
    features/          # feature modules (auth, search, indexer, management)
    services/          # API and backend adapters
    stores/            # Zustand stores for app state
    plugin-system/     # plugin runtime registry, hooks, manager
    plugins/           # plugin implementations/discovery targets
  docs/
    plugin-system-docs.md
  vite-plugins/
    plugin-loader.ts   # build-time plugin discovery
```

## Requirements

- Node.js 18+ (Node 20 recommended)
- npm 9+
- A reachable Dicoogle backend (default fallback: `http://localhost:8080`)

## Quick Start

```bash
npm ci
npx vite
```

Then open the URL shown by Vite (typically `http://localhost:5173`).

If your backend is not on default host/port, define `VITE_API_BASE_URL` before starting Vite.

## Configuration

You can provide configuration via environment variables.

### Frontend/runtime variables

- `VITE_API_BASE_URL`
  - Dicoogle API base URL (absolute URL or relative, depending on proxy setup)
- `VITE_BASE_PATH`
  - React Router basename used by the app (fallback: `/experimental`)
- `BASE_PATH`
  - Vite build base path (fallback in `vite.config.ts`: `/experimental/`)
- `VITE_APP_VERSION`
  - Optional app version exposed in plugin context
- `VITE_FILESYSTEM_START_PATH`
  - Optional initial path for the file browser modal (example: `/dicoogle`); if unset, roots are loaded from backend

## Running Locally

Install dependencies:

```bash
npm ci
```

Build production bundle:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Type-check:

```bash
npm run type-check
```

Current `npm run dev` behavior:

```bash
npm run dev
```

This starts the Vite development server.

## Main Routes

- `/login` - user authentication
- `/search` - study search, result browsing, and viewer entry points
- `/management/services` - DICOM service controls and network settings
- `/management/plugins` - plugin state/settings area
- `/management/users` - user lifecycle management
- `/management/transfer` - transfer syntax options
- `/management/system` - system/runtime information

## Docker

Build image:

```bash
docker build \
  --build-arg VITE_API_BASE_URL=/next/api \
  --build-arg BASE_PATH=/next/ \
  --build-arg VITE_BASE_PATH=/next \
  -t dicoogle-next-webapp \
  -f dockerfile .
```

Run container:

```bash
docker run --rm -p 3000:3000 dicoogle-next-webapp
```

Nginx routing/proxy settings live in `nginx.conf`.

## Typical Workflow

1. Sign in with a valid Dicoogle user
2. Run queries in `/search` and inspect studies/series
3. Open viewer paths for image review
4. Start indexing tasks through Import Data when needed
5. Use `/management/*` routes for operational administration
