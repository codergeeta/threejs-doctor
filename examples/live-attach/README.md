# Unpublished Quality Ladder live-attach helper

Browser IIFE that pastes into DevTools on a **live** Three.js page, constructs
`Doctor` + `QualityController` from `@threejs-doctor/runtime`, optionally
registers `createOceanAdapter` when `window.pelagic.debug` exists, then
`boot()` + `runLadder()`. The report is logged with `console.log(JSON.stringify(report))`
and also stored on `window.__THREEJS_DOCTOR_LAST_REPORT__` after boot, after every
ladder publish, and in a `finally` block even when `runLadder()` throws. Copy from DevTools with:

```js
copy(JSON.stringify(window.__THREEJS_DOCTOR_LAST_REPORT__))
```

That survives a dropped console JSON line and a `runLadder()` that throws after boot.
Metrics come from that run only — **do not invent `avgFps` / `ttfiMs` / `after`**.

**This package is `private: true`.** It is not published. This repository does
not vendor ocean-simulation, claude-of-tanks, or Kinema.

## Build

From the repo root (after `pnpm install`):

```bash
pnpm --filter @threejs-doctor/live-attach-example build
```

That writes `examples/live-attach/dist/attach.iife.js` (committed so you can
paste without rebuilding). Rebuild and commit `dist/` after changing attach
source — unit tests compare the committed IIFE to a fresh build.

## Pass A (`advise`, default)

1. Open one of the live URLs below. Wait until the WebGL canvas is visible.
2. Open DevTools → Console.
3. Paste the **entire** contents of `dist/attach.iife.js` and press Enter.
4. Wait until a JSON line is logged, or copy
   `copy(JSON.stringify(window.__THREEJS_DOCTOR_LAST_REPORT__))`. Save that file **off-repo**. Do not commit it.
5. Validate against
   [`docs/superpowers/acceptance/quality-ladder-report.schema.json`](../../docs/superpowers/acceptance/quality-ladder-report.schema.json).

Default mode is `advise` (no pass/adapter mutation). Overlay mounts when
`document.body` exists. Frame samples wait for `renderer.info.render.frame` to
advance when that counter exists.

**Default paste is safe:** discovery uses cheap paths only
(`__THREEJS_DOCTOR_HOST__`, pelagic, canvas bags, bundle roots, a shallow
global walk). It does **not** BFS the live page. A previous 50k-node
`isWebGLRenderer` walk froze [moonbase](https://konstantinsteinmiller.github.io/moonbase)
with no `LAST_REPORT`. For bundled hosts that need the graph walk, opt in
**before** paste:

```js
window.__THREEJS_DOCTOR_ATTACH__ = { deepWalk: true }
```

That walk is hard-capped (`maxNodes` ≤ 5000, `maxDepth` ≤ 8, `maxMs` ≤ 80) and
returns undefined if the budget is exceeded. It cannot freeze the tab the way
the uncapped walk did.

If auto-run is unwanted:

```js
window.__THREEJS_DOCTOR_ATTACH__ = { autoRun: false }
```

Then paste the IIFE and call:

```js
await ThreejsDoctorLiveAttach.attachQualityLadder({ mode: 'advise' })
```

Paste-after-load **cannot** measure cold-load TTFI. `ttfiMs` is omitted unless
you pass `waitForFirstInteractive` from a document-start hook. Do not treat a
missing `ttfiMs` as a failed bar, and do not fill it in by hand.

## Pass B (`safe-auto`)

Cold load again (reload the live page). Same camera path as Pass A.

```js
window.__THREEJS_DOCTOR_ATTACH__ = { mode: 'safe-auto' }
```

Paste `dist/attach.iife.js` again. Save the JSON off-repo (console line or
`copy(JSON.stringify(window.__THREEJS_DOCTOR_LAST_REPORT__))`). Compare settled
`baseline` / `after` / `deltas` to the bar in
[`docs/superpowers/acceptance/live-ocean-capture.md`](../../docs/superpowers/acceptance/live-ocean-capture.md).
Do not type guessed after metrics. Do not treat paste-after-load `ttfiMs` as
cold TTFI (it will be absent by default).

## Phone-class probe overlay (box / DevTools emulator)

Box-desktop Chrome does **not** look like the §1 phone in
[`live-ocean-capture.md`](../../docs/superpowers/acceptance/live-ocean-capture.md)
(`maxTouchPoints`, coarse pointer, `deviceMemory ≤ 4`, high DPR). DevTools
device mode may change UA / viewport / DPR but often leaves `navigator.deviceMemory`
and `maxTouchPoints` as desktop values, so `resolveStartTier` still starts **low**.

Force the phone-class signals **without** requesting `WEBGL_debug_renderer_info`
(no unmasked vendor/renderer). Set this **before** pasting the IIFE:

```js
window.__THREEJS_DOCTOR_ATTACH__ = {
  mode: 'safe-auto', // or omit for advise / Pass A
  device: 'phone',
}
```

`'phone'` overlays `{ maxTouchPoints: 5, coarsePointer: true, deviceMemory: 4, devicePixelRatio: 3, webgpu: false }`
onto the live probe (WebGL float-buffer extensions are still read from the
context when present). Equivalent explicit overlay:

```js
window.__THREEJS_DOCTOR_ATTACH__ = {
  mode: 'safe-auto',
  device: {
    maxTouchPoints: 5,
    coarsePointer: true,
    deviceMemory: 4,
    devicePixelRatio: 3,
  },
}
```

That is still an **emulator / overlay**, not a real phone. Label any FPS you
copy into [`box-desktop-evidence.md`](../../docs/superpowers/acceptance/box-desktop-evidence.md)
as emulator vs real device. It does **not** close spec §3.

Pass A with the same overlay:

```js
window.__THREEJS_DOCTOR_ATTACH__ = { device: 'phone' }
```

`ThreejsDoctorLiveAttach.PHONE_CLASS_PROBE` is the `'phone'` object if you
construct `attachQualityLadder` yourself.

## Live URLs (do not vendor)

| Host | URL | Adapter |
|------|-----|---------|
| ocean-simulation | https://iamtechartist.github.io/ocean-simulation/ | Registers `createOceanAdapter` when `window.pelagic.debug` exists. If it is missing, the IIFE skips `registerAdapter` and runs generic Three.js caps only. Among **external** hosts, this is the only fully injectable one on box-desktop today. |
| acceptance-fixture (unpublished, local) | `pnpm --filter @threejs-doctor/acceptance-fixture dev` → http://localhost:5174/ | Generic caps. Discovers `window.__THREEJS_DOCTOR_HOST__`. No pelagic. Local injectability check only — **not** spec §3 / phone-class proof. |
| acceptance-fixture-game (unpublished, local, heavier) | `pnpm --filter @threejs-doctor/acceptance-fixture-game dev` → http://localhost:5175/ | Generic caps. Same host hook; InstancedMesh density, particles, fewer shadow casters than the uninstanced 158-call scene; still more draw units/triangles than the light fixture. Not spec §3. See [host-integration.md](../../docs/superpowers/acceptance/host-integration.md). |
| claude-of-tanks | https://cot.kevinliu.studio/ | Generic caps. No ocean adapter. Discovery may still miss closed-over scene/camera/renderer — see below. Needs explicit inject or a host hook. |
| Kinema | https://kinema-play.vercel.app/?forceWebGL=1 | Generic caps. Use the documented WebGL compatibility query so the capture stays on WebGL. Homepage: https://kinema-play.vercel.app. Needs explicit inject or a host hook. |
| catapult | https://sina-ghiasi.github.io/threejs-catapult-game/ | Generic caps. v3 box recapture with `deepWalk: true`: no freeze, no renderer (`window.__THREE__` is the string `"174"`). Blocked pending a host hook. |
| Clockwork Climb | https://tommyato.github.io/gamedevjs-2026-entry/ (or local) | Continuous rAF game. Load **`?verify-ui=1`**, then attach via `window.__ccGame`. `safe-auto` must **not** apply `frameloop-demand`. See [real-host-followups.md](../../docs/superpowers/acceptance/real-host-followups.md). |

## Arm `renderer.prototype.render` capture (tanks / catapult)

Bundled hosts often close over `scene` / `camera` / `renderer`. One-liner:
**arm the one-shot `WebGLRenderer.prototype.render` hook, wait one frame, then paste the IIFE.**

If `window.THREE` (or `window.three` / object `window.__THREE__`) exists, paste
[`examples/host-shim/capture.js`](../host-shim/capture.js) first, wait one
rendered frame, then paste `dist/attach.iife.js`.

If you already pasted the IIFE with auto-run off, the same hook is:

```js
window.__THREEJS_DOCTOR_ATTACH__ = { autoRun: false }
// paste dist/attach.iife.js, then:
ThreejsDoctorLiveAttach.installRendererRenderCapture()
// wait one rendered frame, then:
await ThreejsDoctorLiveAttach.attachQualityLadder({ mode: 'advise' })
```

If `THREE.WebGLRenderer` is not on the page, **do not** assume a default paste
will deep-walk the graph (that froze live moonbase). Opt in with
`window.__THREEJS_DOCTOR_ATTACH__ = { deepWalk: true }` for a bounded BFS, or
pass `{ scene, camera, renderer }` explicitly from that page’s console.

## If discovery cannot find scene / camera / renderer

Bundled apps (Claude-of-Tanks, many Vite/webpack games) often keep Three.js
objects in module closures, **not** on `window`. The IIFE now tries, in order:

1. Explicit `attachQualityLadder({ scene, camera, renderer })`
2. `window.__THREEJS_DOCTOR_HOST__` (`{ scene, camera, renderer }` — used by the
   unpublished local [acceptance-fixture](../acceptance-fixture/README.md); no pelagic required)
3. `window.pelagic.debug` (ocean)
4. **Canvas walk** — `document.querySelectorAll('canvas')`, then `__THREE__`,
   `userData`, `_renderer` / `__renderer`, and a WebGL context bag if Three (or
   the host) stored a renderer there. Three.js itself does **not** always attach
   a reverse mapping on the canvas.
5. **Bundle roots** — `window.app`, `window.game`, `window.__ccGame`, `window.__THREE__`, and
   module-like `default` / `exports` singletons (non-enumerable keys included;
   throwing getters are skipped)
6. Shallow enumerable global walk (depth 4 / 400 visits — not a full-page BFS)
7. **Deep walk (opt-in)** — only if `window.__THREEJS_DOCTOR_ATTACH__.deepWalk === true`
   (or `attachQualityLadder({ deepWalk: true })`). BFS from `window`, `document`,
   and each canvas (non-enumerable own props, `isWebGLRenderer === true` or
   `constructor.name === 'WebGLRenderer'`, skip cross-origin iframes). Hard caps:
   **5000 nodes**, **depth 8**, **80ms** wall clock; abort returns undefined.
   Default attach skips this step so paste cannot freeze a real game.
8. If `THREE.WebGLRenderer` (or `three.WebGLRenderer`) is on the page, **or** a
   renderer instance was found and exposes a constructor prototype: hook
   `prototype.render` **once**, wait a few frames, and read
   `__THREEJS_DOCTOR_HOST__` (same helper as
   [`examples/host-shim`](../host-shim/README.md))
9. If a `WebGLRenderer` is found but scene/camera are missing: renderer
   properties (`scene`, `_scene`, `userData`, …) then a temporary instance
   `render()` hook for a few frames

When that still fails, the throw lists what **was** found (canvas count, whether
a WebGL context exists, renderer/scene/camera yes/no) and how to pass handles
from **this page’s own console** once you locate them:

```js
window.__THREEJS_DOCTOR_ATTACH__ = { autoRun: false }
// paste attach.iife.js
await ThreejsDoctorLiveAttach.attachQualityLadder({
  mode: 'advise',
  scene,
  camera,
  renderer,
})
```

1. In the page’s own sources, find the live `scene`, `camera`, and
   `WebGLRenderer` (breakpoint on `WebGLRenderer.render`, Three inspector, or
   whatever global the demo already exposes).
2. Pass `{ scene, camera, renderer }` as above. Discovery cannot invent them.

Ocean: `window.pelagic.debug` usually has `scene` and `renderer`; camera may be
on that bag or in the scene graph.

**Claude-of-Tanks** (`https://cot.kevinliu.studio/`) **and catapult**:
scene/camera/renderer are typically closed over in the bundle. Default paste
stays on cheap paths. For a bounded instance walk on those hosts, set
`window.__THREEJS_DOCTOR_ATTACH__ = { deepWalk: true }` before pasting (or
before host-shim). **Catapult v3** on this box with `deepWalk: true` did **not
freeze** and still found no renderer (`window.__THREE__` string `"174"`). Tanks /
kinema / moonbase stay blocked pending host hooks. Unit tests are not a live
capture. If the renderer is fully closed over, pass
`{ scene, camera, renderer }` explicitly from the page console. Do not vendor
the demo. Do not invent metrics.

Manual capture (same hook the IIFE uses). Cheap constructor lookup by default;
add `deepWalk: true` to search nested instances:

```js
window.__THREEJS_DOCTOR_ATTACH__ = { autoRun: false, deepWalk: true }
// paste attach.iife.js
ThreejsDoctorLiveAttach.installRendererRenderCapture({ deepWalk: true })
// wait one rendered frame, then:
await ThreejsDoctorLiveAttach.attachQualityLadder({ mode: 'advise', deepWalk: true })
```

## Bookmarklet

The IIFE is the pasteable artifact. A bookmarklet that `fetch`es this file will
fail on GitHub raw (CORS) for a private clone. Either paste the IIFE, or host
`attach.iife.js` yourself and use:

```
javascript:(function(){var s=document.createElement('script');s.src='https://YOUR_HOST/attach.iife.js';document.documentElement.appendChild(s)})();
```

Set `window.__THREEJS_DOCTOR_ATTACH__` **before** the script runs to choose
`mode: 'safe-auto'` and/or `device: 'phone'`.

For bundled games, a **capture-only** bookmarklet (hook `prototype.render` once)
is [`examples/host-shim/capture.js`](../host-shim/capture.js) — paste that first
if the IIFE cannot find handles.

## Notes

- `threejs-doctor scan` / `ci` are a **static** source gate, not this live-attach path.
- Headless CI does not gate live TTFI/FPS.
- Incomplete runs: keep baseline, set `incomplete: true`, do not paste fixture numbers.
