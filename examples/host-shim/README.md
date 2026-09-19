# Unpublished host-shim (bookmarklet)

Tiny paste-first helpers for bundled Three.js games (Claude-of-Tanks, catapult,
threejs.org examples) that keep `scene` / `camera` / `renderer` in closures.

## Preferred: one assignment (game authors / auditors)

Drop [`expose.js`](./expose.js) next to where the renderer is constructed:

```js
window.__THREEJS_DOCTOR_HOST__ = { scene, camera, renderer }
// optional: composer
```

Then paste [`examples/live-attach/dist/attach.iife.js`](../live-attach/dist/attach.iife.js).
No `deepWalk`. No prototype hook. This is the path live-attach prefers.

## Second path: intercept `three.module.js` (before the renderer exists)

Official examples do **not** expose globals. `window.__THREE__` is often a
revision **string**, not the library. `WebGLRenderer` assigns `this.render` as
an **instance own-property**, so patching `WebGLRenderer.prototype.render`
never runs.

Working auditor path: intercept `three.module.js` (import-map override or
Chrome local override) **before** `new WebGLRenderer()`, wrap the constructor
so the first `render(scene, camera)` writes
`window.__THREEJS_DOCTOR_HOST__`, then paste the live-attach IIFE.

[`intercept-three-module.js`](./intercept-three-module.js):

1. Paste it into DevTools on a page that already has `window.THREE.WebGLRenderer`
   **before** the example constructs the renderer (or reload after wrapping).
2. Or, in a local override of `three.module.js` / an import-map shim, call:

```js
ThreejsDoctorHostShim.wrapWebGLRendererModule(threeModule)
```

3. Wait one rendered frame. Confirm `window.__THREEJS_DOCTOR_HOST__`.
4. Paste `examples/live-attach/dist/attach.iife.js`.

Box SwiftShader (not spec §3; no invented FPS): Pass A+B with that HOST path on
`webgl_camera.html` and `webgl_lights_hemisphere.html`. Blocked without HOST:
`webgl_animation_skinning_blending.html`, `webgl_lights_physical.html`.

## Prototype hook is a known non-starter on official three.module.js

[`capture.js`](./capture.js) hooks `WebGLRenderer.prototype.render` **once**
(or a discovered instance `render` when that function is an own property),
writes `window.__THREEJS_DOCTOR_HOST__`, then restores the original method.
If `__THREEJS_DOCTOR_HOST__` is already complete, the shim does nothing.

Use `capture.js` only when instances actually call through the prototype (older
UMD `window.THREE`). On current `three.module.js`, use the HOST assignment or
`intercept-three-module.js` instead.

This folder is **not** a workspace package and is **not** published. The
unit-tested constructor wrap lives in
[`examples/live-attach/src/capture-host.ts`](../live-attach/src/capture-host.ts)
(`wrapWebGLRendererCtor`). Discovery: [`discover.ts`](../live-attach/src/discover.ts)
(`findRendererDeep`). The live-attach IIFE also installs a prototype/instance
hook when discovery misses handles — that still cannot invent a closed-over
renderer, and it cannot see own-property `render` via the prototype.

## Paste before the live-attach IIFE

1. Prefer [`expose.js`](./expose.js) if you can edit the game.
2. For official examples / ES modules, intercept `three.module.js` with
   [`intercept-three-module.js`](./intercept-three-module.js) **before** the
   renderer is constructed.
3. For bundled hosts (no `window.THREE`), set
   `window.__THREEJS_DOCTOR_ATTACH__ = { deepWalk: true }` first only if you need
   the bounded instance walk.
4. Paste [`capture.js`](./capture.js) only when prototype `render` is actually
   used. Wait one rendered frame.
5. Confirm `window.__THREEJS_DOCTOR_HOST__` has `scene`, `camera`, `renderer`.
6. Optionally set `mode` / `device: 'phone'` on `__THREEJS_DOCTOR_ATTACH__`.
7. Paste `examples/live-attach/dist/attach.iife.js`.

Lookup order (`capture.js`):

- Existing `window.__THREEJS_DOCTOR_HOST__` (already complete → skip)
- `window.THREE` / `window.three` / object `window.__THREE__` / `window.WebGLRenderer`
- else, **only if** `window.__THREEJS_DOCTOR_ATTACH__.deepWalk === true`, a
  **bounded BFS** from `window`, `document`, and each canvas (non-enumerable
  own props, `isWebGLRenderer === true` or constructor name `WebGLRenderer`,
  skip cross-origin iframes, **5000 nodes / depth 8 / 80ms**; abort does not
  hook). A string `window.__THREE__` is not treated as the library. Default
  paste of this shim does **not** walk the graph (live moonbase froze on the
  old 50k sync walk).

If the renderer is fully closed over and not on that graph, this shim cannot
invent it. Pass handles explicitly:

```js
window.__THREEJS_DOCTOR_ATTACH__ = { autoRun: false }
// paste attach.iife.js
await ThreejsDoctorLiveAttach.attachQualityLadder({ scene, camera, renderer })
```

**Re-test tanks / catapult on the box.** Catapult v3 (`deepWalk: true`) did not
freeze and still found no renderer. Unit tests are not a live capture.

## Bookmarklet

Host `capture.js` / `intercept-three-module.js` yourself (GitHub raw CORS will
fail for a private clone):

```
javascript:(function(){var s=document.createElement('script');s.src='https://YOUR_HOST/intercept-three-module.js';document.documentElement.appendChild(s)})();
```

Or paste the file body as a bookmarklet (prefix `javascript:`).

Do not invent metrics. This shim only captures handles.
