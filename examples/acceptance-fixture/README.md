# Unpublished acceptance fixture

Vanilla Three.js page with a **non-trivial** mesh load (grid of boxes, high-segment
sphere, shadow-casting lights) so generic Quality Ladder caps have something to
do. **Not** a live FPS proof and **not** the spec §3 bar.

**This package is `private: true`.** It is not published. It does not vendor
ocean-simulation, Claude-of-Tanks, Kinema, or catapult.

The page assigns:

```js
window.__THREEJS_DOCTOR_HOST__ = { scene, camera, renderer }
window.scene = scene
window.camera = camera
window.renderer = renderer
```

There is **no** `window.pelagic`. Live-attach discovers the host object via
`__THREEJS_DOCTOR_HOST__`.

Do not invent `avgFps` / `ttfiMs` / `after` metrics from this fixture. Capture
JSON stays off-repo.

## Open locally

From the repo root (after `pnpm install`):

```bash
pnpm --filter @threejs-doctor/acceptance-fixture dev
```

Then open http://localhost:5174/ . `vite preview` works after `pnpm --filter
@threejs-doctor/acceptance-fixture build`:

```bash
pnpm --filter @threejs-doctor/acceptance-fixture build
pnpm --filter @threejs-doctor/acceptance-fixture preview
```

A static `index.html` is in this folder; ES modules need a local server (Vite
above), not `file://`.

## Attach live-attach

1. Leave the fixture tab open until the canvas is drawing.
2. Open DevTools → Console.
3. Paste the entire contents of
   [`examples/live-attach/dist/attach.iife.js`](../live-attach/dist/attach.iife.js)
   and press Enter.
4. Copy the report with
   `copy(JSON.stringify(window.__THREEJS_DOCTOR_LAST_REPORT__))`. Save **off-repo**.

Default mode is `advise`. For `safe-auto`:

```js
window.__THREEJS_DOCTOR_ATTACH__ = { mode: 'safe-auto' }
```

then paste the IIFE. This local run does **not** replace phone-class ocean
evidence for spec §3.

## Tests

```bash
pnpm --filter @threejs-doctor/acceptance-fixture test
```

Node/jsdom-free smoke: host object shape and scene stats only. No FPS numbers.
