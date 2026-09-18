# Unpublished host-shim (bookmarklet)

Tiny paste-first helper for bundled Three.js games (Claude-of-Tanks, catapult)
that keep `scene` / `camera` / `renderer` in closures. It hooks
`THREE.WebGLRenderer.prototype.render` **once**, writes
`window.__THREEJS_DOCTOR_HOST__ = { scene, camera, renderer }`, then restores
the original method.

This folder is **not** a workspace package and is **not** published. The
unit-tested implementation lives in
[`examples/live-attach/src/capture-host.ts`](../live-attach/src/capture-host.ts).
The live-attach IIFE also installs the same hook when discovery misses handles
and `THREE.WebGLRenderer` is on the page.

## Paste before the live-attach IIFE

If `window.THREE` exists (or `window.three`):

1. Paste [`capture.js`](./capture.js) into DevTools. Wait one rendered frame.
2. Confirm `window.__THREEJS_DOCTOR_HOST__` has `scene`, `camera`, `renderer`.
3. Optionally set `window.__THREEJS_DOCTOR_ATTACH__` (`mode`, `device: 'phone'`, …).
4. Paste `examples/live-attach/dist/attach.iife.js`.

If `THREE` is not on `window`, this shim cannot invent it. Use a breakpoint on
`WebGLRenderer.prototype.render` in the page’s own sources, then pass handles
explicitly:

```js
window.__THREEJS_DOCTOR_ATTACH__ = { autoRun: false }
// paste attach.iife.js
await ThreejsDoctorLiveAttach.attachQualityLadder({ scene, camera, renderer })
```

## Bookmarklet

Host `capture.js` yourself (GitHub raw CORS will fail for a private clone):

```
javascript:(function(){var s=document.createElement('script');s.src='https://YOUR_HOST/capture.js';document.documentElement.appendChild(s)})();
```

Or paste the contents of `capture.js` as a bookmarklet body (prefix `javascript:`).

Do not invent metrics. This shim only captures handles.
