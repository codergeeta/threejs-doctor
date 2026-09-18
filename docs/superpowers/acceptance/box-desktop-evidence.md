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
- Error: could not find scene/camera/renderer (bundled closures). Nested
  `{ app: { gfx: { renderer } } }` is still covered by cheap bundle-root
  discovery. The optional deep walk is **opt-in**
  (`__THREEJS_DOCTOR_ATTACH__.deepWalk`) and hard-capped (5000 nodes / depth 8 /
  80ms) after live moonbase froze on the old 50k sync BFS. **Blocked pending a
  host hook** — this revision did not recapture tanks (prior ~125-canvas OOM).
  If the live renderer is fully closed over, explicit
  `attachQualityLadder({ scene, camera, renderer })` is still required from the
  page console.
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

- Status: **BLOCKED** on scene discovery — pending a host hook
  ([host-integration.md](./host-integration.md)). **v3 recapture** on this VM
  with `window.__THREEJS_DOCTOR_ATTACH__ = { deepWalk: true }` did **not freeze**.
- Copied from `/opt/cursor/artifacts/catapult-deepwalk-v3.json`. Attach returned
  in **10.699999999953434 ms** (`wallMs` 11). `frozen: false`. Page title stayed
  `Catapult Game`. **No** `LAST_REPORT`. **No FPS**. Do not invent any.
- Observed: **1 canvas**, WebGL context **yes**, renderer **no**, scene **no**,
  camera **no**. `window.THREE` missing (`undefined`). `window.__THREE__` is the
  string `"174"`, not the library. Bundle roots present: `__THREE__`. Probe
  listed `deep walk (window/document/canvas, bounded)` among tried paths.
- Menu **Start** opened Level Selection; a canvas/WebGL context was already
  present. Deep walk still could not find a `WebGLRenderer`. Explicit
  `attachQualityLadder({ scene, camera, renderer })` or
  `window.__THREEJS_DOCTOR_HOST__` is required.

### Apophenoth (https://izzoizzoizzo.github.io/Apophenoth/)

- Not used: live URL **404**

### What is injectable on this box today

Among **external** hosts tried here, **only ocean-simulation is fully
injectable** (`window.pelagic.debug`). Tanks, Kinema, and catapult remain
**blocked pending host hooks** ([host-integration.md](./host-integration.md)).
Catapult v3 with opt-in `deepWalk` still cannot find the renderer; it does not
freeze.

In-repo unpublished fixtures (`acceptance-fixture`, `acceptance-fixture-game`)
expose `__THREEJS_DOCTOR_HOST__` and are measurable on this VM. They are **not**
those GitHub games and **not** a phone.

## In-repo fixtures (not phone-class, not external GitHub games)

Local unpublished hosts on this VM (SwiftShader WebGL). **Not** the phone in
[live-ocean-capture.md](./live-ocean-capture.md) §1. **Not** spec §3.
**Not** Claude-of-Tanks / Kinema / catapult / moonbase. Discovery:
`window.__THREEJS_DOCTOR_HOST__` (see [host-integration.md](./host-integration.md)).
No `window.pelagic`. Ocean adapter **not registered** (`appliedKnobs` empty).
Paste unpublished `examples/live-attach/dist/attach.iife.js`, `profile: 'game'`.
`ttfiMs` omitted (paste-after-load). Do not invent further metrics.

Vite on this VM binds `localhost` (IPv6 `::1`), not `127.0.0.1`.

### Acceptance bar progress (this session)

- **Fixture ×2 measurable wins** on box-desktop generic caps (numbers below).
  Game fixture Pass B this session: after avgFps **55.7828188917765** /
  p95 **31.899999999906868**, `floorFailed: false`, drawCalls **69** /
  triangles **20930** (above the light fixture 66 / 19010).
- **Ocean injectable** on this box (`window.pelagic.debug`) but **not** §3:
  SwiftShader ocean / phone-probe / emulation still ≪ 30.
- **Remaining gate = real phone ocean only** (Pass A + Pass B on the device in
  live-ocean-capture.md §1). External tanks / kinema / catapult / moonbase are
  blocked pending host hooks; they are not this remaining gate.

## In-repo acceptance-fixture (this session remeasure)

[`examples/acceptance-fixture`](../../../examples/acceptance-fixture/README.md)
`pnpm --filter @threejs-doctor/acceptance-fixture dev` → http://localhost:5174/

Capture JSON off-repo:
`/opt/cursor/artifacts/fixture-pass-a-advise.json`,
`/opt/cursor/artifacts/fixture-pass-b-safe-auto.json`.

### Fixture Pass A — `advise` (this session)

Read-only. `appliedPasses` empty. Overlay stays advise.

| Field | Measured |
|-------|----------|
| score | 100 |
| startTier | `low` |
| tier | `low` |
| recommendedTier | `potato` |
| incomplete | false |
| floorFailed | false |
| applyFailed | false |
| baseline `avgFps` | 13.713031951364739 |
| baseline `p95FrameTimeMs` | 141.9000000001397 |
| after `avgFps` | 14.270537682147662 |
| after `p95FrameTimeMs` | 138.30000000004657 |
| `drawCalls` | 66 |
| `triangles` | 19010 |
| `shadowCastingLightCount` | 2 |
| `drawingBufferPixels` | 1024000 |
| `appliedPasses` | (none) |
| `appliedKnobs` | (none) |

Advise did not improve FPS (13.713031951364739 → 14.270537682147662). Score 100
is hygiene, not a win.

### Fixture Pass B — `safe-auto` (this session, cold reload)

`window.__THREEJS_DOCTOR_ATTACH__ = { mode: 'safe-auto' }` then IIFE.
Generic caps only. Settled tier **potato**. `floorFailed: false`.
After `avgFps` 60.00400026668818 ≥ 30 and `p95FrameTimeMs` 16.899999999906868
≤ 33.4. After `drawingBufferPixels` 256000 is the **0.5** second-stage floor
(1280×800×0.5²). Not §3 proof.

Applied passes: `dpr-cap`, `pixel-budget`, `shadow-budget`, `postfx-budget`,
`tone-map-lite`, `anisotropy-cap`, `frameloop-demand`, `distance-cull`.
No adapter knobs.

| Field | Baseline | After |
|-------|----------|-------|
| `avgFps` | 20.781379883626283 | 60.00400026668818 |
| `p95FrameTimeMs` | 99.80000000004657 | 16.899999999906868 |
| `drawCalls` | 66 | 66 |
| `triangles` | 19010 | 19010 |
| `shadowCastingLightCount` | 1 | 0 |
| `drawingBufferPixels` | 1024000 | 256000 |

`safe-auto` raised this fixture versus this session's advise after
(14.270537682147662 → 60.00400026668818) and versus its own baseline
(20.781379883626283 → 60.00400026668818).

### Prior fixture runs (same PR, earlier sessions)

Kept for history. Not this session.

Pass A (prior this-branch remeasure): after `avgFps` 14.37814521926658 / p95
133.20000000001164.

Pass B (prior this-branch remeasure): after `avgFps` 60.01200240048196 / p95
24.800000000046566, `floorFailed` false, `drawingBufferPixels` 256000.

Pass A (older): after `avgFps` 13.332148253488395 / p95 140.80000000004657.

Pass B after potato-floor work: after `avgFps` 52.313415484770275 / p95
29.199999999953434, `floorFailed` false, `drawingBufferPixels` 256000.

Pass B after hopeless 0.35 floor: after `avgFps` 53.96977692490396 / p95 32,
`floorFailed` false. Copied from
`/opt/cursor/artifacts/fixture-pass-b-after-hopeless-floor.json` (that file is
not from this session).

Pre-nudge Pass B after: `avgFps` 28.275212064090482 / p95 83.5999999998603 /
`floorFailed` true / `drawingBufferPixels` 257985. Advise after in that
session was 7.318917776024768 / p95 187.5999999998603.

## In-repo acceptance-fixture-game (this session; heavier unpublished mini-game)

[`examples/acceptance-fixture-game`](../../../examples/acceptance-fixture-game/README.md)
`pnpm --filter @threejs-doctor/acceptance-fixture-game dev` → http://localhost:5175/

Heavier than the first fixture via InstancedMesh density (12×12 boxes, instanced
spheres/toruses), a 64-beacon ring, 4096 particles, two shadow-casting lights.
Draw calls **69** / triangles **20930** stay above the light fixture **66** /
**19010**. Same host hook. **Not** an external game. **Not** phone-class.
**Not** §3.

Capture JSON off-repo:
`/opt/cursor/artifacts/fixture-game-pass-a-advise.json`,
`/opt/cursor/artifacts/fixture-game-pass-b-safe-auto.json`.

### Game fixture Pass A — `advise`

Read-only. `appliedPasses` / `appliedKnobs` empty. Score 100 is hygiene.

| Field | Measured |
|-------|----------|
| score | 100 |
| startTier | `low` |
| tier | `low` |
| recommendedTier | `potato` |
| incomplete | false |
| floorFailed | false |
| applyFailed | false |
| baseline `avgFps` | 13.188552336572126 |
| baseline `p95FrameTimeMs` | 193.60000000009313 |
| after `avgFps` | 13.393056444292512 |
| after `p95FrameTimeMs` | 152.69999999995343 |
| `drawCalls` | 69 |
| `triangles` | 20930 |
| `shadowCastingLightCount` | 2 |
| `drawingBufferPixels` | 1024000 |
| `appliedPasses` | (none) |
| `appliedKnobs` | (none) |

Advise did not improve FPS (13.188552336572126 → 13.393056444292512).

### Game fixture Pass B — `safe-auto` (cold reload)

Generic caps only. Settled tier **potato**. `floorFailed: false` because after
`avgFps` 55.7828188917765 ≥ 30 and `p95FrameTimeMs` 31.899999999906868 ≤ 33.4
(three at-target holds). After `drawingBufferPixels` 256000 is the 0.5 floor.
Draw calls stayed 69; triangles 20930; shadow casters 1→0.

Applied passes: `dpr-cap`, `pixel-budget`, `shadow-budget`, `postfx-budget`,
`tone-map-lite`, `anisotropy-cap`, `frameloop-demand`, `distance-cull`.
No adapter knobs.

| Field | Baseline | After |
|-------|----------|-------|
| `avgFps` | 17.594275995544223 | 55.7828188917765 |
| `p95FrameTimeMs` | 176.30000000004657 | 31.899999999906868 |
| `drawCalls` | 69 | 69 |
| `triangles` | 20930 | 20930 |
| `shadowCastingLightCount` | 1 | 0 |
| `drawingBufferPixels` | 1024000 | 256000 |

`safe-auto` raised this heavier fixture versus its advise after
(13.393056444292512 → 55.7828188917765) and versus its own baseline
(17.594275995544223 → 55.7828188917765). avgFps and p95 both cleared.
`floorFailed` false. Still not §3 proof.

### Prior game-fixture runs (same PR, earlier sessions)

Kept for history. Not this session. Do not treat these as the current scene.

Uninstanced 12×12 / 158 drawCalls Pass B: after `avgFps` **32.05128205128338**
(≥30) / `p95FrameTimeMs` **60.29999999993015** (>33.4), `floorFailed: true`,
`drawCalls` 158 / `triangles` 52418 / `drawingBufferPixels` 256000. Measurable
win versus that session's advise after 6.472864314379904. Not a full p95 clear.

That session's Pass A: after `avgFps` 6.472864314379904 / p95 310.19999999995343
/ `drawCalls` 158 / `triangles` 52418 / `shadowCastingLightCount` 4 / score 74
(`draw-calls/too-many`, `shadows/too-many-casters`).

## Remaining gates

This file does not close acceptance. Still required:

- **Real-phone ocean** Pass A (`advise`) and Pass B (`safe-auto`) on the device
  in [live-ocean-capture.md](./live-ocean-capture.md) §1, same TTFI-then-30 FPS
  bar, real `baseline` / `after` only. That is the remaining §3 gate.
  Chrome iPhone **emulation** Pass B after 2.251 FPS (`floorFailed`) is not
  that bar. The `device: 'phone'` overlay run (after ~0.92 / p95 ~4074,
  `floorFailed`) is also an emulator / SwiftShader and does **not** replace §3.
  Box SwiftShader cannot prove the ocean bar. Ocean is injectable here; it is
  not a §3 pass.
- External [Claude-of-Tanks](https://cot.kevinliu.studio/) /
  [Kinema](https://kinema-play.vercel.app/?forceWebGL=1) /
  [catapult](https://sina-ghiasi.github.io/threejs-catapult-game/) /
  [moonbase](https://konstantinsteinmiller.github.io/moonbase) stay **blocked
  pending host hooks**. Catapult v3 with `deepWalk: true` did not freeze and
  still found no renderer (see above). Tanks previously OOM'd; kinema was
  WebGPU despite `forceWebGL=1`; moonbase froze on the old uncapped walk.
  Do not treat unit tests or in-repo fixtures as those live hosts.

Save those JSON files off-repo. Never invent after metrics.

## Phone-class overlay on this VM (emulator, not a real phone)

Chrome headless SwiftShader, puppeteer viewport **360×800** `deviceScaleFactor: 3` `isMobile`/`hasTouch`, plus
`window.__THREEJS_DOCTOR_ATTACH__ = { device: 'phone' }` so `startTier` is
**potato** even though live `navigator.deviceMemory` on this VM is 16.
**Not** the device in [live-ocean-capture.md](./live-ocean-capture.md) §1.
**Not** spec §3 bar proof. UA is HeadlessChrome on Linux.

JSON off-repo: `/opt/cursor/artifacts/ocean-phone-overlay-pass-a.json`,
`ocean-phone-overlay-pass-b.json`. `windowFrames` / `measureFrames` were **12**
(labeled; not the default 90). `WEBGL_debug_renderer_info` was **not** requested
(`debugRendererInfoRequested: false`). `ttfiMs` omitted (paste-after-load).

Potato knobs on Pass B: `fftSize` `[64, 0, 0]`, `spectrumEveryNFrames` **8**,
`deferredHdr` true. Still no `meshLod` / `rtScale`.

### Overlay Pass A — `advise` + `device: 'phone'`

Read-only. `appliedPasses` / `appliedKnobs` empty. Overlay stays advise.

| Field | Measured |
|-------|----------|
| score | 100 |
| startTier | `potato` |
| maxTier | `mid` |
| tier | `potato` |
| floorFailed | false |
| baseline `avgFps` | 0.749728223518975 |
| baseline `p95FrameTimeMs` | 4271.5 |
| after `avgFps` | 0.749728223518975 |
| after `p95FrameTimeMs` | 4271.5 |
| `drawCalls` | 63 |
| `triangles` | 662202 |
| `drawingBufferPixels` | 524880 |

Advise did not move FPS. Score 100 is hygiene. startTier **potato** (overlay), unlike the desktop-viewport ocean run above (`startTier` low).

### Overlay Pass B — `safe-auto` + `device: 'phone'`

`floorFailed: true`. After `avgFps` 1.125 still ≪ 30. Cadence 8 + generic caps
on this 360×800 viewport did **not** clear the floor.

| Field | Baseline | After |
|-------|----------|-------|
| `avgFps` | 1.1249121162409186 | 1.1249121162409186 |
| `p95FrameTimeMs` | 1638.9000000000233 | 1638.9000000000233 |
| `drawCalls` | 29 | 29 |
| `triangles` | 662134 | 662134 |
| `drawingBufferPixels` | 288000 | 288000 |

Baseline already reflects potato boot caps (startTier potato). Same sample in
`after` on this short-window run. Draw calls 63→29 vs this file's overlay
advise; triangles barely moved (662202→662134). Not comparable 1:1 to the
earlier desktop-viewport Pass B v4 (after 0.773 / 912502 triangles / cadence 4)
because viewport and window length differ. Both remain ≪ 30.

### Host-shim on tanks / catapult (this VM, not FPS)

Copied from `/opt/cursor/artifacts/host-shim-probe.json`. No ladder report, no
FPS. `THREE.WebGLRenderer` is **not** on `window` (`window.THREE` missing;
`window.__THREE__` is a **string**, not the library). `examples/host-shim/capture.js`
logged `THREE.WebGLRenderer not found` on both:

- https://cot.kevinliu.studio/ — 119 canvases, hook did not capture
- https://sina-ghiasi.github.io/threejs-catapult-game/ — 1 canvas, hook did not capture

The prototype hook is shipped and unit-tested with fakes. Deep walk from
window / document / canvas is **opt-in** (`__THREEJS_DOCTOR_ATTACH__.deepWalk`)
with hard caps (5000 nodes, depth 8, 80ms wall clock; abort returns undefined).
The previous default 50k sync walk froze live moonbase. **Catapult v3** with
`deepWalk: true` is recorded above (no freeze, no renderer). Tanks were not
recaptured this revision (prior OOM). Until a live capture succeeds, they still
need explicit `attachQualityLadder({ scene, camera, renderer })` if the
renderer is not on the cheap-path graph.

## Chrome iPhone emulation 390×844 DPR3 (NOT a real phone GPU)

DevTools / Chrome device emulation, viewport **390×844**, DPR **3**. This is
**mobile-emulation**, not the phone in [live-ocean-capture.md](./live-ocean-capture.md)
§1 and **not** a real-phone GPU. Not spec §3 bar proof.

`startTier` **low**, `maxTier` **mid**, settled **potato**. `floorFailed: true`
with `quality/floor-failed`. Canvas stayed alive (not a collapsed-geometry
`applyFailed` run).

Applied potato knobs (cadence **4** on this capture — older than the table
value 8 now in `ADAPTER_KNOBS.potato`):

- `fftSize`: `[64, 0, 0]`
- `spectrumEveryNFrames`: 4
- `deferredHdr`: true
- no `rtScale`, no `meshLod`

Triangles were reported as ~1.43e6 on both samples. Do not invent a more
precise triangle count.

| Field | Baseline | After |
|-------|----------|-------|
| `avgFps` | 1.267 | 2.251 |
| `p95FrameTimeMs` | 965.9 | 582.9 |
| `drawCalls` | 59 | 25 |
| `triangles` | ~1.43e6 | ~1.43e6 |
| `drawingBufferPixels` | 484825 | 20467 |

After 2.251 FPS / p95 582.9 still miss `avgFps ≥ 30` / `p95FrameTimeMs ≤ 33.4`.
Draw calls moved (59→25); triangle count did not meaningfully move. Drawing
buffer dropped 484825→20467. Floor failed on emulation, not a claimed win.

## Phone-probe ocean Pass B (box SwiftShader, still not §3)

Box phone-probe overlay, settled **potato**, canvas **alive** (not collapsed
geometry). Copied fields only — do not invent `ttfiMs` / `drawCalls` /
`triangles` / `drawingBufferPixels` for this write-up.

Applied knobs still the potato table (hopeless cascade freeze had not armed
on this capture):

- `fftSize`: `[64, 0, 0]`
- `spectrumEveryNFrames`: 8
- `deferredHdr`: true
- no `meshLod`, no `rtScale`

| Field | After |
|-------|-------|
| `avgFps` | ~0.92 |
| `p95FrameTimeMs` | ~4074 |
| `floorFailed` | true |

After **~0.92 FPS** / p95 **~4074** is still ≪ 30. This VM is SwiftShader
WebGL. **Box SwiftShader cannot prove the spec §3 ocean bar.** A real phone
GPU capture on the device in [live-ocean-capture.md](./live-ocean-capture.md)
§1 is still required. Do not treat this ~0.92 as a win or as phone-class
proof.

## Deep renderer walk (this revision, no new FPS)

Live [moonbase](https://konstantinsteinmiller.github.io/moonbase) rendered, then
pasting the live-attach IIFE with the default deep `isWebGLRenderer` BFS
**hung/froze the tab** — no `LAST_REPORT`. The 50k sync walk is too heavy for a
real game. No FPS were copied from that attempt (the tab never finished). Do
not invent them.

Fix shipped this revision:

- Default attach uses cheap paths only (`__THREEJS_DOCTOR_HOST__`, pelagic,
  canvas bags, bundle roots, shallow walk). Deep walk is **off**.
- Opt in with `window.__THREEJS_DOCTOR_ATTACH__ = { deepWalk: true }` for
  bundled hosts. Hard caps: **5000 nodes**, **depth 8**, **80ms**; abort
  returns undefined. Unit tests cover budget abort, shallow nested find, and a
  hang fixture.
- Host-shim `capture.js` matches: no graph walk unless `deepWalk: true`, same
  caps.

**Re-test catapult on the box — done this revision (v3).** Opt-in `deepWalk: true`
returned in **10.699999999953434 ms**, page stayed responsive, **no freeze**,
**no renderer**. `window.__THREE__` is the string `"174"`. Still blocked pending
a host hook. No FPS copied (no `LAST_REPORT`). Do not invent them.

Tanks / kinema / moonbase were **not** recaptured this revision (prior OOM /
WebGPU / freeze). They stay blocked pending host hooks. Unit tests are not a
live capture.

In-repo fixtures **were** remeasured this revision (see above). First fixture
Pass B after `avgFps` **60.00400026668818** / p95 **16.899999999906868**,
`floorFailed: false`. Game fixture Pass B after `avgFps` **55.7828188917765**
/ p95 **31.899999999906868**, `floorFailed: false`, `drawCalls` 69 /
`triangles` 20930. Cheap-path host object (`window.__THREEJS_DOCTOR_HOST__`)
found both. Prior uninstanced game Pass B (32.051 / p95 60.3 / `floorFailed`
true / 158 drawCalls) stays as history above.


