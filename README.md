# threejs-doctor

Doctor + optimizer for Three.js: diagnose scenes with deterministic findings, apply safe runtime optimizations for low-end devices, and prove the win with measurable before/after metrics.

Inspired by [react-doctor](https://github.com/millionco/react-doctor). Design: [`docs/superpowers/specs/2026-09-17-threejs-doctor-design.md`](docs/superpowers/specs/2026-09-17-threejs-doctor-design.md). v2 Quality Ladder: [`docs/superpowers/specs/2026-09-17-threejs-doctor-quality-ladder-design.md`](docs/superpowers/specs/2026-09-17-threejs-doctor-quality-ladder-design.md). Plan: [`docs/superpowers/plans/2026-09-17-threejs-doctor-v1.md`](docs/superpowers/plans/2026-09-17-threejs-doctor-v1.md).

## Install / run

```bash
npx threejs-doctor
npx threejs-doctor scan ./path --format json
npx threejs-doctor bench --profile product --budget low
npx threejs-doctor ci --min-score 70
```

From a git checkout, build first so the CLI bin can load `dist/`:

```bash
pnpm install
pnpm build
node packages/cli/bin/threejs-doctor.js scan ./path --format json
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

CI (`.github/workflows/ci.yml`) runs `typecheck`, `test`, `build`, then `threejs-doctor ci --min-score 0`.

## Runtime (vanilla Three.js)

```ts
import { Doctor } from '@threejs-doctor/runtime'

const doctor = new Doctor({ scene, camera, renderer, profile: 'auto', mode: 'diagnose' })
const baseline = await doctor.measure()
const report = await doctor.diagnose()
const after = await doctor.optimize({ apply: ['safe'] })
doctor.mountOverlay()
```

Safe passes: `dpr-cap`, `shadow-budget`, `postfx-budget`, `frameloop-demand`, `distance-cull`. Opt-in: `material-downgrade`.

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
| `@threejs-doctor/cli` | `npx threejs-doctor` |
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
| marketing | drawCalls | 90 | 90 (Δ 0) | score 75; applied `dpr-cap`, `shadow-budget`, `postfx-budget`, `frameloop-demand`, `distance-cull` |
| marketing | renderer DPR | 3 | 1.5 | low-tier `dpr-cap` (`Math.min(prev, 1.5)`); DPR is not a report metric field |
| marketing | shadowCastingLightCount | 2 | 1 (Δ −1) | `shadow-budget` keeps 1 caster on marketing |
| product | drawCalls | 110 | 110 (Δ 0) | score 75; same safe set |
| product | shadowCastingLightCount | 3 | 2 (Δ −1) | `shadow-budget` keeps 2 casters |
| game | shadowCastingLightCount | 4 | 2 (Δ −2) | score 92; `shadow-budget` keeps 2 casters |
| cad | drawCalls | 180 | 180 (Δ 0) | score 85; rules flag draw-call budget |

Paste exact `baseline` / `after` / `deltas` numbers from the bench JSON into release notes — never invent after metrics. If after-measure fails, mark the run incomplete and keep baseline only.

## Telemetry

Off by default. No network reporting in v1.

## License

MIT © codergeeta
