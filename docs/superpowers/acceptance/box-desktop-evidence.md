# Box-desktop ocean evidence (not the §3 bar)

Live Quality Ladder attach on a **box-desktop** WebGL host against
[ocean-simulation](https://iamtechartist.github.io/ocean-simulation/). This is
**not** the phone-class device in [live-ocean-capture.md](./live-ocean-capture.md)
§1 and is **not** spec §3 bar proof (TTFI under 3s, then hold ≥30 FPS).

Capture JSON stays **off-repo**. Numbers below are the measured fields from those
runs. Fields that were not copied here (`ttfiMs`, `simPassCount`,
`drawingBufferPixels`, and any sample key not listed) are omitted — do not fill
them in.

Doctor Score is hygiene, not success. Settled `avgFps` is still ≪ 30.

## Host

- Class: box-desktop (not mobile UA / coarse pointer / 4 GB / ~360×800 DPR≥2)
- Fixture: live ocean-simulation only (not vendored)
- Attach: unpublished `examples/live-attach` IIFE, `profile: 'game'`
- Probe: `startTier` **low** (desktop low), recommended drop to **potato**

Paste-after-load does not measure cold-load TTFI. `ttfiMs` is not recorded here.

## Pass A — `advise`

Read-only. Overlay stays advise. `advise` must not mutate the scene.

| Field | Measured |
|-------|----------|
| score | 100 |
| startTier | `low` |
| recommendedTier | `potato` |
| baseline `avgFps` | ~0.50 |
| baseline `p95FrameTimeMs` | ~2000 |
| after `avgFps` | ~0.64 |
| after `p95FrameTimeMs` | ~1566 |

Score 100 with `avgFps` ~0.5 is a false-looking win. The small baseline→after
FPS change is the same sample windows on a read-only pass, not a claimed
optimization. `p95FrameTimeMs` ~1566–2000 is still far above 33.4.

`drawCalls` / `triangles` were not supplied for this write-up. Do not invent them.

## Pass B v4 — `safe-auto`

Overlay led with **`FLOOR FAILED`**. Report `floorFailed: true`. FPS still ≪ 30.

Applied potato knobs (no `rtScale`, no `meshLod`):

- `fftSize`: `[64, 0, 0]`
- `spectrumEveryNFrames`: 4
- `deferredHdr`: true

| Field | Baseline | After |
|-------|----------|-------|
| `avgFps` | 0.649 | 0.773 |
| `p95FrameTimeMs` | 4034 | 1718 |
| `drawCalls` | 65 | 29 |
| `triangles` | 912574 | 912502 |

`avgFps` 0.773 and `p95FrameTimeMs` 1718 still miss `avgFps ≥ 30` /
`p95FrameTimeMs ≤ 33.4`. Draw calls moved (65→29); triangle count barely moved
(912574→912502). This is an honest potato-floor miss on box-desktop, not a §3
pass.

## Iteration (why these knobs)

Earlier potato applies on this host were unsafe. Pass B v4 is the run after
those guards. No extra FPS numbers from the broken runs are recorded here.

1. **`meshLod` object-spread destroyed `BufferGeometry`.** Spreading Three.js
   geometry replaced host meshes with plain objects and collapsed the render
   path. Potato knobs omit `meshLod`; the adapter no-ops mesh replace.
2. **`rtScale` caused `FRAMEBUFFER_INCOMPLETE`.** Potato `rtScale` `setSize`
   left incomplete framebuffers. Potato knobs omit `rtScale`.
3. **`FLOOR FAILED` overlay.** The HUD prefixes `FLOOR FAILED ·` ahead of
   `Doctor Score …` and the report sets `floorFailed` (plus
   `quality/floor-failed`) so a hygiene score of 100 cannot fake a win.

## Additional hosts (box-desktop)

No FPS / after metrics are recorded for these hosts. They are not ladder
captures.

### Claude-of-Tanks (https://cot.kevinliu.studio/)

- Status: **BLOCKED** on scene discovery **and** box resources
- Error: could not find scene/camera/renderer (bundled closures). Improved
  live-attach discovery still may miss fully closed-over handles; explicit
  `attachQualityLadder({ scene, camera, renderer })` required from page console
  until host hooks exist.
- Additional note (second attempt): combat rendered, then ~125 canvases, then
  Chrome discarded the tab under memory pressure during attach evaluation —
  **no report**. Treat as box-resource blocked as well as discovery-blocked.

### Kinema (https://kinema-play.vercel.app/?forceWebGL=1)

- Status: **BLOCKED**
- Observed: canvas/WebGL context present but no discoverable
  renderer/scene/camera; console showed WebGPU initialization despite
  `forceWebGL=1` query.
- Not a valid WebGL ladder capture until WebGL path is confirmed and handles
  are injectable.

### Catapult (https://sina-ghiasi.github.io/threejs-catapult-game/)

- Status: **BLOCKED** on scene discovery
- Observed: canvas present, **no** discoverable scene/camera/renderer handles
- No FPS / after metrics recorded
- Needs explicit `attachQualityLadder({ scene, camera, renderer })` or a
  `window.__THREEJS_DOCTOR_HOST__` hook

### Apophenoth (https://izzoizzoizzo.github.io/Apophenoth/)

- Not used: live URL **404**

### What is injectable on this box today

Among **external** hosts tried here, **only ocean-simulation is fully
injectable** (`window.pelagic.debug`). Tanks, Kinema, and catapult are not:
they need explicit inject or host hooks.

## In-repo acceptance-fixture (not phone-class, not an external game)

Local unpublished [`examples/acceptance-fixture`](../../../examples/acceptance-fixture/README.md)
on this VM (`pnpm --filter @threejs-doctor/acceptance-fixture dev` →
http://127.0.0.1:5174/). Vanilla Three.js, `window.__THREEJS_DOCTOR_HOST__`,
**no** `window.pelagic`. Paste `examples/live-attach/dist/attach.iife.js`.
This is an injectability + generic-caps check, **not** spec §3 and **not** an
external-host proof.

Capture JSON is off-repo
(`/opt/cursor/artifacts/fixture-pass-a-advise.json`,
`/opt/cursor/artifacts/fixture-pass-b-safe-auto.json`). Numbers below are
copied from those files. Do not invent further metrics. `ttfiMs` was omitted
(paste-after-load).

- Class: same box-desktop VM (SwiftShader WebGL), not the phone in
  [live-ocean-capture.md](./live-ocean-capture.md) §1
- Attach: unpublished live-attach IIFE, `profile: 'game'`
- Discovery: `__THREEJS_DOCTOR_HOST__` (no pelagic)
- Ocean adapter: **not registered** (`appliedKnobs` empty on both passes)

### Fixture Pass A — `advise`

Read-only. `appliedPasses` empty. Overlay stays advise.

| Field | Measured |
|-------|----------|
| score | 100 |
| startTier | `low` |
| tier | `low` |
| recommendedTier | `potato` |
| incomplete | false |
| floorFailed | false |
| baseline `avgFps` | 7.467330429371501 |
| baseline `p95FrameTimeMs` | 159.80000000004657 |
| after `avgFps` | 7.318917776024768 |
| after `p95FrameTimeMs` | 187.5999999998603 |
| `drawCalls` | 66 |
| `triangles` | 19010 |
| `shadowCastingLightCount` | 2 |
| `appliedPasses` | (none) |
| `appliedKnobs` | (none) |

Advise did not improve FPS (7.467 → 7.319). Score 100 is hygiene, not a win.

### Fixture Pass B — `safe-auto` (cold reload)

`window.__THREEJS_DOCTOR_ATTACH__ = { mode: 'safe-auto' }` then paste IIFE.
Generic caps only. Settled tier **potato**. Overlay/report `floorFailed: true`
(after `avgFps` 28.275 still below 30 and `p95FrameTimeMs` 83.6 still above 33.4).

Applied passes: `dpr-cap`, `pixel-budget`, `shadow-budget`, `postfx-budget`,
`tone-map-lite`, `anisotropy-cap`, `frameloop-demand`, `distance-cull`.
No adapter knobs.

| Field | Baseline | After |
|-------|----------|-------|
| `avgFps` | 10.07150770470434 | 28.275212064090482 |
| `p95FrameTimeMs` | 138.30000000004657 | 83.5999999998603 |
| `drawCalls` | 66 | 66 |
| `triangles` | 19010 | 19010 |
| `shadowCastingLightCount` | 1 | 0 |
| `drawingBufferPixels` | 1000692 | 257985 |

`safe-auto` **did** raise fixture FPS versus this file's advise after
(7.319 → 28.275) and versus its own baseline (10.072 → 28.275). It still
missed the 30 FPS / 33.4 ms floor on this SwiftShader box. Not §3 proof.

## Remaining gates

This file does not close acceptance. Still required:

- Phone-class ocean Pass A (`advise`) and Pass B (`safe-auto`) on the device in
  [live-ocean-capture.md](./live-ocean-capture.md) §1, same TTFI-then-30 FPS bar,
  real `baseline` / `after` only. The local acceptance-fixture run above does
  **not** replace that §3 bar.
- External [Claude-of-Tanks](https://cot.kevinliu.studio/) /
  [Kinema](https://kinema-play.vercel.app/?forceWebGL=1) /
  [catapult](https://sina-ghiasi.github.io/threejs-catapult-game/) still need
  explicit `attachQualityLadder({ scene, camera, renderer })` or a
  `window.__THREEJS_DOCTOR_HOST__` hook; they are not fully injectable on box
  today.

Save those JSON files off-repo. Never invent after metrics.
