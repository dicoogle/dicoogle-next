---
name: update-web-vulnerabilities
description: Audit and fix npm dependency vulnerabilities in the Dicoogle webapp (webapp/). Use when asked to update/fix web vulnerabilities, run npm audit, bump insecure frontend dependencies, or respond to Dependabot/GHSA alerts for the webapp.
---

# Update webapp vulnerabilities

Fixes known vulnerabilities in `webapp/` (React + Vite + Cornerstone) npm dependencies with the
smallest safe change, then proves the app still builds.

All commands run from `webapp/`. Keep scratch output (audit JSON, logs) in the session scratchpad, not the repo.

## 1. Baseline

```bash
cd webapp
npm ci                                   # start from the committed lockfile
npm audit --json > "$SCRATCH/audit-before.json"
```

Summarize per package: severity, range, `isDirect`, `fixAvailable`, advisory titles:

```bash
node -e "const a=require(process.argv[1]);console.log(a.metadata.vulnerabilities);for(const[k,v]of Object.entries(a.vulnerabilities))console.log(v.severity,k,v.range,'direct='+v.isDirect,'fix='+JSON.stringify(v.fixAvailable))" "$SCRATCH/audit-before.json"
```

Also confirm the baseline builds (`npm run type-check && npm run build`) so later failures are attributable.

## 2. Classify each finding

| `fixAvailable` | Action |
|---|---|
| `true` | Safe: semver-compatible update. Fix in step 3. |
| `{isSemVerMajor: true}` | **Do not** run `npm audit fix --force`. Evaluate manually (step 4). |
| `false` | No upstream fix. Try an `overrides` entry if a patched version of the transitive dep is API-compatible; otherwise document as accepted risk. |

Also weigh **exposure**: build/dev-only tooling (vite, esbuild, postcss, babel, eslint, browserslist,
brace-expansion) only matters on developer machines/CI; runtime deps shipped in `dist/`
(react-router, cornerstone, dicoogle-client, jszip…) affect users. Prioritize runtime.

## 3. Apply non-breaking fixes

```bash
npm audit fix            # never --force
```

If a direct dependency's range in `package.json` pins below the patched version, raise the range
(e.g. `"vite": "^8.0.16"`) so a fresh install can't resolve back to a vulnerable version, then `npm install`.

For transitive deps stuck on a vulnerable version where the parent's range allows a patched one but
npm didn't dedupe, add an `overrides` entry in `package.json`, e.g.:

```json
"overrides": { "nanoid": "^3.3.18" }
```

Only override within the same major unless you verify the parent works with the new major.

## 4. Breaking (major) fixes

For each major-bump suggestion, check what it really means:
- `npm view <pkg> versions --json`, changelog / migration guide.
- `grep -rn "<pkg>" src/` to size the code impact.

Small API surface → do the upgrade and adapt the code in `src/`. Large migrations (e.g. Cornerstone 1.x → 5.x,
which rewrites viewport/tool APIs) → **don't do it silently**: list it in the report as a follow-up with the
advisory IDs and estimated scope, and ask the user before starting.
Never accept a "fix" that is a downgrade to an unmaintained version (npm sometimes suggests this) without asking.

## 5. Verify

```bash
npm run type-check
npm run lint
npm run build
npm audit --json > "$SCRATCH/audit-after.json"
```

All three must pass (if lint was already failing at baseline, only require no *new* errors). If something breaks,
fix the code or roll back that specific bump — don't leave the build red. If a runtime dep changed
(react-router, cornerstone, dicoogle-client), smoke-test with `npm run dev` (use the `run` skill) — login,
search, open a study in the viewer.

## Known gotchas in this repo

- **Vite/rolldown minor bumps can break the Cornerstone polySeg worker build** (`Top-level await is not supported
  with the 'iife' output format`, then `"default" is not exported by ICRPolySeg.wasm`). `vite.config.ts` sets
  `worker.format: "es"` plus a `polyseg-wasm-as-url` worker plugin; keep both. Don't add `vite-plugin-wasm` to
  worker plugins — polyseg expects the `.wasm` import to be a URL.
- **Cornerstone 1.x has no in-major fixes** for its transitive advisories (vtk.js → fflate, xmlbuilder2 → js-yaml,
  uuid, @babel/runtime). They're handled with `overrides` in `package.json`; when bumping, check whether the
  overrides are still needed (`npm ls <pkg>`) and drop ones that the parents now satisfy.
- `npm audit` suggests downgrading `cornerstone-wado-image-loader` to 4.2.1 — ignore it; the `uuid` override covers it.
- After changing `overrides`, a plain `npm install` may not re-resolve; if `npm ls` still shows the old version,
  delete `node_modules` and run `npm install` again.

## 6. Report

Give a before/after table (counts by severity), list what was bumped (old → new), what code changed, and
remaining findings with the reason each is left (major migration / no upstream fix / dev-only). Commit only
when asked; commit `package.json`, `package-lock.json`, and any `src/` changes together, message
`chore(webapp): fix npm audit vulnerabilities`.
