# Host integration (one screen)

Live-attach needs **`{ scene, camera, renderer }`**. Expose them **before** pasting
[`examples/live-attach/dist/attach.iife.js`](../../../examples/live-attach/dist/attach.iife.js).
Do not invent FPS. Capture JSON stays off-repo.

## Preferred: one assignment

```js
window.__THREEJS_DOCTOR_HOST__ = { scene, camera, renderer }
```

That is what the unpublished local hosts do:

- [`examples/acceptance-fixture`](../../../examples/acceptance-fixture/README.md)
- [`examples/acceptance-fixture-game`](../../../examples/acceptance-fixture-game/README.md) (heavier)

Discovery finds this on the **cheap path**. No `window.pelagic`. No `deepWalk`.

Optional aliases (same objects): `window.scene` / `window.camera` / `window.renderer`.

## Alternative: explicit inject from this page’s console

```js
window.__THREEJS_DOCTOR_ATTACH__ = { autoRun: false }
// paste attach.iife.js, then:
await ThreejsDoctorLiveAttach.attachQualityLadder({ scene, camera, renderer })
```

Use this when the renderer is closed over in a bundle (tanks / catapult / kinema).

## Ocean only: `window.pelagic.debug`

If `pelagic.debug` already has `scene` + `renderer`, the IIFE registers the ocean
adapter. **Do not fake `pelagic` on other games.**

## What not to rely on

- **`deepWalk: true`** is opt-in and hard-capped (5000 nodes / depth 8 / 80ms). It
  must not freeze the tab. It still **cannot invent** a fully closed-over renderer.
- Prototype `render` capture needs `THREE.WebGLRenderer` on the page (or an
  instance). A string `window.__THREE__` is not the library.
- External GitHub games stay **blocked pending a host hook** until one of the
  snippets above exists. Local fixtures are not those games.

Phone-class bar: [live-ocean-capture.md](./live-ocean-capture.md). Box-desktop
notes (not §3): [box-desktop-evidence.md](./box-desktop-evidence.md).
