# threejs-doctor — Design Spec

**Date:** 2026-09-17  
**Status:** Draft for review  
**Owner:** codergeeta  
**Inspiration:** [millionco/react-doctor](https://github.com/millionco/react-doctor)

## Problem

Teams ship Three.js experiences with scattered checklists and blog tips, but there is no strong open-source product that:

1. **Diagnoses** a scene / project with deterministic, actionable findings
2. **Optimizes** at runtime (and later in the asset pipeline) for low-end devices
3. **Proves** the win with measurable before/after metrics

Existing guidance (Discover three.js tips, Utsubo 100 tips, glTF optimizers, ad-hoc SceneOptimizer ideas) is valuable but fragmented. Developers still guess; agents still write slow scenes.

## Goals

- Ship **one product** with two faces from day one: a **doctor CLI** and a **runtime optimizer**
- Make low-end devices a first-class success criterion (smooth frame times, sane draw-call / VRAM budgets)
- Show **before/after** clearly (CLI report, optional overlay, public bench demos)
- Cover **marketing, product configurator, games/worlds, and CAD/architecture** via shared engine + scenario profiles
- Stay **framework-agnostic** (vanilla Three.js is source of truth) with a thin **React Three Fiber** adapter
- Be agent- and CI-friendly (`--format json`, score gates), following react-doctor’s distribution pattern (`npx threejs-doctor`)

## Non-goals (v1)

- Full glTF authoring / DCC suite (integrate or shell out to gltf-transform later)
- Automatic custom shader rewriting
- WebGPU-only path (WebGL is first-class; WebGPU when available)
- Replacing Spector.js / browser GPU debuggers
- Silent mutation of user scenes without a report trail

## Product name & hosting

| Item | Value |
|------|--------|
| Product | `threejs-doctor` |
| CLI | `npx threejs-doctor` |
| Packages | `@threejs-doctor/*` |
| GitHub | `codergeeta/threejs-doctor` |
| License | MIT |
| Language | TypeScript |
| Workspace | pnpm monorepo |

## Architecture overview

```
Scene + Renderer (+ optional R3F bridge)
        │
        ▼
┌───────────────────┐
│  @threejs-doctor/ │
│       core        │  probe, snapshot, metrics, types
└─────────┬─────────┘
          │
    ┌─────┴──────┐
    ▼            ▼
┌─────────┐  ┌──────────┐
│  rules  │  │ runtime  │  diagnose vs optimize
└────┬────┘  └────┬─────┘
     │            │
     └─────┬──────┘
           ▼
     Report / Score / Deltas
           │
     ┌─────┼──────┐
     ▼     ▼      ▼
   CLI   Overlay  CI / agents
```

### Packages

| Package | Role |
|---------|------|
| `@threejs-doctor/core` | Device capability probe, scene snapshot, metric collectors (`renderer.info`, frame timings), shared types |
| `@threejs-doctor/rules` | Deterministic diagnostic rules → findings + score contributions |
| `@threejs-doctor/runtime` | Live optimizer passes (reversible), `Doctor` API, optional HUD overlay |
| `@threejs-doctor/cli` | `npx` entry: scan, bench, CI; human + JSON reports |
| `@threejs-doctor/r3f` | Thin `<DoctorCanvas>` / `useDoctor()` over the same engine |
| `@threejs-doctor/bench` | Four scenario demos + low-end budgets + published before/after numbers |

## Product loop (spine)

1. **Measure** baseline metrics  
2. **Diagnose** via rules → scored findings  
3. **Optimize** via runtime passes (opt-in apply sets)  
4. **Prove** → remeasure + delta table  

Same camera path and sample window for before and after.

## Scenario profiles

v1 covers all four with shared rules; profiles reweight severity and default budgets:

| Profile | Emphasizes |
|---------|------------|
| `marketing` | Mobile DPR, LCP-ish load cost, post-processing budget, battery-friendly frameloop |
| `product` | Hero model materials/textures, shadows, env maps, single-object draw efficiency |
| `game` | Instancing, LOD, particles, per-frame CPU work, many similar meshes |
| `cad` | Draw-call count, BatchedMesh/merge candidates, large unique meshes, shadow cost |
| `auto` | Heuristic pick from snapshot signals |

## Metrics & Doctor Score

### Required metrics (v1)

- Average FPS  
- p95 frame time (ms)  
- Draw calls  
- Triangles  
- Texture count + estimated VRAM  
- Geometry count  
- Active lights / shadow-casting lights  

### Doctor Score (0–100)

Weighted composite from rule severities and budget adherence for the active profile. Higher is healthier. CI can gate on absolute score and/or “no new error-level findings.”

### Before/after contract

Reports must include baseline, after, and deltas for every required metric, plus which passes were applied. If after-measure fails, baseline is retained and the run is marked incomplete — never invent after numbers.

## Rules engine (diagnose)

Deterministic checks over a scene snapshot + renderer info. Each finding includes:

- `id` (stable string, e.g. `shadows/too-many-casters`)  
- `severity`: `info` \| `warn` \| `error`  
- `evidence` (numbers / object names / counts)  
- `message` + suggested fix  
- optional `autoFix` pass id  

### v1 rule groups

1. **Draw calls** — high call count; InstancedMesh / BatchedMesh / merge candidates  
2. **Lights & shadows** — too many lights; expensive PointLight shadows; large shadow maps; `autoUpdate` left on for static scenes  
3. **Materials** — over-unique materials; heavy materials on mobile profile  
4. **Textures** — oversized dimensions; non-POT; wrong color space; high estimated VRAM  
5. **Renderer setup** — uncapped DPR; costly antialias + post stack combo  
6. **Lifecycle** — dispose / leak signals (counts climbing across measures)  
7. **Transforms** — static meshes still on `matrixAutoUpdate`  
8. **Frameloop** — continuous render loop on mostly static marketing/product scenes  

Rules are pure functions over snapshots for unit testing.

## Runtime optimizer (fix)

Ordered, measurable, reversible passes. Default apply set: `safe` only.

| Pass | Behavior |
|------|----------|
| `dpr-cap` | Cap pixel ratio by device tier / profile |
| `shadow-budget` | Disable, shrink map size, or freeze `autoUpdate` |
| `postfx-budget` | Reduce or disable expensive passes on low tier |
| `frameloop-demand` | Prefer demand/invalidation for static scenes |
| `distance-cull` | Hide / deprioritize far objects (conservative) |
| `material-downgrade` | Opt-in only: simpler materials on low-end |

Every applied pass appears in the report. On failure: roll back that pass, continue others, mark `applyFailed`.

**Modes:** `diagnose` \| `optimize` \| `benchmark`

## Public API

```ts
import { Doctor } from '@threejs-doctor/runtime'

const doctor = new Doctor({
  scene,
  camera,
  renderer,
  profile: 'auto', // or marketing | product | game | cad
  mode: 'diagnose',
})

const baseline = await doctor.measure()
const report = await doctor.diagnose()
const after = await doctor.optimize({ apply: ['safe'] })
doctor.mountOverlay()
doctor.unmountOverlay()
```

R3F:

```tsx
import { DoctorCanvas, useDoctor } from '@threejs-doctor/r3f'

<DoctorCanvas profile="product">{/* scene */}</DoctorCanvas>
```

## CLI

```bash
npx threejs-doctor
npx threejs-doctor scan ./path
npx threejs-doctor bench --profile product --budget low
npx threejs-doctor ci
```

- Human-readable report by default  
- `--format json` for coding agents  
- CI installs a gate workflow (react-doctor-inspired) focused on score / new error findings  

Headless bench uses fixture scenes from `@threejs-doctor/bench` when no live app URL is provided.

## Error handling

| Condition | Behavior |
|-----------|----------|
| No WebGL/WebGPU | Clear capability error; static rules only where possible |
| Scene/renderer not ready | Guidance to wait / `compileAsync`; do not emit fake FPS |
| Auto-fix pass throws | Roll back pass; keep successful passes; flag finding |
| After-measure fails | Keep baseline; mark run incomplete |

## Bench demos & budgets

`@threejs-doctor/bench` ships four fixtures (one per profile) and a **low-end budget** mode (e.g. DPR 1, aggressive draw-call target ~50–100 depending on profile).

Public README tables show before/after for each fixture. Numbers must come from reproducible bench commands — never hand-waved marketing stats.

## Testing strategy

- **Unit:** each rule with fixture snapshots  
- **Contract:** measure → optimize → measure deltas stable under seeded fixtures in CI  
- **Bench golden:** four scenario fixtures meet documented low-end budgets  
- **v1 does not require** pixel visual regression; correctness is metric- and finding-based  

## Distribution & DX

- TypeScript throughout  
- pnpm workspaces + changesets (or equivalent) for versioning  
- Agent-oriented JSON output  
- Optional future: `npx threejs-doctor install` skill for coding agents (post-v1 stretch, mirrored from react-doctor)  

## Implementation phases (high level)

Detailed tasks belong in the implementation plan after this spec is approved.

1. **Scaffold** monorepo, package boundaries, CI skeleton  
2. **Core metrics + probe**  
3. **Rules v1** + score  
4. **Runtime passes (safe set)** + overlay  
5. **CLI** scan / report / json  
6. **Bench fixtures** for all four profiles + before/after docs  
7. **R3F adapter**  
8. **CI gate** command  

## Open decisions (explicit defaults)

| Topic | Default for v1 |
|-------|----------------|
| Package publish | Public npm under `@threejs-doctor/*` when ready |
| Telemetry | Off by default (unlike react-doctor); add only with explicit opt-in later |
| Asset pipeline | Document integration points; no full gltf-transform wrapper in v1 |
| WebGPU | Detect and report; optimize path prefers APIs that work on both |

## Success criteria

- `npx threejs-doctor bench --budget low` produces before/after deltas for all four profiles  
- Safe optimize mode improves p95 frame time and/or draw calls on fixtures without breaking the scene  
- Rules catch the checklist failures we care about on synthetic fixtures  
- A vanilla Three.js app can integrate in <10 lines; R3F via `DoctorCanvas`  
- Repo lives at `https://github.com/codergeeta/threejs-doctor` and is maintainable as OSS  

## References

- https://github.com/millionco/react-doctor  
- https://discoverthreejs.com/tips-and-tricks/  
- https://www.utsubo.com/blog/threejs-best-practices-100-tips  
- https://gltf-optimizer.simondev.io/  
- Three.js optimization checklists (community) + `renderer.info` / stats-gl practices  
