# threejs-doctor

Doctor + optimizer for Three.js: diagnose scenes with deterministic findings, apply safe runtime optimizations for low-end devices, and prove the win with measurable before/after metrics.

Inspired by [react-doctor](https://github.com/millionco/react-doctor). Design: [`docs/superpowers/specs/2026-09-17-threejs-doctor-design.md`](docs/superpowers/specs/2026-09-17-threejs-doctor-design.md). v2 Quality Ladder: [`docs/superpowers/specs/2026-09-17-threejs-doctor-quality-ladder-design.md`](docs/superpowers/specs/2026-09-17-threejs-doctor-quality-ladder-design.md). v1 plan: [`docs/superpowers/plans/2026-09-17-threejs-doctor-v1.md`](docs/superpowers/plans/2026-09-17-threejs-doctor-v1.md). v2 plan: [`docs/superpowers/plans/2026-09-17-threejs-doctor-quality-ladder.md`](docs/superpowers/plans/2026-09-17-threejs-doctor-quality-ladder.md).

## Install / run

**Not on npm yet.** Root `package.json` name is `threejs-doctor` (`private: true`). `npx threejs-doctor` / `npm install threejs-doctor` will not install this repo.

### Git install (current)

```bash
git clone https://github.com/codergeeta/threejs-doctor.git
cd threejs-doctor
pnpm install
pnpm build
node packages/cli/bin/threejs-doctor.js bench --profile product --budget low
```

From GitHub (monorepo root, not a published CLI package):

```bash
pnpm add github:codergeeta/threejs-doctor
```

Prefer a clone + `pnpm build` until `@threejs-doctor/*` is published. **TODO:** publish `threejs-doctor` / `@threejs-doctor/*` to npm (reserve the name). Do not invent a registry listing.

### Security

The npm name `threejs-doctor` is unpublished. `npx threejs-doctor` can run a **different** package if someone squats the name. Until we publish, install only from [github.com/codergeeta/threejs-doctor](https://github.com/codergeeta/threejs-doctor).

### CLI status

| Command | Status |
|---------|--------|
| `bench` | Works after `pnpm build` (headless fixtures) |
| `scan` | **Not implemented** — exits 1 with a clear message |
| `ci` | **Not implemented** — exits 1; **not** a working `--min-score` gate |

```bash
node packages/cli/bin/threejs-doctor.js scan ./path --format json   # exits 1
node packages/cli/bin/threejs-doctor.js ci --min-score 70           # exits 1
```

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

CI (`.github/workflows/ci.yml`) runs `typecheck`, `test`, and `build`. It does **not** run `threejs-doctor ci` (that command is not implemented).

## Runtime (vanilla Three.js)

```ts
import { Doctor } from '@threejs-doctor/runtime'

const doctor = new Doctor({
  scene,
  camera,
  renderer,
  profile: 'game', // games: set explicitly; 'auto' pins the first resolution
  mode: 'diagnose',
  // Host rAF is the render path. Omit waitFrame to let Doctor call renderer.render.
  waitFrame: () => new Promise(requestAnimationFrame),
})
// Times the waitFrame / renderFrame / renderer.render between beginFrame and endFrame.
const baseline = await doctor.measure(30)
const report = await doctor.diagnose()
const after = await doctor.optimize({ apply: ['safe'] })
doctor.mountOverlay()
```

`measure()` does not invent GPU times. `gpuFrameTimeMs` is set only when `EXT_disjoint_timer_query_webgl2` returns a query result. Draw-call totals use `renderer.info.autoReset = false` for the sample so EffectComposer passes accumulate. Lights, textures, and render-target VRAM come from the scene graph when dimensions are known (otherwise those fields are omitted).

Hidden tabs and throttled rAF mark the sample `invalid` (and the report `incomplete`). For A/B, use `doctor.compareAb({ rounds, poses, applyB })` or `compareAbSamples` — never claim a win inside the noise band. Pixel-diff before calling a pass visually safe is **opt-in**: `optimize({ apply: ['safe'], visualGate: { capture } })`. Fixed-clock unit tests are not proof of safe passes; see [`docs/superpowers/acceptance/real-host-followups.md`](docs/superpowers/acceptance/real-host-followups.md).

Live ocean attach notes for the unpublished Quality Ladder adapter (this repo does not vendor the demo) are in [`examples/ocean-adapter/README.md`](examples/ocean-adapter/README.md). Pasteable DevTools IIFE: [`examples/live-attach`](examples/live-attach/README.md). Local unpublished hosts (no pelagic) for live-attach discovery: [`examples/acceptance-fixture`](examples/acceptance-fixture/README.md) and the heavier [`examples/acceptance-fixture-game`](examples/acceptance-fixture-game/README.md). How a real game exposes `{ scene, camera, renderer }`: [`docs/superpowers/acceptance/host-integration.md`](docs/superpowers/acceptance/host-integration.md).

Safe passes: `dpr-cap`, `pixel-budget` (no-op unless `qualityTier` is set), `shadow-budget`, `postfx-budget`, `tone-map-lite` / `anisotropy-cap` (same). `frameloop-demand` is **not** in default `SAFE_PASSES`; `apply: ['safe']` / Quality Ladder `safe-auto` include it only for `marketing` / `product` (static). Games and continuous rAF hosts keep the host loop — opt in with `apply: ['frameloop-demand']`. Opt-in destructive: `material-downgrade`, `distance-cull` (`apply: ['aggressive']` or `apply: ['distance-cull']`). `distance-cull` is world-space and **one-shot** — hosts must re-run it as the camera moves; it is not in default `SAFE_PASSES`. See [`docs/superpowers/acceptance/real-host-followups.md`](docs/superpowers/acceptance/real-host-followups.md).

## React Three Fiber

```tsx
import { DoctorCanvas, useDoctor } from '@threejs-doctor/r3f'

<DoctorCanvas profile="product" showOverlay>
  {/* scene */}
</DoctorCanvas>
```

`useDoctor()` is available under `DoctorCanvas` (or `DoctorProvider`) and exposes `doctor`, `report`, `runDiagnose()`, and `runOptimize()`.

## Packages

| Package | Role |
|---------|------|
| `@threejs-doctor/core` | Probe, snapshot, metrics |
| `@threejs-doctor/rules` | Findings + Doctor Score |
| `@threejs-doctor/runtime` | Doctor API + overlay |
| `@threejs-doctor/cli` | CLI bin (git clone; not on npm) |
| `@threejs-doctor/bench` | Four fixtures + low-end budgets |
| `@threejs-doctor/r3f` | `DoctorCanvas` / `useDoctor` |

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
