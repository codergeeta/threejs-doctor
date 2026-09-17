# threejs-doctor v2 — Quality Ladder Design Spec

**Date:** 2026-09-17  
**Status:** Draft for review  
**Owner:** codergeeta  
**Product input:** Kunal + Kickass Dev (locked decisions below)  
**Supersedes (scope):** extends [`2026-09-17-threejs-doctor-design.md`](./2026-09-17-threejs-doctor-design.md); does not replace v1 diagnose / score / safe passes  
**License:** MIT © codergeeta

## Locked product decisions

These are not open. Implementation follows them.

| Topic | Decision |
|-------|----------|
| Goal | World-class Three.js optimizer that delivers **real wins** on heavy demos (not a 100 score when mid-tier budgets are already met) |
| Pipeline | **Progressive load first**, then **runtime quality tiers** — one product loop |
| User-facing modes | `advise` \| `safe-auto` \| `takeover` |
| Design focus / default | **`safe-auto`** (reversible caps + rollback) |
| Success bar (low-end mobile) | **TTFI under ~3s**, then hold **≥30 FPS** |
| Control model | **Hybrid** — generic Three.js caps always; optional `QualityAdapter` for app knobs |
| Architecture | **Quality Ladder** (not split boot/runtime packages, not static source rewrite) |
| Acceptance fixture | [iamtechartist/ocean-simulation](https://github.com/iamtechartist/ocean-simulation) — live attach / real WebGL proof preferred |
| Headless | CI unit tests only; never used as the mobile-quality proof |

---

## 1. Problem / Motivation

v1 shipped a working doctor: probe → snapshot → rules → Doctor Score → reversible runtime passes (`dpr-cap`, `shadow-budget`, `postfx-budget`, `frameloop-demand`, `distance-cull`). That loop is the right spine. It is the wrong **bar** for the scenes we actually care about.

### Ocean already beats v1’s generic caps

[iamtechartist/ocean-simulation](https://github.com/iamtechartist/ocean-simulation) (live: [iamtechartist.github.io/ocean-simulation](https://iamtechartist.github.io/ocean-simulation/)) is a Tessendorf / JONSWAP FFT ocean around a tropical island. It already self-tunes the knobs v1 knows about:

- **DPR:** `Math.min(devicePixelRatio, compact ? 1.35 : 1.6, sqrt(2.7e6 / cssPixels))`, then a runtime loop that drops ratio when `averageFrame > 25 ms` and climbs when `< 17.5 ms`
- **Shadows:** one directional sun, `PCFShadowMap`, `autoUpdate = false`, intervalled `needsUpdate`; compact map size 1536² vs 2048²
- **Draw calls:** instanced trees / palms / rocks / grass; the scene is not a CAD draw-call dump

`Doctor.optimize({ apply: ['safe'] })` against that demo therefore tends to produce **score 100, zero (or cosmetic) deltas**. The report looks like a win. The phone is still dying.

### The real cost is not in v1’s metrics

Measured from the demo source (single `index.html`, three@0.185):

| Cost center | What actually happens | Why v1 misses it |
|-------------|----------------------|------------------|
| **FFT / sim passes** | 3 spectral cascades. Desktop FFT sizes `[128, 256, 128]`. Each cascade: 1 evolve + `2 × log2(N)` butterfly + 1 pack + 1 derive. That is **17 + 19 + 17 = 53** `runPass` calls **per spectrum update**, before foam, spray, caustics, planar reflection, refraction, and the main view | No `simPassCount`. Rules never look at ping-pong RTs |
| **Huge render targets** | Reflection 512–768, refraction at up to 1.25× CSS, caustics **1024² / 1536²** half-float, plus per-cascade ping/displacement/normal targets | `estimatedVramBytes` is often 0 unless the host injects `getSceneStats` |
| **Mesh density** | Water clipmap `angularSegments` 288 (compact) / 448 (desktop) × 256 radial; terrain 320 / 432 segments; extra caustic lattices. Together with instances this is **1M+ triangles** across the shadow + reflection + refraction + main cameras | Triangle *count* may look “in budget” for the `game` profile while four extra views still miss 30 FPS |
| **HDR / load** | Boot `await`s `three` + `OrbitControls` + `HDRLoader` from esm.sh, then **Poly Haven 1k HDR** (`kloofendal_48d_partly_cloudy_puresky_1k.hdr`) before the island even starts generating. First interactive frame is gated on that | No TTFI, no transfer-bytes, no compile timing |
| **App-owned quality** | `effectQuality` lerps 0.55 / 0.8 / 1.0 from frame time and throttles foam / spray / caustics. Compact mode is `matchMedia('(max-width: 700px)')`, not a GPU probe | Doctor cannot turn FFT size, RT scale, mesh LOD, or deferred HDR without an adapter |

A 100 score on this scene is a **false success**. The product promise is a phone that **shows an ocean in ~3 seconds and then holds 30 FPS**, not a green CI badge.

### Headless fixtures cannot be the proof

v1 `@threejs-doctor/bench` fixtures are correct for **unit/contract** tests: seeded snapshots, mock 16 ms clocks, deterministic deltas on shadow casters and DPR. They are the wrong proof for v2:

- Mock clocks keep `avgFps` at 62.5 forever (already documented in the README)
- There is no WebGL, no shader compile, no HDR download, no 53-pass FFT
- `scan` is still a stub that returns score 100 and empty findings

Headless stays for CI. Acceptance for this spec is **live attach** to ocean-simulation (real WebGL). If after-measure cannot run on a GPU, the run is `incomplete` — **never invent after metrics**.

---

## 2. Goals & Non-goals

### Goals (v2)

- One product loop: **boot (progressive load) → interactive → runtime Quality Ladder**
- Real wins on ocean-class demos on **low-end mobile**: TTFI under ~3s, then ≥30 FPS
- **Hybrid control:** generic Three.js caps always fire; optional `QualityAdapter` exposes app knobs (FFT size, RT scale, mesh LOD, deferred HDR)
- Three explicit modes: `advise` | `safe-auto` | `takeover`, default **`safe-auto`**
- Before/after proof that includes **load and sim cost**, not only v1 scene stats
- Keep v1 Doctor (diagnose, score, reversible passes, overlay, CLI, R3F) working unchanged for callers that never opt into the ladder

### Non-goals (v2)

- **Not** splitting `@threejs-doctor/boot` and `@threejs-doctor/runtime-quality` into separate packages
- **Not** static source rewrite (no jscodeshift / string replace of FFT constants in app code)
- **Not** a new published npm package for the ocean adapter (example code may live under `examples/` when implementation starts; unpublished)
- **Not** automatic custom shader rewriting, glTF authoring, or a Spector.js replacement (still v1 non-goals)
- **Not** replacing the demo’s art direction; potato must remain recognizably “this ocean,” not a flat plane
- **Not** claiming GPU FPS / TTFI from GitHub Actions `ubuntu-latest` (no GPU)
- **Not** making Doctor Score the success bar; score stays a hygiene signal
- **Not** implementing `scan` (it remains a stub; see §13)
- **Not** WebGPU-only paths; WebGL is first-class (ocean requires `EXT_color_buffer_float`)

---

## 3. Success criteria

### Primary bar (low-end mobile, live ocean)

Device class for the bar (all of):

- Mobile UA / coarse pointer / `maxTouchPoints ≥ 1`
- `navigator.deviceMemory ≤ 4` when reported, else treat unknown mobile as this class
- `hardwareConcurrency ≤ 8`
- No WebGPU
- CSS viewport ~360×800 logical CSS pixels, DPR ≥ 2
- Network: recorded session; cold cache preferred

On [the live demo](https://iamtechartist.github.io/ocean-simulation/) with Doctor attached in **`safe-auto`**:

1. **TTFI under 3000 ms** — first presented frame where the canvas is visible and orbit controls are attached. HDR / high FFT / high-res caustics are **not** required for TTFI.
2. **Hold ≥30 FPS** after TTFI — `avgFps ≥ 30` and `p95FrameTimeMs ≤ 33.4` over a 90-frame window, sustained for **3 consecutive windows** at the settled tier (see §5). Brief hitches during a tier apply/rollback do not fail the bar; the window after the apply must pass.
3. **Before/after proof** — same camera path, same sample windows. Report includes baseline (app defaults, Doctor attached but ladder idle in `advise` or pre-boot snapshot) and after (settled `safe-auto` tier). Deltas for every metric that was actually sampled. If after-measure fails, **baseline is kept, `incomplete: true`, no invented after numbers**.
4. **Visible work** — at least one of `simPassCount`, drawing-buffer pixels, RT pixel count, or triangle-count-across-views moves in the direction of the bar. A score-only change does not count.

### Modes must behave as specified

| Mode | Must |
|------|------|
| `advise` | Zero scene mutation. Report names the start tier, recommended caps, adapter knobs, and predicted TTFI risk. Overlay is read-only. |
| `safe-auto` | Applies reversible generic caps + reversible adapter knobs. Any failed apply rolls back **that** step, continues, flags `applyFailed`. Default for `QualityController`. |
| `takeover` | Same rollback contract, plus exclusive control of adapter knobs (pauses the host quality loop). Opt-in passes such as `material-downgrade` may run. Still never silent: every apply is in the report. |

### Non-criteria

- Doctor Score 100 is **not** success.
- Headless fixture FPS is **not** success.
- Matching desktop visual fidelity on potato is **not** required.

---

## 4. Architecture Overview

v1 already splits **diagnose** (`@threejs-doctor/rules`) from **optimize** (`@threejs-doctor/runtime` passes). v2 adds a **QualityController** beside `Doctor`, not a second product.

```
Scene + Renderer + optional QualityAdapter
        │
        ▼
┌───────────────────────────────────────┐
│           @threejs-doctor/core        │
│  probe (v2 mobile signals)            │
│  snapshot, metrics (+ TTFI / extras)  │
└───────────────┬───────────────────────┘
                │
        ┌───────┴────────┐
        ▼                ▼
┌─────────────┐   ┌─────────────────────┐
│    rules    │   │      runtime        │
│  (v1 score) │   │  Doctor (v1)        │
└─────────────┘   │  QualityController  │
                  │    ├ generic passes │
                  │    ├ ladder / hyst. │
                  │    └ adapter calls  │
                  └──────────┬──────────┘
                             ▼
                    Report / Overlay / CLI
```

### Why Quality Ladder (and not the alternatives)

| Approach | Verdict |
|----------|---------|
| **A. Quality Ladder (chosen)** | One controller, four named tiers, hysteresis, boot then runtime. Matches how the ocean demo already thinks (`compact`, `effectQuality`, adaptive DPR) without forking the repo. |
| **B. Split boot + runtime packages** | Rejected. Two packages, two version matrices, two APIs for one loop. Boot state is just `phase: 'boot' \| 'runtime'` on the same controller. |
| **C. Static source rewrite** | Rejected. FFT sizes, RT allocations, and HDR `await` are app structure. Rewriting `index.html` is brittle, irreversible, and useless for live attach. Adapter knobs exist specifically so we do not parse shaders. |

### Package layout (no new publishable package)

| Package | v2 additions |
|---------|----------------|
| `@threejs-doctor/core` | `QualityTier`, extra metric fields, probe inputs (`deviceMemory`, mobile, float-buffer extensions), `startTier` helper |
| `@threejs-doctor/runtime` | `QualityController`, `QualityAdapter` types, v2 generic passes, boot helper |
| `@threejs-doctor/rules` | No new success bar. Optional info-level findings (`quality/heavy-sim-passes`) only if extras were **actually reported** |
| `@threejs-doctor/r3f` | Unchanged in the first implementation phases. Later: pass `qualityMode` / `adapter` into `DoctorCanvas` (YAGNI until vanilla API is proven) |
| `@threejs-doctor/cli` | Scan stays stub. Bench may grow load-metric **fields** later (null in headless) |
| `@threejs-doctor/bench` | Existing four fixtures remain CI unit food. Ocean is **not** vendored here |
| `examples/ocean-adapter` | Lands with implementation, unpublished. Until then the TypeScript in §9 is the contract |

`Doctor` remains the public diagnose/optimize object. `QualityController` **uses** a `Doctor` (measure, diagnose, overlay refresh, pass registry). Callers who only want v1 never construct a controller.

---

## 5. Quality Ladder

Four named tiers. Names are user-facing (overlay, JSON `tier`).

| Tier | Intent | When the probe starts here |
|------|--------|----------------------------|
| `potato` | First paint and 30 FPS on low-end mobile. Deferred HDR, smallest FFT, coarsest mesh, smallest RTs | Mobile + (deviceMemory ≤ 4 OR cores ≤ 4 OR missing `OES_texture_float_linear`) |
| `low` | Compact-class ocean: the demo’s own `max-width: 700px` budget, plus Doctor floors | Other mobile, or desktop with probe tier `low` |
| `mid` | Desktop-default ocean quality, still capped pixel budget | Probe `mid`, or potato/low after successful climb |
| `high` | Host defaults; Doctor only keeps reporting and emergency drop | Probe `high` **and** not mobile. Potato-class devices **never climb to `high`** unless `maxTier: 'high'` is set |

### Generic caps per tier

Applied even with **no** adapter. Values are ceilings; if the host is already lower, do not raise.

| Cap | potato | low | mid | high |
|-----|--------|-----|-----|------|
| `pixelRatio` | `min(current, 1.0)` | `min(current, 1.25)` | `min(current, 1.5)` | `min(current, 2)` |
| Drawing-buffer pixels | 1.2e6 | 2.0e6 | 2.7e6 | no new cap |
| Shadow casters | 0; `shadowMap.enabled = false` | 1 | 2 | profile default (v1) |
| Post-FX | off | off | host / v1 `postfx-budget` | host |
| `toneMapping` | `NoToneMapping` | `LinearToneMapping` | host (ocean: ACES) | host |
| Anisotropy | 1 | 1 | 4 | host |

`frameloop-demand` still applies only for `marketing` / `product` profiles (ocean is `game`: continuous).

### Adapter knobs per tier (ocean contract)

Used when a `QualityAdapter` advertises the capability. Doctor never invents FFT internals.

| Knob | potato | low | mid | high |
|------|--------|-----|-----|------|
| `fftSize` (3 cascades) | `[64, 0, 0]` — one cascade, skip sea + short sea | `[128, 128, 128]` (demo compact) | `[128, 256, 128]` (demo desktop) | same as mid |
| Spectrum cadence | every 2nd frame | every frame | every frame | every frame |
| `rtScale` | 0.35 vs demo desktop RT sizes | 0.50 | 0.70 | 1.0 |
| `meshLod` | 0 — water ~192×128, terrain ~192, caustic lattice off | 1 — demo compact (288×256 water, terrain 320, caustics 1024) | 2 — demo desktop (448×256, terrain 432, caustics 1536) | 2 |
| `deferredHdr` | true — procedural sky until **after** TTFI, then 1k HDR | true | false if TTFI budget still holds, else true | false |
| Expected `simPassCount` (documentation only) | ~15 on update frames, 0 on skip frames | ~51 | ~53 | ~53 |

`simPassCount` in reports comes **only** from `adapter.readExtras()`. The table above is for implementers, not a fill-in value.

### Hysteresis (climb / drop)

All windows are **90 consecutive frames** after TTFI. Frame time is `p95FrameTimeMs` from `MetricsCollector` (same collector as v1).

| Event | Rule | Action |
|-------|------|--------|
| Emergency drop | 1 window with p95 ≥ 50 ms (≤20 FPS) | Drop **one** tier immediately; reset climb counters; start cooldown |
| Drop | 2 consecutive windows with p95 > 33.4 ms (below 30 FPS) | Drop one tier |
| Climb | 3 consecutive windows with p95 ≤ 22 ms (~45 FPS) **and** `phase === 'runtime'` **and** cooldown elapsed **and** `tier < maxTier` | Climb one tier |
| Cooldown | After any drop or failed apply | 2 windows with no climb |
| Floor / ceiling | — | Never below `potato`. Never above `maxTier` (`mid` on potato-class devices, else `high`) |
| During boot | — | **No climb.** Drops are allowed if the first interactive windows already miss 30 FPS |
| Apply failure | Adapter or pass throws | Rollback that step only; treat as drop-triggering if FPS is still below target; mark `applyFailed` |

Climb applies **one rung per successful window-set**, then remeasures. No jumping `potato` → `mid`.

Dual-controller rule: the demo already adapts DPR and `effectQuality`.

- **`safe-auto`:** Doctor sets **ceilings** (DPR, pixel budget, adapter caps). It does not run a second competing lerp. If the host later raises DPR above the ceiling, the next ladder tick clamps it back.
- **`takeover`:** adapter `takeExclusiveControl()` pauses the host loop (`effectQuality` frozen, host DPR loop skipped). Doctor is the only climber/dropper.
- **`advise`:** neither clamps nor pauses.

---

## 6. Boot phase vs Runtime phase product loop

One controller, two phases. Same report object.

```
markBootStart()
    │
    ▼
probeDevice → startTier + maxTier
    │
    ▼
apply startTier (generic caps, then adapter knobs)
    │  deferredHdr: skip HDR await
    │  compile: do not block on compileAsync of unused materials
    ▼
first present + controls attached  →  record TTFI   phase = 'runtime'
    │
    ▼
measure 90-frame windows
    │
    ├─ miss 30 FPS → drop (hysteresis)
    ├─ headroom    → climb (hysteresis)
    └─ settled     → final after-measure + deltas
```

### Boot (progressive load)

Goal: **TTFI under 3s** on the device class in §3.

Controller does, in order:

1. `markBootStart(now)` — default `performance.now()`.
2. Probe and resolve `startTier` (low-end mobile → `potato`).
3. Apply generic caps for that tier **before** the first `renderer.render`.
4. Call `adapter.apply(startTier, knobs)` when registered. HDR load is a boot knob: if `deferredHdr`, the host must not `await` the Poly Haven file on the critical path. Procedural / already-decoded sky is enough for first paint.
5. Optional sliced compile: if `renderer.compileAsync` exists, schedule it **after** first present. Missing API → omit `compileMs` (do not fake it).
6. First interactive frame: canvas presented, controls attached, loader may still fade. Record `ttfiMs`.
7. Switch `phase` to `'runtime'`. Do not climb this frame.

Bytes: if `PerformanceObserver` / resource timing is available, sum transferred bytes for scripts + HDR + textures since `markBootStart` into `bytesLoaded`. If the observer is missing, **omit the field**.

### Runtime (quality tiers)

Goal: **hold ≥30 FPS**, climbing only with hysteresis.

Each tick (once per window, not per frame):

1. `doctor.measure()` for the window.
2. Evaluate hysteresis (§5).
3. If tier changes: apply generic delta, then adapter delta; both reversible.
4. Remeasure one window before considering another climb.
5. Stop when: target held for 3 windows at current tier, or at floor still failing (report `floorFailed: true` — honest miss, not a fake 100).

Boot and runtime share the same `appliedPasses` / `appliedKnobs` / `failedPasses` arrays. The report’s `phase` field is the phase **at settle**, plus `ttfiMs` from boot.

---

## 7. Modes

v1 `Doctor` modes (`diagnose` | `optimize` | `benchmark`) stay. Quality modes are a separate field on `QualityController`.

| Quality mode | Mutations | Adapter | Host quality loop | Overlay |
|--------------|-----------|---------|-------------------|---------|
| `advise` | None | `snapshot()` + `capabilities()` only | Untouched | Recommendations, no Apply |
| `safe-auto` (default) | Reversible generic caps + reversible advertised knobs | `apply` / `rollback` per step | Still runs, but cannot exceed Doctor ceilings | Live tier, TTFI, FPS, rollback control |
| `takeover` | `safe-auto` plus opt-in passes (`material-downgrade`) and exclusive adapter control | `takeExclusiveControl()` then `apply` | Paused until `releaseExclusiveControl()` on dispose/rollback-all | Same as safe-auto + “exclusive” badge |

Rollback-all restores host loop and every knob/pass, in reverse apply order. `advise` has nothing to roll back.

Default when the option is omitted: **`safe-auto`**.

Mapping for existing callers:

```ts
new Doctor({ mode: 'diagnose' })           // v1, no ladder
new QualityController(doctor)              // safe-auto ladder
new QualityController(doctor, { mode: 'advise' })
```

---

## 8. Generic safe passes (v1 + v2)

### v1 (unchanged ids, still the `safe` token)

| Pass | Notes |
|------|-------|
| `dpr-cap` | v2 reads the **ladder tier**, not only `device.tier`. potato cap is 1.0 (v1 low was 1.5). |
| `shadow-budget` | potato: 0 casters and `shadowMap.enabled = false` when the renderer exposes it. |
| `postfx-budget` | potato + low: force off. |
| `frameloop-demand` | Unchanged (marketing/product only). |
| `distance-cull` | Unchanged. Conservative; ocean water mesh is one object so this will not gut the sea. |

`material-downgrade` stays **opt-in**, not in `safe`. `takeover` may include it.

### v2 additions (generic, no adapter)

| Pass | Behavior | In `safe`? |
|------|----------|------------|
| `pixel-budget` | Cap `drawingBufferWidth × drawingBufferHeight` via `setPixelRatio` / `setDrawingBufferSize` using the tier table in §5. Restore previous ratio and size on rollback. | yes |
| `tone-map-lite` | Set `renderer.toneMapping` to the tier value when the property exists. Rollback to previous enum. | yes |
| `anisotropy-cap` | Traverse materials/textures; cap `anisotropy`. Store previous values. Skip objects without the property. | yes |

No generic FFT pass. No generic “find all `WebGLRenderTarget`s and `setSize`” walk — Three.js does not give a reliable global registry; shrinking the wrong target (shadow map, FFT ping) without the host is unsafe. **RT scale is an adapter knob.**

Safe apply order (boot and each rung): `dpr-cap` → `pixel-budget` → `shadow-budget` → `postfx-budget` → `tone-map-lite` → `anisotropy-cap` → `frameloop-demand` → `distance-cull` → adapter knobs. `pixel-budget` may lower DPR further after `dpr-cap`; it must not raise it.

Pass failure contract is v1: roll back that pass, continue others, `failedPasses[]`. `boot()` applies this list for `startTier` **before** the first present. It does not call `Doctor.optimize()` (that path measures 30 frames first, which would delay TTFI).

---

## 9. QualityAdapter interface and ocean adapter

### TypeScript sketch (contract)

```ts
export type QualityTier = 'potato' | 'low' | 'mid' | 'high'

export type AdapterCapability =
  | 'fftSize'
  | 'rtScale'
  | 'meshLod'
  | 'deferredHdr'
  | 'simPassCount'

export interface QualityKnobSet {
  fftSize?: number[]        // per cascade; 0 = skip cascade
  spectrumEveryNFrames?: number
  rtScale?: number          // 0–1 vs host desktop defaults
  meshLod?: 0 | 1 | 2
  deferredHdr?: boolean
}

export interface AdapterExtras {
  simPassCount?: number     // last spectrum update; omit if unknown
  bytesLoaded?: number
  compileMs?: number
}

export interface KnobHandle {
  rollback(): void
}

export interface QualityAdapter {
  readonly id: string
  capabilities(): AdapterCapability[]
  snapshot(): QualityKnobSet
  /**
   * Apply only advertised knobs present in `knobs`.
   * Unsupported keys are ignored (controller records `unsupportedKnob`).
   * Must be synchronous about GPU reallocations it performs; throw on hard failure
   * so the controller can rollback.
   */
  apply(tier: QualityTier, knobs: QualityKnobSet): KnobHandle
  readExtras?(): AdapterExtras
  takeExclusiveControl?(): { release(): void }
}
```

Controller rules:

- Never call `apply` in `advise`.
- Never fill extras the adapter did not return.
- If `capabilities()` omits `fftSize`, do not pass `fftSize`.
- Reallocating RTs/meshes is the **adapter’s** job (ocean must rebuild `SpectralCascade` ping targets when N changes).

### Ocean adapter capabilities

The live demo is a single-file app with `window.pelagic.debug` (`renderer`, `scene`, `cascades`, `reflectionTarget`, `refractionTarget`, `causticWide`, `causticDetail`, water mesh, `effectQuality`). The adapter is a **thin wrapper around that debug handle**, not a fork of the demo into this repo.

| Capability | How the adapter implements it | potato / low / mid / high |
|------------|-------------------------------|---------------------------|
| `fftSize` | Recreate or resize each `SpectralCascade` to N; `0` disposes that cascade and binds a 1×1 black texture into the water material | `[64,0,0]` / `[128,128,128]` / `[128,256,128]` / `[128,256,128]` |
| `rtScale` | `reflectionTarget.setSize`, `refractionTarget.setSize`, caustic targets scaled from demo desktop sizes | 0.35 / 0.50 / 0.70 / 1.0 |
| `meshLod` | Replace water `PlaneGeometry` / clipmap segments and terrain segment density; disable detail caustics at lod 0 | 0 / 1 / 2 / 2 |
| `deferredHdr` | First paint uses a constant or procedural sky; `HDRLoader.loadAsync` starts after TTFI and swaps `uSkyMap` | true / true / false / false |
| `simPassCount` | Count `runPass` inside `updateSpectrum` (or wrap `runPass`) for the last update | reported, never guessed |

`takeExclusiveControl` (takeover only): freeze `effectQuality` at the value matching the tier, no-op the demo’s 180-frame DPR lerp, restore both on `release`.

If a future demo build removes `window.pelagic.debug`, the adapter reports `capabilities: []` and the ladder still runs **generic** caps. Acceptance then documents “adapter unavailable” rather than inventing FFT deltas.

---

## 10. Metrics & reporting

v1 required metrics stay. v2 adds load/sim fields that are **omitted when not measured**.

### Required (v1, still always present)

`avgFps`, `p95FrameTimeMs`, `drawCalls`, `triangles`, `textureCount`, `estimatedVramBytes`, `geometryCount`, `lightCount`, `shadowCastingLightCount`

### v2 fields

| Field | Source | If unavailable |
|-------|--------|----------------|
| `ttfiMs` | `firstInteractiveNow - bootStartNow` | omit; run may still be runtime-only |
| `bytesLoaded` | Resource Timing since boot start | omit |
| `compileMs` | Sum of hooked `compile` / `compileAsync` durations | omit |
| `simPassCount` | `adapter.readExtras().simPassCount` | omit |
| `tier` | Controller | always present once ladder runs |
| `phase` | `'boot' \| 'runtime'` | always present once ladder runs |
| `qualityMode` | `advise` \| `safe-auto` \| `takeover` | always present |
| `drawingBufferPixels` | `drawingBufferWidth * drawingBufferHeight` | omit if renderer lacks drawing buffer |
| `Doctor Score` | v1 `computeDoctorScore` | always present; **not** the success bar |

### Before/after contract (unchanged, extended)

- Every **present** numeric field has `baseline`, `after`, `deltas`.
- Fields omitted at baseline stay omitted after (do not appear as `0` to look like a win).
- After-measure throw → `incomplete: true`, no `after`, no `deltas`.
- **Never invent after metrics.** That includes never substituting the §5 “expected ~53 passes” table into `simPassCount`.

JSON report adds `appliedKnobs`, `failedPasses`, `unsupportedKnobs`, `floorFailed`. Human report prints TTFI and tier on the first lines, then the v1 delta table, then extras that exist.

---

## 11. Device probe enhancements

v1 `probeDevice` uses `devicePixelRatio`, `hardwareConcurrency`, `maxTextureSize`, `webgl`, `webgpu` and maps to `low | mid | high`. That mapping sends almost every phone to `low`, which then applies v1 `dpr-cap` of 1.5 — already weaker than ocean compact (1.35).

### New inputs (all optional; missing → conservative)

```ts
export interface DeviceProbeInput {
  devicePixelRatio: number
  hardwareConcurrency: number
  maxTextureSize: number
  webgl: boolean
  webgpu: boolean
  deviceMemory?: number            // navigator.deviceMemory
  maxTouchPoints?: number
  coarsePointer?: boolean          // matchMedia('(pointer: coarse)')
  prefersReducedData?: boolean
  colorBufferFloat?: boolean       // EXT_color_buffer_float
  floatLinear?: boolean            // OES_texture_float_linear
  maxRenderbufferSize?: number
}
```

`WEBGL_debug_renderer_info` (unmasked vendor/renderer) is **off**. Do not request it. GPU-string blocklists wait for a later spec if we have evidence the signals above mis-classify.

### Outputs

`DeviceCapabilities` keeps `tier: 'low' | 'mid' | 'high'` for v1 rules.

New helper `resolveStartTier(caps, opts) → { startTier, maxTier, mobile }`:

| Condition | `startTier` | `maxTier` |
|-----------|-------------|-----------|
| `!webgl` | n/a — capability error, static rules only | n/a |
| `webgl` && `colorBufferFloat === false` | `potato` + finding `quality/no-float-rt` | `potato` |
| Mobile and (`deviceMemory ≤ 4` or cores ≤ 4 or `floatLinear === false`) | `potato` | `mid` |
| Mobile otherwise | `low` | `mid` |
| Desktop v1 `low` | `low` | `high` |
| Desktop v1 `mid` | `mid` | `high` |
| Desktop v1 `high` | `high` | `high` |

Mobile heuristic (any one): `maxTouchPoints ≥ 1`, `coarsePointer === true`, or `deviceMemory` reported and ≤ 8 with `devicePixelRatio ≥ 2` and cores ≤ 8. Prefer feature signals over UA strings.

v1 `classifyTier` arithmetic is unchanged so existing unit tests stay valid. `resolveStartTier` is additive.

---

## 12. Public API sketches

```ts
import { Doctor, QualityController } from '@threejs-doctor/runtime'
import type { QualityAdapter, QualityTier } from '@threejs-doctor/core'

const doctor = new Doctor({
  scene,
  camera,
  renderer,
  profile: 'game',
  mode: 'optimize',
})

const oceanAdapter: QualityAdapter = { /* §9 */ }

const ladder = new QualityController(doctor, {
  mode: 'safe-auto',          // default
  startTier: 'auto',          // default: resolveStartTier(probe)
  maxTier: 'auto',            // default: from probe
  ttfiBudgetMs: 3000,
  targetFps: 30,
  windowFrames: 90,
})

ladder.registerAdapter(oceanAdapter)

const boot = await ladder.boot()       // probe, apply start tier, wait TTFI
// boot.ttfiMs, boot.tier, boot.incomplete

const settled = await ladder.runLadder()
// settled.tier, settled.baseline, settled.after, settled.deltas,
// settled.appliedPasses, settled.appliedKnobs, settled.score

ladder.setMode('advise')               // next run is read-only
doctor.mountOverlay()                  // overlay reads controller when attached
ladder.dispose()                       // rollback-all + releaseExclusiveControl
```

`boot()` without a registered adapter still applies generic caps. `runLadder()` without `boot()` calls `boot()` first.

R3F (later phase, not required to start implementation):

```tsx
<DoctorCanvas profile="game" qualityMode="safe-auto" adapter={oceanAdapter} showOverlay>
  {/* scene */}
</DoctorCanvas>
```

Until that lands, R3F apps construct `QualityController` in `useEffect` next to `useDoctor()`.

---

## 13. Overlay / CLI implications

### Overlay

v1 overlay: `Doctor Score {n} | {deltas}`.

v2, when a controller is attached, the same HUD adds a second line. No new overlay framework.

```
Doctor Score 92 · game · safe-auto · potato→low
TTFI 1840ms · 32 FPS p95=31ms · simPasses 51 · bytes 3.1MB
```

- `advise`: prefix `ADVISE` and do not show a rollback button.
- `safe-auto` / `takeover`: show current tier and last apply/rollback.
- Omit `simPasses` / `bytes` / `TTFI` tokens when those fields are absent.
- Score is displayed; copy must not say “healthy” solely because score is 100.

### CLI

| Command | v2 |
|---------|----|
| `npx threejs-doctor scan` | **Still a stub** (score 100, empty findings, zeroed baseline). Documented as non-authoritative. No static FFT/HDR analysis in v2. |
| `npx threejs-doctor bench` | Still headless fixtures. **Later** the JSON schema may include `ttfiMs` / `bytesLoaded` as `null` so agents do not treat missing keys as errors. Filling those from fixtures is forbidden. |
| `npx threejs-doctor ci` | Still score / error-finding / incomplete gates on the stub-or-fixture report. Does **not** gate TTFI or 30 FPS. |

Live ocean proof is a **runtime attach** (bookmarklet, snippet, or local Playwright against the live URL), not `scan ./ocean`.

---

## 14. Testing strategy

### Unit (CI, headless, required)

- Hysteresis: drop on 2 slow windows, emergency drop on 1 very slow window, climb only after 3 fast windows, no climb during boot, cooldown after drop, clamp to `maxTier`, no jump of two rungs.
- Modes: `advise` never calls `adapter.apply` or pass `apply`; `safe-auto` rollbacks a throwing pass and continues; `takeover` calls `takeExclusiveControl` and `release` on dispose.
- Metrics: after-measure throw → `incomplete`, no `after`; extras omitted when adapter silent; never default `simPassCount` to 53.
- Probe: potato start on mobile + 4 GB / 4 cores; desktop high unchanged vs v1 tests.
- Generic v2 passes: pixel-budget / tone-map-lite / anisotropy-cap rollback restores previous values.

Fake clocks and fake adapters. No WebGL.

### Live ocean acceptance (not GitHub Actions)

Preferred: real device or WebGL-capable browser against `https://iamtechartist.github.io/ocean-simulation/`.

1. Attach Doctor + ocean adapter (snippet using `window.pelagic.debug`).
2. `advise` pass: capture baseline TTFI/FPS/score/deltas (expect score may already be high; FPS/TTFI are the story).
3. `safe-auto` pass: cold load, record `ttfiMs`, settle ladder, record FPS windows and extras.
4. Compare to the §3 bar. Store the JSON next to the run notes. If WebGL is missing, mark skipped — **do not paste fixture numbers**.

Optional local Playwright with a real GPU is allowed for humans. It is not a required CI job in v2.

### CI headless (keep green)

Existing vitest + `threejs-doctor ci --min-score 0`. No new GPU job. Bench golden files stay v1 scene-stat contracts.

---

## 15. Implementation phases (YAGNI)

Detailed tasks belong in a later implementation plan. This spec orders the work so each phase is shippable without the next.

| Phase | Deliverable | Stop if |
|-------|-------------|---------|
| **0. Types + hysteresis** | `QualityTier`, window state machine, unit tests with a fake clock. No WebGL. | Hysteresis tests fail |
| **1. Probe startTier** | `resolveStartTier` + deviceMemory / mobile / float extensions. v1 `classifyTier` untouched. | v1 probe tests regress |
| **2. QualityController boot** | `boot()`, `ttfiMs`, generic start-tier caps, `advise` vs `safe-auto` mutation gate | TTFI not recorded on a fake `onFirstFrame` hook |
| **3. Generic v2 passes** | `pixel-budget`, `tone-map-lite`, `anisotropy-cap` wired into `safe`; potato shadow-off via existing `shadow-budget` | Rollback tests fail |
| **4. Adapter interface** | `registerAdapter`, `appliedKnobs`, `unsupportedKnob`, extras passthrough | Controller fills extras itself |
| **5. Runtime `runLadder`** | Drop/climb against real `measure()` windows; overlay second line | Climb during boot or two-rung jumps |
| **6. Ocean example adapter** | Unpublished `examples/ocean-adapter` wrapping `window.pelagic.debug`; live attach notes in README | Forking ocean-simulation into this repo |
| **7. Live acceptance notes** | Checked-in sample **schema** (not numbers) + how to capture JSON on a phone | Checking in invented FPS |
| **8. Stretch** | R3F `qualityMode` prop; bench JSON null load fields; takeover exclusive-control tests against a fake host loop | Anything that blocks 0–7 |

Do not start glTF pipelines, shader rewrites, `scan` AST, WebGPU-only FFT, or a second package in these phases.

---

## 16. Open decisions

Only items that remain genuinely open. Each has a **default** so implementation does not stall.

| Topic | Default if nobody revisits | Why it is still open |
|-------|----------------------------|----------------------|
| Nightly Playwright against the live URL | **Off.** Humans run live attach. CI stays headless. | Needs a GPU runner and consent to depend on GitHub Pages availability |
| Adapter when `pelagic.debug` shape changes | **Degrade to generic caps** and set `adapterUnavailable: true` | Demo is a third-party single file; we do not pin their debug API in Doctor core |
| Sliced `compileAsync` | **Hook if present after TTFI; otherwise omit `compileMs`** | Three.js compile APIs differ by version; ocean may not call them |
| Potato single-cascade visual bar | **Must still read as water (displacement on), not a flat unlit quad** | Exact 64² look is subjective; acceptance is TTFI/FPS plus “still an ocean” |
| Publishing `@threejs-doctor/ocean-adapter` | **Do not publish in v2.** Example only. | One demo is not a package ecosystem |

Locked items from the product table at the top are **not** listed here.

---

## 17. References

- v1 design: [`docs/superpowers/specs/2026-09-17-threejs-doctor-design.md`](./2026-09-17-threejs-doctor-design.md)
- v1 plan: [`docs/superpowers/plans/2026-09-17-threejs-doctor-v1.md`](../plans/2026-09-17-threejs-doctor-v1.md)
- This repo: https://github.com/codergeeta/threejs-doctor
- Ocean fixture (source): https://github.com/iamtechartist/ocean-simulation
- Ocean fixture (live): https://iamtechartist.github.io/ocean-simulation/
- Ocean stack notes used in §1: three@0.185, JONSWAP 3-cascade FFT, Poly Haven `kloofendal_48d_partly_cloudy_puresky_1k.hdr`, `window.pelagic.status` / `debug`
- Distribution inspiration: https://github.com/millionco/react-doctor
- Tessendorf, *Simulating Ocean Water* (FFT ocean baseline the demo implements)
- License: MIT © codergeeta
