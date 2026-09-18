# Real-host follow-ups (arcade racer / Kenney)

P0 from the real-host report (dpr-cap NaN, distance-cull hiding nested meshes, honest scan/ci, unpublished npm name) is handled in the runtime/CLI.

## P1 — measurements that reflect a live scene (done)

- **`measure()` times real frames.** `waitFrame` is the host render path when provided (live-attach rAF). Otherwise Doctor calls `renderFrame` or `renderer.render(scene, camera)` between `beginFrame` / `endFrame`. CPU times are wall-clock around that path. `gpuFrameTimeMs` is set only when `EXT_disjoint_timer_query_webgl2` returns an available query result — never invented.
- **EffectComposer drawCalls.** While measuring, `renderer.info.autoReset = false` (restored afterward) and `info.reset()` runs at the start of each sampled frame so composer passes accumulate (133, not 1).
- **Lights / textures / VRAM.** Default stats walk the scene graph for lights and material maps, plus render targets (`isWebGLRenderTarget` / `width`×`height`). VRAM uses a 4-byte-per-pixel lower bound when dimensions are known; the field is **omitted** when they are not.
- **`maxTextureSize`.** `readWebglQualitySignals` / `Doctor.getDevice()` read `MAX_TEXTURE_SIZE` from the GL context via `getParameter`. Live-attach `wrapRenderer` forwards `getContext`/`render`. Probe still defaults to 2048 only when the context does not report a size.
- **`profile: 'auto'`.** Prefers `game` for continuous RAF or high draw activity so meshCount crossing 200 (chunking) does not flip a running game to CAD. The first auto resolution is pinned for the Doctor instance. **Games should still set `profile: 'game'` explicitly.**

## P2 — checks that catch real cost (done, findings-only)

No new destructive safe passes. Fields are omitted when they cannot be counted.

- **Triangle budget + top contributors.** Scene-graph lower bound: `index.count/3` (else `position.count/3`) × `InstancedMesh.count`. Finding `triangles/too-many` when that total exceeds the profile budget; evidence names the heaviest mesh (`name:triangles` + share). `renderer.info.triangles` is not used as a substitute.
- **Uncullable meshes.** `culling/frustum-disabled` when `frustumCulled === false`. `culling/oversized-bounds` when a world-space bounding-sphere radius is **greater than `camera.far`** (the mesh cannot be perspective-rejected). Oversized finding is omitted without `camera.far` or a bounding sphere.
- **Shadow-pass cost.** `shadows/expensive-pass` when counted caster triangles (same formula, `castShadow` meshes only) exceed `maxShadowTriangles`. `shadows/casters-outside-frustum` when a caster's world sphere sits fully outside **every** testable shadow camera (ortho `left/right/top/bottom/near/far` in camera space, or perspective `fov/aspect/near/far`). Omitted when no shadow camera matrix/projection can be read.
- **Composer vs renderer.** Detect `isEffectComposer` or `{ passes, renderTarget1|writeBuffer }`. `renderer/composer-resolution-mismatch` when composer pixel ratio differs from `renderer.getPixelRatio()` or composer RT area differs from the drawing buffer by >10%.
- **Intensity 0.** `lights/zero-intensity` for lights with `intensity <= 0` that are still `visible !== false`. Suggest remove/disable rather than intensity 0.
- **InstancedMesh leaks.** `lifecycle/instance-buffer-growth` when `instanceMatrix`/`instanceColor` byte length (or `count × 16 × 4`) grows between measures even if geometry/texture counts stay flat.

## P3 — trustworthy before/after (done, scaffolding)

Prefer **invalid/incomplete** over a pretty false win. Fixed-clock mocks are not proof that a pass is visually safe on a real scene.

- **Stable A/B.** `compareAbSamples({ a, b })` averages interleaved rounds and builds a noise band from **A-round spread** (half-range). `claimAbDelta` never returns `win` inside that band. `Doctor.compareAb({ rounds, poses, applyB, restoreA })` pins a camera pose and interleaves A/B measures. Moving scenes without fixed poses are high-noise (~50% in the arcade-racer write-up); fixed poses were ~2%. The 2% floor is **not invented as a GPU number** — it is the documented host observation, and the harness uses the measured A variance.
- **Pixel-diff gate.** Opt-in: `optimize({ apply: ['safe'], visualGate: { capture, maxChangedRatio } })`. Control = capture twice before applying; if the candidate buffer changes more than `max(control, maxChangedRatio)` pixels, `visualDelta: true` (do not treat the pass as visually safe). Default runtime does **not** call `readPixels`. Unit tests use mocked RGBA buffers.
- **Hidden / throttled.** Live `measure()` (no synthetic `now`) sets `invalid` + `incomplete` when `document.visibilityState === 'hidden'`. Frame gaps ≥250ms (≥2 gaps, or any ≥1000ms) set `invalidReason: 'throttled-raf'`. Synthetic clocks used in unit tests are not treated as hidden tabs.
- **Score by measured cost.** `computeDoctorScore` applies a sliding penalty for `geometryTriangleCount` (else `triangles`) vs the profile budget, and a bonus when a **previous** snapshot shows a ≥20% triangle drop or a ≥10% drop in **measured** `gpuFrameTimeMs`. GPU time is never invented.
- **Real-scene testing.** Acceptance is [`real-host-followups.md`](./real-host-followups.md) plus unpublished fixtures ([`examples/acceptance-fixture`](../../../examples/acceptance-fixture), [`examples/acceptance-fixture-game`](../../../examples/acceptance-fixture-game)). See [host-integration.md](./host-integration.md). Headless bench fixtures / fixed `now()` clocks are CI smoke, not evidence that a pass is safe.

### Residual limits

- No default GPU readback; visual gate is opt-in and test-harness sized.
- Noise band is A-round half-range, not a confidence interval.
- Score still starts from findings; cost weighting is a directional correction, not a full profiler.
- Hidden-tab detection is skipped when the host injects `now()` (unit tests).

## Clockwork Climb / continuous RAF games

[Clockwork Climb](https://github.com/tommyato/gamedevjs-2026-entry) is a continuous rAF game. Attach only after the page exposes the host:

- Open with **`?verify-ui=1`** so debug/UI hooks are on.
- Then `window.__ccGame` holds the live `{ scene, camera, renderer }` (or a bundle root the IIFE can walk). Paste [`examples/live-attach/dist/attach.iife.js`](../../../examples/live-attach/dist/attach.iife.js) after that assignment exists. Preferred alias remains `window.__THREEJS_DOCTOR_HOST__`.

**`safe-auto` must not demand-loop games.** `frameloop-demand` is omitted from default `SAFE_PASSES` / Quality Ladder generic caps. Doctor `apply: ['safe']` and `QualityController` add it only when the profile is clearly `marketing` or `product` (static). Hosts that want it anyway opt in with `optimize({ apply: ['frameloop-demand'] })`. On a game, demand-loop starves frames, inflates p95, and marks samples `invalid` (`throttled-raf` / `floorFailed`).

**Caps must never raise resolution.** `pixel-budget` / `dpr-cap` treat Three.js `setDrawingBufferSize(width, height, pixelRatio)` as **CSS size × DPR**. Passing drawing-buffer (device) pixels as `width`/`height` multiplies DPR again and can increase `drawingBufferPixels` versus the advise baseline.

## distance-cull (opt-in)

The pass remains available as `optimize({ apply: ['distance-cull'] })` or `optimize({ apply: ['aggressive'] })`. It uses world-space bounds / `getWorldPosition` and is **one-shot**. Hosts must re-run it (or use a per-frame variant) as the camera moves. Three.js already frustum-culls; this pass is not part of default `SAFE_PASSES`.
