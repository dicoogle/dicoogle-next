# @demo/dicoogle-csv-export

A Dicoogle Next plugin shipped as its own package. It adds an **Export CSV** batch action to
the search results and announces each export on the plugin event bus
(`CSV_EXPORTED_EVENT`), which the demo's Overview page listens to.

It exports its TypeScript source and lists `@dicoogle/dicoogle-next-webapp` and React as peer
dependencies, so the host app compiles it with the rest of its code and it shares the host's
copy of the web app. Publish it like any npm package; here the demo links it with
`"@demo/dicoogle-csv-export": "file:./packages/csv-export"`.

Register it with no extra metadata: the plugin carries its own.

```ts
import csvExportPlugin from "@demo/dicoogle-csv-export";
createDicoogleApp("#root", { plugins: [csvExportPlugin] });
```
