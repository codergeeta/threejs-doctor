# Unpublished acceptance mini-game

Heavier unpublished Three.js host than
[`examples/acceptance-fixture`](../acceptance-fixture/README.md): a denser
**InstancedMesh** box field, instanced spheres/toruses, a 64-beacon ring, a
particle fountain, and **two** shadow-casting lights (fewer casters than the
uninstanced 158-call version). Draw units and triangles stay above the light
fixture (66 / 19010). **Not** a live FPS proof and **not** the spec §3 bar.

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
`__THREEJS_DOCTOR_HOST__`. See
[`docs/superpowers/acceptance/host-integration.md`](../../docs/superpowers/acceptance/host-integration.md).

Do not invent `avgFps` / `ttfiMs` / `after` metrics from this fixture. Capture
JSON stays off-repo. For trustworthy before/after (fixed poses, noise band,
invalid hidden/throttled) see
[`docs/superpowers/acceptance/real-host-followups.md`](../../docs/superpowers/acceptance/real-host-followups.md).

## Open locally

From the repo root (after `pnpm install`):

```bash
pnpm --filter @threejs-doctor/acceptance-fixture-game dev
```

Then open http://localhost:5175/ . `vite preview` works after `pnpm --filter
@threejs-doctor/acceptance-fixture-game build`:

```bash
pnpm --filter @threejs-doctor/acceptance-fixture-game build
pnpm --filter @threejs-doctor/acceptance-fixture-game preview
```

A static `index.html` is in this folder; ES modules need a local server (Vite
above), not `file://`.

## Attach live-attach

1. Leave the mini-game tab open until the canvas is drawing.
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
pnpm --filter @threejs-doctor/acceptance-fixture-game test
```

Node/jsdom-free smoke: host object shape, InstancedMesh draw-unit accounting,
and that this scene stays heavier than the first unpublished fixture (more
draw units and triangles, particles kept) without 158 uninstanced calls.
No FPS numbers.
