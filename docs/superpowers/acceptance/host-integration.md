# Host integration (one screen)

Live-attach needs **`{ scene, camera, renderer }`**. Expose them **before** pasting
[`examples/live-attach/dist/attach.iife.js`](../../../examples/live-attach/dist/attach.iife.js).
The IIFE is still a repo file (not on npm). Runtime/CLI **0.1.5 is on npm**.
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

### three.js official examples (box / SwiftShader)

Official examples (threejs.org) do **not** put `scene` / `camera` / `renderer` on
`window`. `window.__THREE__` is often a **revision string**, not the library.

`WebGLRenderer` assigns `this.render` as an **instance own-property**. Patching
`WebGLRenderer.prototype.render` (live-attach capture / `capture.js`) is a
**known non-starter** on those builds: the prototype hook never runs.

Second path, **before** the example constructs a renderer: intercept
`three.module.js` (import-map override or Chrome local override) and wrap the
constructor so the first `render(scene, camera)` writes the host object. Snippet:
[`examples/host-shim/intercept-three-module.js`](../../../examples/host-shim/intercept-three-module.js).
Then paste the live-attach IIFE / `attachQualityLadder`.

Box SwiftShader recapture (not spec §3 / not a phone; no invented FPS):

- **Pass A+B with that HOST path:** `webgl_camera.html`, `webgl_lights_hemisphere.html`
- **Blocked without HOST:** `webgl_animation_skinning_blending.html`, `webgl_lights_physical.html`

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
2. **Canvas reverse lookup** — WebGL canvases first, at most 8, largest drawing
   buffer first (if none peek as WebGL, still inspect up to 8 canvases).
   Looks at `canvas.__THREE__`, `userData`, `_renderer`, `canvas.__r3f.getState()`
   (also `__r3f.store` / `__r3f.root`), and a renderer on a cheap bundle root whose
   `domElement` is that canvas. Does **not** BFS `window` or walk a live `scene`
   graph (geometry attributes stay unvisited).
3. **Prototype capture** — only if `window.THREE` / `window.three` / object
   `window.__THREE__` exists **and** instances call through
   `WebGLRenderer.prototype.render`. Paste [`examples/host-shim/capture.js`](../../../examples/host-shim/capture.js),
   wait one rendered frame, confirm `window.__THREEJS_DOCTOR_HOST__`, then paste
   the IIFE. **Skip this on official three.module.js examples** (own-property
   `render`; see above). Use [`intercept-three-module.js`](../../../examples/host-shim/intercept-three-module.js)
   before load instead.
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
- Prototype `render` capture needs `THREE.WebGLRenderer` on the page **and**
  calls that actually hit `prototype.render`. Official `three.module.js` assigns
  `this.render` on the instance — proto hooks do not run. A string
  `window.__THREE__` is not the library. Use the HOST assignment or
  [`intercept-three-module.js`](../../../examples/host-shim/intercept-three-module.js)
  before the renderer is constructed.
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
