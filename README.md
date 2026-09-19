# threejs-doctor

Doctor + optimizer for Three.js: diagnose scenes with deterministic findings, apply safe runtime optimizations for low-end devices, and prove the win with measurable before/after metrics.

Inspired by [react-doctor](https://github.com/millionco/react-doctor). Design: [`docs/superpowers/specs/2026-09-17-threejs-doctor-design.md`](docs/superpowers/specs/2026-09-17-threejs-doctor-design.md). v2 Quality Ladder: [`docs/superpowers/specs/2026-09-17-threejs-doctor-quality-ladder-design.md`](docs/superpowers/specs/2026-09-17-threejs-doctor-quality-ladder-design.md). v1 plan: [`docs/superpowers/plans/2026-09-17-threejs-doctor-v1.md`](docs/superpowers/plans/2026-09-17-threejs-doctor-v1.md). v2 plan: [`docs/superpowers/plans/2026-09-17-threejs-doctor-quality-ladder.md`](docs/superpowers/plans/2026-09-17-threejs-doctor-quality-ladder.md).

## Install / run

Published **0.1.0** on npm (`threejs-doctor` + `@threejs-doctor/{core,rules,runtime,bench,cli,r3f}`):

```bash
npm i @threejs-doctor/runtime
npx threejs-doctor
```

```ts
import { Doctor } from '@threejs-doctor/runtime'
```

Unscoped `threejs-doctor` is a **name reservation + alias** that depends on `@threejs-doctor/cli` (`npx threejs-doctor bench --profile product --budget low`, or `npx @threejs-doctor/cli …`). Later publishes: attach Trusted Publisher, then delete `NPM_TOKEN` — see [`docs/publish-checklist.md`](docs/publish-checklist.md).

### Git install (monorepo)

```bash
git clone https://github.com/codergeeta/threejs-doctor.git
cd threejs-doctor
pnpm install
pnpm build
node packages/cli/bin/threejs-doctor.js bench --profile product --budget low
```

### CLI status

| Command | Status |
|---------|--------|
| `bench` | Works after `pnpm build` (headless fixtures) |
| `scan` | Static JS/TS/HTML scan — findings + Doctor Score from `@threejs-doctor/rules`. Runtime metrics (FPS, draw calls, drawn triangles, VRAM, GPU) are **omitted** |
| `ci` | Same scan path; exits non-zero when score `< --min-score` (default 70), on error-severity findings, or when no Three.js is found |

```bash
npx threejs-doctor scan ./path --format json --profile auto --budget low
npx threejs-doctor ci ./path --min-score 70 --profile marketing --budget low
```

`scan` / `ci` count constructors and setup in source (lights, shadow casters, `setPixelRatio`, `antialias`, rAF / `setAnimationLoop`, `frustumCulled = false`). They do **not** invent draw-call or triangle totals. For a live scene score, attach the runtime `Doctor`.

### Use in CI

After `pnpm build` (or `npx threejs-doctor` from npm):

```yaml
- run: npx threejs-doctor ci ./src --min-score 70 --profile marketing --budget low
```

`--budget` is the assumed device tier for rules that need one (DPR cap, antialias-on-low). `--profile auto` classifies from static facts only (not omitted draw calls) and defaults to `marketing`. Point `path` at the app that imports `three`, not a monorepo root that mixes fixtures. A project with no Three.js patterns is **incomplete** and fails `ci` even at `--min-score 0`. Static scan does not unroll `for` loops or resolve `require('three')` unless a Three.js constructor is present.

## Monorepo scripts

Root `package.json` scripts (pnpm workspaces, Node >= 20):

| Script | What it runs |
|--------|----------------|
| `pnpm test` | Vitest in every `@threejs-doctor/*` package |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm build` | `tsc` emit to each package `dist/` |

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

CI (`.github/workflows/ci.yml`) runs `typecheck`, `test`, `build`, a **live-attach IIFE checksum** (`pnpm check:iife` rebuilds `examples/live-attach/dist/attach.iife.js` and fails if the committed file drifted), and a **scan/ci smoke** against the CLI fixtures (`ci --min-score` must pass on the healthy fixture and fail on the heavy one). A second job runs Playwright against a real Three.js + EffectComposer + InstancedMesh fixture (SwiftShader is fine; GPU times are still omitted when the timer query has no result). npm publish is a **manual** workflow (`.github/workflows/publish.yml`) after Trusted Publisher or `NPM_TOKEN` — see [`docs/publish-checklist.md`](docs/publish-checklist.md).

## Runtime (vanilla Three.js)

```ts
import { Doctor } from '@threejs-doctor/runtime'

const doctor = new Doctor({
  scene,
  camera,
  renderer,
  composer, // pass explicitly — auto-discovery is shallow (scene / renderer / scene.userData)
  onPixelRatioChange: (ratio) => composer.setPixelRatio?.(ratio),
  profile: 'game', // games: set explicitly; 'auto' pins the first resolution
  mode: 'diagnose',
  // Host rAF waits for the next frame. Doctor wraps renderer.render / composer.render for CPU work.
  waitFrame: () => new Promise(requestAnimationFrame),
})
// Times the waitFrame / renderFrame / renderer.render between beginFrame and endFrame.
const baseline = await doctor.measure(30)
const report = await doctor.diagnose()
const after = await doctor.optimize({ apply: ['safe'] })
doctor.mountOverlay()
```

`measure()` does not invent GPU times. `gpuFrameTimeMs` is set only when `EXT_disjoint_timer_query_webgl2` returns a **queued** query result (`QUERY_RESULT_AVAILABLE` on a later frame, discarded on `GPU_DISJOINT_EXT`). Timer methods are called on the **WebGL2RenderingContext**; the EXT object only supplies constants. Prefer `renderer.extensions.get('EXT_disjoint_timer_query_webgl2')`. Pending queries are tagged per `measure()` and discarded at start/end so compareAb cannot mix A into B. Each frame harvests **every** available result. Without `waitFrame`, Doctor yields a macrotask (rAF / `setTimeout(0)`) when a GPU sampler exists so `QUERY_RESULT_AVAILABLE` can flip; otherwise it sets `gpuTimingSkipped` and does not leave pending queries. Draw-call and drawn-triangle totals are the **median** across sampled frames (`renderer.info.autoReset = false` so EffectComposer passes accumulate). CPU time prefers wrapping the host `renderer.render` / `composer.render` rather than the rAF vsync interval, and **sums** top-level `render()` work in one frame (HUD + minimap). Lights, textures, and render-target VRAM come from the scene graph when dimensions are known (otherwise those fields are omitted).

Pass `composer` **explicitly** when you have an EffectComposer (three.js `renderTarget1`/`writeBuffer` or pmndrs `inputBuffer`/`outputBuffer`). Auto-discovery is **shallow** (the composer object, `scene.userData`, renderer own properties). `dpr-cap` can then call `setPixelRatio`/`setSize` or `onPixelRatioChange`. Triangle **cost** is `renderer.info.triangles` (drawn, including extra shadow/composer passes when measured). Scene-graph `geometryTriangleCount` is attribution only — after chunking, drawn cost can drop even if unused geometry remains.

Hidden tabs and throttled rAF mark the sample `invalid` (and the report `incomplete`). For A/B, use `doctor.compareAb({ rounds, poses, applyB, control })` or `compareAbSamples` — **medians**, with a noise band of `max(half-range, 1.4826 × MAD)`. Pass optional `control` A-vs-A rounds (or run A vs A) rather than treating two close A samples as proof. Never claim a win inside the noise band. Pixel-diff before calling a pass visually safe is **opt-in** and **not** implied by `apply: ['safe']`: `optimize({ apply: ['safe'], visualGate: { capture, fixedViewpoint: true } })`. **Capture must use a fixed viewpoint.** Default `maxChangedRatio` is **0.5%** of pixels. A candidate delta is confirmed with a **second** capture; on a reproduced difference vs control, applied passes are **rolled back** (`visualDelta: true` — do not treat as visually safe). Fixed-clock unit tests are not proof of safe passes; see [`docs/superpowers/acceptance/real-host-followups.md`](docs/superpowers/acceptance/real-host-followups.md).

Live ocean attach notes for the unpublished Quality Ladder adapter (this repo does not vendor the demo) are in [`examples/ocean-adapter/README.md`](examples/ocean-adapter/README.md). Pasteable DevTools IIFE: [`examples/live-attach`](examples/live-attach/README.md). Local unpublished hosts (no pelagic) for live-attach discovery: [`examples/acceptance-fixture`](examples/acceptance-fixture/README.md) and the heavier [`examples/acceptance-fixture-game`](examples/acceptance-fixture-game/README.md). How a real game exposes `{ scene, camera, renderer }`: [`docs/superpowers/acceptance/host-integration.md`](docs/superpowers/acceptance/host-integration.md).

Safe passes: `dpr-cap`, `pixel-budget` (no-op unless `qualityTier` is set), `shadow-budget`, `postfx-budget`, `tone-map-lite` / `anisotropy-cap` (same). `frameloop-demand` is **not** in default `SAFE_PASSES`; `apply: ['safe']` / Quality Ladder `safe-auto` include it only for `marketing` / `product` (static). Games and continuous rAF hosts keep the host loop — opt in with `apply: ['frameloop-demand']`. Opt-in destructive: `material-downgrade`, `distance-cull` (`apply: ['aggressive']` or `apply: ['distance-cull']`). `distance-cull` is world-space and **one-shot** — hosts must re-run it as the camera moves; it is not in default `SAFE_PASSES`. See [`docs/superpowers/acceptance/real-host-followups.md`](docs/superpowers/acceptance/real-host-followups.md).

## React Three Fiber

```tsx
import { DoctorCanvas, useDoctor } from '@threejs-doctor/r3f'

<DoctorCanvas profile="product" showOverlay composer={composer} onPixelRatioChange={(ratio) => composer.setPixelRatio(ratio)}>
  {/* scene */}
</DoctorCanvas>
```

`useDoctor()` is available under `DoctorCanvas` (or `DoctorProvider`) and exposes `doctor`, `report`, `runDiagnose()`, and `runOptimize()`. `DoctorCanvas` always passes a `waitFrame` (rAF / `setTimeout(0)`) so GPU timer queries can complete on the default path. Pass `composer` explicitly; discovery is shallow.

## Packages

| Package | Role |
|---------|------|
| `@threejs-doctor/core` | Probe, snapshot, metrics |
| `@threejs-doctor/rules` | Findings + Doctor Score |
| `@threejs-doctor/runtime` | Doctor API + overlay |
| `@threejs-doctor/cli` | CLI bin (`npx @threejs-doctor/cli`) |
| `@threejs-doctor/bench` | Four fixtures + low-end budgets |
| `@threejs-doctor/r3f` | `DoctorCanvas` / `useDoctor` |
| `threejs-doctor` | Unscoped alias (`npx threejs-doctor` → CLI) |

## Bench before/after (low-end budget)

Reproduce (headless fixtures; no GPU). After `pnpm build`:

```bash
pnpm --filter @threejs-doctor/bench test
node packages/cli/bin/threejs-doctor.js bench --profile marketing --budget low --format json
node packages/cli/bin/threejs-doctor.js bench --profile product --budget low --format json
node packages/cli/bin/threejs-doctor.js bench --profile game --budget low --format json
node packages/cli/bin/threejs-doctor.js bench --profile cad --budget low --format json
```

Numbers below are copied from that JSON (`baseline` / `after` / `deltas`, plus Doctor Score). The mock clock is a fixed 16ms tick, so `avgFps` stays 62.5 and is **not** a GPU win. Draw-call counts stay equal because fixtures do not rewrite `renderer.info.render.calls`. Shadow-caster counts **do** change via `shadow-budget`.

| Profile | Metric | Baseline (fixture) | After safe passes | Notes |
|---------|--------|--------------------|-------------------|-------|
| marketing | drawCalls | 90 | 90 (Δ 0) | score 75; applied default safe set (`dpr-cap`, `shadow-budget`, `postfx-budget`, `frameloop-demand` via marketing/static `safePassesFor`; `distance-cull` is opt-in) |
| marketing | renderer DPR | 3 | 1.5 | low-tier `dpr-cap` (`Math.min(prev, 1.5)`); DPR is not a report metric field |
| marketing | shadowCastingLightCount | 2 | 1 (Δ −1) | `shadow-budget` keeps 1 caster on marketing |
| product | drawCalls | 110 | 110 (Δ 0) | score 75; same safe set |
| product | shadowCastingLightCount | 3 | 2 (Δ −1) | `shadow-budget` keeps 2 casters |
| game | shadowCastingLightCount | 4 | 2 (Δ −2) | score 92; `shadow-budget` keeps 2 casters |
| cad | drawCalls | 180 | 180 (Δ 0) | score 85; rules flag draw-call budget |

Paste exact `baseline` / `after` / `deltas` numbers from the bench JSON into release notes — never invent after metrics. If after-measure fails, mark the run incomplete and keep baseline only.

Live Quality Ladder proof is captured per [`docs/superpowers/acceptance/live-ocean-capture.md`](docs/superpowers/acceptance/live-ocean-capture.md); never invent after metrics.

## Telemetry

Off by default. No network reporting in v1.

## License

MIT © codergeeta
