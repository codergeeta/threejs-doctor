# Host integration (one screen)

Live-attach needs **`{ scene, camera, renderer }`**. Expose them **before** pasting
[`examples/live-attach/dist/attach.iife.js`](../../../examples/live-attach/dist/attach.iife.js).
The IIFE is still a repo file (not on npm). Runtime/CLI **0.1.1 is on npm**.
Do not invent FPS. Capture JSON stays off-repo.

## Preferred: one assignment (copy-paste)

Drop this next to where the game constructs the renderer (authors / auditors).
Same snippet: [`examples/host-shim/expose.js`](../../../examples/host-shim/expose.js).

```js
window.__THREEJS_DOCTOR_HOST__ = { scene, camera, renderer }
// optional:
// window.__THREEJS_DOCTOR_HOST__.composer = composer
```

Then paste `attach.iife.js`. Discovery finds this on the **cheap path**. No
`window.pelagic`. No `deepWalk`. No page-wide BFS.

That is what the unpublished local hosts do:

- [`examples/acceptance-fixture`](../../../examples/acceptance-fixture/README.md)
- [`examples/acceptance-fixture-game`](../../../examples/acceptance-fixture-game/README.md) (heavier)

Optional aliases (same objects): `window.scene` / `window.camera` / `window.renderer`
(including non-enumerable). Cheap bundle roots also include `window.game`,
`window.app`, `window.__ccGame`, `window.__game`, `window.gameApp`, `window.threeApp`.

**Clockwork Climb** ([tommyato/gamedevjs-2026-entry](https://github.com/tommyato/gamedevjs-2026-entry)): load with **`?verify-ui=1`**, then attach via `window.__ccGame`. Do not run Quality Ladder `safe-auto` with `frameloop-demand` on that continuous rAF loop — see [real-host-followups.md](./real-host-followups.md).

## Bundled games without a host object

If `scene` / `camera` / `renderer` are closed over (Parking Master, tanks, kinema,
catapult, …), try in this order — **deep walk stays opt-in**:

1. **Author hook** — the assignment above. Best. Does not freeze the page.
2. **Canvas reverse lookup** — WebGL canvases only (at most 8, largest first).
   Looks at `canvas.__THREE__`, `userData`, `_renderer`, `canvas.__r3f.getState()`
   (R3F `{ scene, camera, gl }`), and a renderer on a cheap bundle root whose
   `domElement` is that canvas. Does **not** BFS `window`.
3. **Prototype capture** — if `window.THREE` / `window.three` / object
   `window.__THREE__` exists, paste [`examples/host-shim/capture.js`](../../../examples/host-shim/capture.js),
   wait one rendered frame, confirm `window.__THREEJS_DOCTOR_HOST__`, then paste
   the IIFE.
4. **Opt-in deep walk** — `window.__THREEJS_DOCTOR_ATTACH__ = { deepWalk: true }`
   then paste. Hard-capped (5000 nodes / depth 8 / 80ms). Abort does not freeze
   the tab the way the old 50k walk did. Still cannot invent a fully closed-over
   renderer (catapult v3: no freeze, no renderer).

## Alternative: explicit inject from this page’s console

```js
window.__THREEJS_DOCTOR_ATTACH__ = { autoRun: false }
// paste attach.iife.js, then:
await ThreejsDoctorLiveAttach.attachQualityLadder({ scene, camera, renderer, composer })
```

Use this when the renderer is fully closed over and none of the cheap paths hit.

## Ocean only: `window.pelagic.debug`

If `pelagic.debug` already has `scene` + `renderer`, the IIFE registers the ocean
adapter. **Do not fake `pelagic` on other games.**

## What not to rely on

- **`deepWalk: true`** is opt-in and hard-capped (5000 nodes / depth 8 / 80ms). It
  must not freeze the tab. It still **cannot invent** a fully closed-over renderer.
- Prototype `render` capture needs `THREE.WebGLRenderer` on the page (or an
  instance). A string `window.__THREE__` is not the library.
- External GitHub games stay **blocked pending a host hook** until one of the
  snippets above exists. Local fixtures are not those games. Box SwiftShader /
  Chrome emulation is not spec §3 / phone-class proof.

Phone-class bar: [live-ocean-capture.md](./live-ocean-capture.md). Box-desktop
notes (not §3): [box-desktop-evidence.md](./box-desktop-evidence.md).
Before/after honesty (noise band, invalid hidden/throttled, opt-in pixel-diff):
[real-host-followups.md](./real-host-followups.md) **P3**.

## Do not treat mocks as proof

Headless bench fixtures and tests that inject `now()` (fixed 16ms clocks) are
**CI smoke**. They do not prove a pass is visually safe or that FPS improved.
Compare runs need a **fixed camera pose**; moving scenes were ~50% noisy in the
arcade-racer report, ~2% at a locked pose. Never claim a win inside the noise
band (`compareAbSamples` / `Doctor.compareAb`; **medians**, A-vs-A control). A live run with
`document.visibilityState === 'hidden'` or throttled rAF is `invalid` /
`incomplete` — not a score.
