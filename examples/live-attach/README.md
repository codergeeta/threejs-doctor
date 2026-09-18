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
| claude-of-tanks | https://cot.kevinliu.studio/ | Generic caps. No ocean adapter. Discovery may still miss closed-over scene/camera/renderer — see below. Needs explicit inject or a host hook. |
| Kinema | https://kinema-play.vercel.app/?forceWebGL=1 | Generic caps. Use the documented WebGL compatibility query so the capture stays on WebGL. Homepage: https://kinema-play.vercel.app. Needs explicit inject or a host hook. |
| catapult | https://sina-ghiasi.github.io/threejs-catapult-game/ | Generic caps. Canvas present; no discoverable handles on box-desktop. Needs explicit inject or a host hook. |

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
5. **Bundle roots** — `window.app`, `window.game`, `window.__THREE__`, and
   module-like `default` / `exports` singletons (non-enumerable keys included;
   throwing getters are skipped)
6. Shallow enumerable global walk
7. If `THREE.WebGLRenderer` (or `three.WebGLRenderer`) is on the page: hook
   `prototype.render` **once**, wait a few frames, and read
   `__THREEJS_DOCTOR_HOST__` (same helper as
   [`examples/host-shim`](../host-shim/README.md))
8. If a `WebGLRenderer` is found but scene/camera are missing: renderer
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
scene/camera/renderer are typically closed over in the bundle. If `window.THREE`
exists, paste [`examples/host-shim/capture.js`](../host-shim/capture.js) first
(or rely on the IIFE’s own one-shot `WebGLRenderer.prototype.render` hook), wait
one frame, then paste the IIFE. If `THREE` is not on `window`, you must pass
handles explicitly from the page console. Do not vendor the demo. Do not invent
metrics.

Manual capture (same hook the IIFE uses):

```js
window.__THREEJS_DOCTOR_ATTACH__ = { autoRun: false }
// paste attach.iife.js
ThreejsDoctorLiveAttach.installRendererRenderCapture()
// wait one rendered frame, then:
await ThreejsDoctorLiveAttach.attachQualityLadder({ mode: 'advise' })
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

- `npx threejs-doctor scan` is a stub and is not this path.
- Headless CI does not gate live TTFI/FPS.
- Incomplete runs: keep baseline, set `incomplete: true`, do not paste fixture numbers.
