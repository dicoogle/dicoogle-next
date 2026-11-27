# Using the web app as a library

The Dicoogle Next web app is published as **`@dicoogle/dicoogle-next-webapp`** on GitHub
Packages. Another project can host the full app, set its own branding and configuration, and
add pages, menu entries, search filters, result actions and settings tabs through plugins,
without forking this repository.

A complete, buildable demo project with five example plugins (a page, a search filter, result
actions with a settings tab, a results view, and a batch action shipped as its own package) is
in [`examples/demo-app`](examples/demo-app).

## Install

GitHub Packages needs a token with `read:packages`, even for public packages. In the host
project, add an `.npmrc`:

```ini
@dicoogle:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
export NODE_AUTH_TOKEN=$(gh auth token)   # or a personal access token with read:packages
npm install @dicoogle/dicoogle-next-webapp react@18 react-dom@18 react-router-dom@7
npm install -D vite @vitejs/plugin-react tailwindcss @tailwindcss/postcss postcss typescript
```

React, React Router, Vite and Tailwind CSS v4 are peer dependencies, so the host and the
library share a single copy of each. Release versions use the `latest` dist-tag; builds of
`-SNAPSHOT` versions use the `snapshot` dist-tag (`npm install @dicoogle/dicoogle-next-webapp@snapshot`).

## Set up the host app

**`vite.config.ts`**: the preset applies the build settings Cornerstone needs (WebAssembly,
ES-module workers) and serves the library's static assets (logo, DICOM decode workers).

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dicoogleNext } from "@dicoogle/dicoogle-next-webapp/vite";

export default defineConfig({
  plugins: [react(), dicoogleNext()],
  server: {
    proxy: { "/next/api": { target: "http://localhost:8080", changeOrigin: true } },
  },
});
```

**`src/index.css`**: Tailwind generates the library's classes and the host's own from the same
theme, so plugins can use the theme tokens (`bg-card`, `text-muted-foreground`, ...).

```css
@import "tailwindcss";
@import "@dicoogle/dicoogle-next-webapp/styles.css";
```

**`postcss.config.js`**: `export default { plugins: { "@tailwindcss/postcss": {} } };`

**`tsconfig.json`**: add `"types": ["vite/client", "@dicoogle/dicoogle-next-webapp/client"]`.

**`src/main.tsx`**:

```tsx
import "./index.css";
import { createDicoogleApp } from "@dicoogle/dicoogle-next-webapp";
import myPlugin from "./plugins/my-plugin";

createDicoogleApp("#root", {
  apiBaseUrl: "/next/api",
  basePath: import.meta.env.BASE_URL,
  publicBaseUrl: import.meta.env.BASE_URL,
  branding: { appName: "My PACS", tagline: "Imaging for My Hospital" },
  plugins: [{ plugin: myPlugin, metadata: { id: "my-plugin", name: "My plugin", version: "1.0.0" } }],
});
```

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `apiBaseUrl` | current origin | Dicoogle Next API: an absolute URL or a path on the current origin. |
| `basePath` | `/experimental` | Router basename the app is served under. |
| `publicBaseUrl` | `/` | Where static assets are served; normally `import.meta.env.BASE_URL`. |
| `filesystemStartPath` | server roots | Folder the "Import Data" browser opens at. |
| `appVersion` | `1.0.0` | Version reported to plugins in their context. |
| `branding.appName` | `Dicoogle` | Product name (logo alt text). |
| `branding.logoUrl` | `<publicBaseUrl>logo.png` | Logo in the header, login page and viewer. |
| `branding.tagline` | `Medical Imaging PACS Platform` | Line under the logo on the login page. |
| `plugins` | `[]` | Plugins, either a plugin object or `{ plugin, metadata, enabled }`. |
| `strictMode` | `true` | Render inside `React.StrictMode`. |

`createDicoogleApp` returns `{ config, pluginsReady, unmount }`.

To replace an asset instead of configuring it, put a file with the same path in the host's
`public/` directory (for example `public/logo.png`); it takes precedence over the library's.

## Writing plugins

Plugins are the same `WebUIPlugin` objects as the in-repo plugins, described in
[`docs/plugin-system-docs.md`](docs/plugin-system-docs.md). In a host app, import the types
and helpers from the package instead of `@/plugin-system`:

```tsx
import { defineDicooglePlugin, type ResultOptionActionArgs } from "@dicoogle/dicoogle-next-webapp";

export default defineDicooglePlugin({
  getSidebarMenuExtensions: () => [{ id: "reports", label: "Reports", path: "/reports" }],
  getRouteExtensions: () => [{ path: "/reports", name: "Reports", component: ReportsPage }],
  getResultOptionsExtensions: () => [
    {
      id: "send-to-ris",
      label: "Send to RIS",
      icon: <Send className="w-4 h-4" />,
      action: async ({ result, context }: ResultOptionActionArgs) => { /* ... */ },
    },
  ],
});
```

Every plugin needs an `id`, given either in its registration (`{ plugin, metadata: { id } }`,
as in `main.tsx` above) or in the plugin's own `metadata`; plugins without one are skipped.
The user's enable/disable choice in Management > Plugins is stored per `id`.

Plugins can be written in the host app, or published as their own npm packages and passed to
`plugins`. The package also exports the UI building blocks (`Button`, `Card`, `Dialog`,
`Input`, `ConfirmActionDialog`, `cn`, `toast`), the `dicoogleService` API client, the
`useAuthStore`/`useSearchStore` stores and the domain types, so plugin pages look and behave
like the rest of the app.

## What is public

Only what `src/lib/index.ts` exports is the package's public API. Anything else under `src/`
is internal and may change in any release.

## Developing the package

```bash
npm run build:lib          # dist-lib/: library (vite.lib.config.ts), types, Vite preset
npm pack                   # tarball to try in a host app: npm install /path/to/the.tgz
```

The standalone app (`npm run dev`, `npm run build`, the Docker image) is unchanged and goes
through the same `createDicoogleApp` entry point, configured from its `VITE_*` environment
variables in `src/main.tsx`.

Publishing runs in `.github/workflows/npm-publish.yml`: on a `v*` tag, from
`bump-version.yml`, or manually with `gh workflow run npm-publish.yml --ref dev`.
