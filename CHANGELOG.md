# Changelog

## Unreleased

- Report HTML (Part C): inline SVG charts (delta bars + noise band, cost-attribution stacked bar with shadow-map hatch, GPU-per-pass or not-measured, frame-time histogram with p50/p95, triangle budget gauge, trend line/dots/gradient) and CSS animation (`scaleX`, `stroke-dashoffset`, first-paint `fade-up`) killed by `prefers-reduced-motion` and print. CSS-only before/after slider (`range` + `clip-path`) with optional difference-blend radio; one small progressive-enhancement script. Self-contained (no CDN). `--example` / `docs/sample-report.json` gain documented `frameTimesMs`. No version bump. Do not publish from this change.
- Report HTML (Part B): `expectedTradeoffs` chips are a neutral **expected trade-off** (never red, never a regression in the verdict strip); integer metrics with a zero delta are **unchanged** (not inside-noise); metric headings use labels with units (`gpuFrameTimeMs` → “GPU frame time (ms)”, unknown keys stay as the raw key); a one-sentence verdict strip under the header; Cost / Scene facts grouping. No version bump. Do not publish from this change.
- Pre-announce Part A: npm keywords on every publishable package; short package READMEs; `docs/report-json.md`; `threejs-doctor report --example`; unknown top-level report keys warn; CODE_OF_CONDUCT (Contributor Covenant 2.1); PR template; README FAQ; GitHub Pages sample generated from `docs/sample-report.json`.
- Packages bumped to 0.1.5 (pending publish — keywords ride the next `publish.yml` run). Do not republish 0.1.4.

## 0.1.4

- **0.1.4 is on npm** (`threejs-doctor` + `@threejs-doctor/{core,rules,runtime,bench,cli,r3f}`). First provenance-bearing release via `publish.yml` (run 35486295010). Do not republish. 0.1.0–0.1.3 may still have empty `dist.attestations`.
- Publish: `check-provenance.mjs --published` retries `npm view … dist.attestations` with backoff (~2–3 min) when the version is missing (E404) or attestations are empty right after publish, then fails hard. Do not republish 0.1.4.
- Publish: `scripts/publish.mjs --go` refuses unless `GITHUB_ACTIONS=true`. Dry-run (`pnpm publish:dry`) still works locally. Later publishes must be `publish.yml` workflow_dispatch (generic “Type publish to release packages to npm”).
- Docs: provenance can be produced by `npm publish --provenance` in GHA with `id-token: write` **and** `NPM_TOKEN`; Trusted Publisher lets you delete the token later. Weekly `.github/workflows/provenance.yml` runs `check-provenance.mjs --published --latest`.
- README first screen: three-line quick start, measured arcade-racer case study, limitations (GPU timer often missing on iOS Safari / mobile; static scan is pattern-based), schematic in `docs/assets/`.
- CLI: `scan --format html` and `threejs-doctor report` write a single offline HTML file (no telemetry, no invented metrics).
- SARIF: one result per site for per-site rules (GitHub annotates primary location). Aggregate rules such as `lights/too-many` stay one result. Rule `shortDescription` is generic; FX culling is `culling/frustum-disabled-fx`.
- Runtime: visible `waitFrame` that never settles is aborted after ~5s with `invalid: 'stalled'`.
- Community: `SECURITY.md`, `CONTRIBUTING.md`, issue templates.
- Packages bumped to 0.1.4.

## 0.1.3

- Runtime: `invalid: 'hidden'` is decided only from `document.visibilityState` (and `document.hidden`). A GPU wait timeout skips harvest for that frame and does **not** mark a visible slow device (e.g. 120ms rAF) hidden. Throttling stays with existing validity thresholds.
- Runtime: user-supplied `waitFrame` is wrapped so a hidden tab cannot hang `measure()`. README recommends exported `waitGpuMacrotask` instead of raw `new Promise(requestAnimationFrame)`.
- Scan: three.js `EffectComposer` requires `composer.setPixelRatio` when the renderer DPR changes; `setSize` alone is not sync (it reuses the construction pixel ratio). pmndrs `postprocessing` may use `setSize` only. Suggested fix text matches.
- Scan: every finding site is exposed (`locations[]` in JSON, all `file:line` in human output, SARIF `relatedLocations`).
- SARIF: artifact URIs are git-root relative; `tool.driver.rules` is filled from message / suggestedFix.
- Scan: `git check-ignore --stdin -z` is batched (one git process per scan, not per file).
- Publish: `scripts/check-provenance.mjs --published` fails if `npm view <pkg>@<version> dist.attestations` is empty. Dry-runs skip the registry. **0.1.3 is on npm** (token publish again; attestations may still be empty). Trusted Publisher remains optional leftover (not a blocker).
- Docs: static Doctor Score often does not move when the real wins are runtime (triangle chunking, composer DPR sync, dispose).

## 0.1.2

- Runtime: `waitGpuMacrotask` races `requestAnimationFrame` against a short timeout so `measure()` cannot hang in a background tab; timeout/hidden bails with `invalid: 'hidden'`.
- Runtime: visual-gate rollback undoes **only** handles from the current `optimize()` call. Earlier accepted passes stay applied; the report’s after/deltas/appliedPasses reflect the restored accepted state.
- Scan: `--profile auto` treats any continuous loop as `game` and never recommends `frameloop-demand` from static facts alone.
- Scan: positional light intensity `0`, non-literal-false `castShadow` assignments, Points/Line/Sprite frustumCulled as info, drop `materials/too-unique`, composer pixel-ratio drift, `.gitignore` / minified / vendored three skip, `file:line` on findings, `--format sarif`, Static Doctor Score label.

## 0.1.1

- Real static scan + `ci --min-score`.
- Docs: **0.1.1 is on npm**. Trusted Publisher remains leftover (not a blocker).
- live-attach: cheap bundled-host discovery — host `composer`, canvas `domElement` reverse lookup, R3F `canvas.__r3f`, WebGL canvas cap (max 8), extra bundle roots. Cheap walk does not expand live `scene` graphs. Deep walk stays opt-in. Host snippet: `examples/host-shim/expose.js`.
- host-shim: official `three.module.js` assigns own-property `render` (prototype hooks never run); optional `intercept-three-module.js` wraps the constructor so the first `render(scene, camera)` writes `__THREEJS_DOCTOR_HOST__`.
