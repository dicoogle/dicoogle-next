# Dicoogle Next demo app

A host project built on the `@dicoogle/dicoogle-next-webapp` package (see
[`../../LIBRARY.md`](../../LIBRARY.md)). It rebrands the app as "Demo PACS", changes the theme
colour and adds five demo plugins, one for each kind of extension point:

| Plugin | Where | Shows |
| --- | --- | --- |
| [Overview](src/plugins/overview) | **Overview** in the top menu | A new page and menu entry; using `dicoogleService`, `useAuthStore` and the plugin registry; listening to another plugin's events |
| [Modality filter](src/plugins/modality-filter) | Search page, filters | A query filter that adds `Modality:CT` (or another modality) to the search |
| [Study tools](src/plugins/study-tools) | Actions on each result; **Management > Study tools** | Per-result actions, a settings tab, per-plugin storage, an action shown only when configured |
| [Patient timeline](src/plugins/patient-timeline) | View buttons above the results | A custom results view; registered **disabled**, switch it on in **Management > Plugins** |
| [CSV export](packages/csv-export) | **Export CSV** above the results | A batch action, shipped as its own npm package, that emits events on the plugin event bus |

`src/main.tsx` shows how the app is configured and the plugins registered; `src/index.css`
shows how the theme is overridden; `public/demo-logo.svg` is the replacement logo.

## Run it

It needs a running Dicoogle Next backend. `npm run dev` proxies `/next/api/*` to the backend's
`/api/*` on `http://localhost:8080`; set `DICOOGLE_BACKEND_URL` for another address.

```bash
export NODE_AUTH_TOKEN=$(gh auth token)   # GitHub Packages needs read:packages
npm install
npm run dev
```

To try it against a local build of the package instead of the registry:

```bash
(cd ../.. && npm pack)                    # webapp/dicoogle-dicoogle-next-webapp-<version>.tgz
npm install ../../dicoogle-dicoogle-next-webapp-*.tgz
```
