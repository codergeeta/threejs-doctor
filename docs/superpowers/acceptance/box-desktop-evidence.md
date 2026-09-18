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
  80ms) after live moonbase froze on the old 50k sync BFS. **Re-test on the box
  is still required** — this revision did not recapture tanks. If the live
  renderer is fully closed over, explicit
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

- Status: **BLOCKED** on scene discovery
- Observed: canvas present, **no** discoverable scene/camera/renderer handles
  on the last box attempt (prototype hook never armed: `window.THREE` missing,
  `window.__THREE__` a string). Bounded opt-in deep walk now ships in
  live-attach + host-shim; **re-test catapult on the box is still required**.
  No FPS / after metrics recorded.
- Needs a successful deep-walk / render-hook capture, or explicit
  `attachQualityLadder({ scene, camera, renderer })` / a
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
| baseline `avgFps` | 12.906001290600129 |
| baseline `p95FrameTimeMs` | 145.5 |
| after `avgFps` | 13.332148253488395 |
| after `p95FrameTimeMs` | 140.80000000004657 |
| `drawCalls` | 66 |
| `triangles` | 19010 |
| `shadowCastingLightCount` | 2 |
| `drawingBufferPixels` | 1024000 |
| `appliedPasses` | (none) |
| `appliedKnobs` | (none) |

Advise did not improve FPS (12.906 → 13.332). Score 100 is hygiene, not a win.

### Fixture Pass B — `safe-auto` (cold reload, after potato-floor work)

`window.__THREEJS_DOCTOR_ATTACH__ = { mode: 'safe-auto' }` then paste IIFE.
Generic caps only. Settled tier **potato**. Overlay/report `floorFailed: false`.
After `avgFps` 52.313 ≥ 30 and `p95FrameTimeMs` 29.2 ≤ 33.4 — **this remeasure
cleared 30 FPS**. That clearance is the **0.5 second-stage floor plus clearing a
stale `floorFailed` latch** after later windows held the target. After
`drawingBufferPixels` 256000 is still 0.5 DPR (1280×800×0.5²). The high-20s
**0.4 near-miss did not fire** on this session (settled avgFps was already
above 30). Not proof that 0.4 DPR would have rescued the earlier 28.275 /
p95 83.6 miss.

Applied passes: `dpr-cap`, `pixel-budget`, `shadow-budget`, `postfx-budget`,
`tone-map-lite`, `anisotropy-cap`, `frameloop-demand`, `distance-cull`.
No adapter knobs.

| Field | Baseline | After |
|-------|----------|-------|
| `avgFps` | 17.149717029668555 | 52.313415484770275 |
| `p95FrameTimeMs` | 171.40000000002328 | 29.199999999953434 |
| `drawCalls` | 66 | 66 |
| `triangles` | 19010 | 19010 |
| `shadowCastingLightCount` | 1 | 0 |
| `drawingBufferPixels` | 1024000 | 256000 |

`safe-auto` **did** raise fixture FPS versus this file's advise after
(13.332 → 52.313) and versus its own baseline (17.150 → 52.313). Not §3 proof.

### Fixture Pass B remeasure (after hopeless 0.35 floor)

Same unpublished local fixture, same VM, `mode: 'safe-auto'`. Copied from
`/opt/cursor/artifacts/fixture-pass-b-after-hopeless-floor.json`. Hopeless
`pixelRatio` 0.35 only fires when avgFps stays **below 10** after the first
floor; this run never entered that band. After `drawingBufferPixels` 256000 is
still the **0.5** second-stage floor. After `avgFps` 53.970 ≥ 30 and
`p95FrameTimeMs` 32 ≤ 33.4. `floorFailed: false`. Still not §3 proof.

| Field | Baseline | After |
|-------|----------|-------|
| `avgFps` | 15.414654197924527 | 53.96977692490396 |
| `p95FrameTimeMs` | 125.29999999981374 | 32 |
| `drawCalls` | 66 | 66 |
| `triangles` | 19010 | 19010 |
| `drawingBufferPixels` | 1024000 | 256000 |

### Pre-nudge fixture Pass B (same PR, earlier session)

Copied from the previous `LAST_REPORT` write-up on this PR, before the
potato near-miss caps and `floorFailed` latch clear. Not this session.

| Field | After |
|-------|-------|
| `avgFps` | 28.275212064090482 |
| `p95FrameTimeMs` | 83.5999999998603 |
| `floorFailed` | true |
| `drawingBufferPixels` | 257985 |

Advise after in that session was 7.318917776024768 / p95 187.5999999998603.
That ~28 FPS / floorFailed true run is why the second-stage floor was nudged.

## Remaining gates

This file does not close acceptance. Still required:

- Phone-class ocean Pass A (`advise`) and Pass B (`safe-auto`) on the **real**
  device in [live-ocean-capture.md](./live-ocean-capture.md) §1, same
  TTFI-then-30 FPS bar, real `baseline` / `after` only. Chrome iPhone
  **emulation** Pass B after 2.251 FPS (`floorFailed`) is not that bar. The
  `device: 'phone'` overlay run (after ~0.92 / p95 ~4074, `floorFailed`) is
  also an emulator / SwiftShader and does **not** replace §3. Box SwiftShader
  cannot prove the ocean bar.
- External [Claude-of-Tanks](https://cot.kevinliu.studio/) /
  [Kinema](https://kinema-play.vercel.app/?forceWebGL=1) /
  [catapult](https://sina-ghiasi.github.io/threejs-catapult-game/) still need a
  **box re-test**. Cheap-path discovery plus an **opt-in** bounded deep walk
  (`deepWalk: true`, 5000 / 8 / 80ms) replaced the 50k sync BFS that froze
  moonbase. This revision did **not** recapture those live hosts. If the
  renderer is fully closed over, explicit
  `attachQualityLadder({ scene, camera, renderer })` is still required.
  Previous host-shim probe: `THREE.WebGLRenderer` not on `window` (`window.THREE`
  missing; `window.__THREE__` a **string**). Do not treat unit tests as a live
  tanks/catapult pass.

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
The previous default 50k sync walk froze live moonbase. **Re-test tanks /
catapult on the box** — this revision did not recapture those hosts.
Until a live capture succeeds, they still need explicit
`attachQualityLadder({ scene, camera, renderer })` if the renderer is not on
the cheap-path graph.

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

**Re-test catapult / tanks / moonbase on the box** — not done this revision.
Do not invent FPS.

In-repo fixture Pass B was **not remeasured**. The last copied run remains
after `avgFps` **53.970** / p95 **32** on the 0.5 DPR floor (`floorFailed:
false`), which is still ≥30. Default attach still finds the fixture host
(`window.__THREEJS_DOCTOR_HOST__`) on the cheap path.


