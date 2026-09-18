# Real-host follow-ups (arcade racer / Kenney)

P0 from the real-host report (dpr-cap NaN, distance-cull hiding nested meshes, honest scan/ci, unpublished npm name) is handled in the runtime/CLI.

## Round 2 — arcade racer @60a09ff (this PR)

Confirmed still good: P0–P14 from round 1 (dpr-cap getPixelRatio+finite; scan/ci not-implemented; distance-cull opt-in world-space; frameloop-demand not on games; composer drawCalls autoReset; hidden/throttled invalid; new rules fire on 3/5 real problems).

Landed in this PR (must-fix 2–10 + CI partial):

| Item | Status |
|------|--------|
| 2 GPU timer | **Fixed.** `createQuery` / `beginQuery` / `endQuery` / `getQueryParameter` / `deleteQuery` run on `WebGL2RenderingContext`. EXT object is constants + `queryCounterEXT` only. Prefer `renderer.extensions.get('EXT_disjoint_timer_query_webgl2')`. Queries are queued; `QUERY_RESULT` is read on a later frame when `QUERY_RESULT_AVAILABLE`; `GPU_DISJOINT_EXT` discards; never invent `gpuFrameTimeMs`. |
| 3 Triangle cost | **Fixed.** Score + `triangles/too-many` use **drawn** `renderer.info.triangles` (includes extra shadow/composer passes when measured). `geometryTriangleCount` is scene-graph attribution (top contributors). After chunking, drawn can drop while unused geometry remains — unit tests separate the two. |
| 4 Composer discovery | **Fixed.** `DoctorOptions.composer` (wired through r3f `DoctorCanvas`). Discovery walks scene/renderer/`scene.userData`. Supports three.js `renderTarget1`/`writeBuffer` **and** pmndrs `inputBuffer`/`outputBuffer`. `composer-resolution-mismatch` fires when renderer DPR/size changes and the supplied composer is stale. |
| 5 InstancedMesh bounds | **Fixed.** `worldRadius` / center, distance-cull, oversized-bounds, casters-outside use `InstancedMesh.computeBoundingSphere()` / `computeBoundingBox()` (instance-aware), not the prototype geometry sphere. Verified against real `three` InstancedMesh. |
| 6 Instance-buffer leaks | **Fixed.** Tracker listens `removed` / `dispose` and diffs the graph so removed-without-dispose still flags `lifecycle/instance-buffer-growth`. Summing live buffers alone cannot see that leak. |
| 7 dpr-cap → composer | **Fixed.** When a composer is supplied/discovered, `dpr-cap` / pixel-budget call `setPixelRatio` or `setSize`, and/or `onPixelRatioChange`. |
| 8 `measure()` | **Fixed.** Prefer wrapping host `render` for CPU work (not vsync). Median drawCalls / drawn triangles across sampled frames. |
| 9 A/B + visual gate | **Fixed.** `compareAbSamples` uses **medians**; A-vs-A control is inside-noise. Default visual `maxChangedRatio` is **0.5%** (was 2% / ~18k px at 720p). `apply: ['safe']` is **not** a visual-safety claim — opt in with `visualGate` (control capture required). Honest README. |
| 10 Zero-intensity lights | **Fixed.** Copy prefers a fixed-size pool + `intensity`/`visible`; warns that **removing** lights recompiles materials. |
| 1 / CI (partial) | **This PR:** CI rebuilds the live-attach IIFE and fails on dist drift; Playwright + headless Chromium fixture (real three + EffectComposer + InstancedMesh). **Not this PR:** npm publish (needs tokens) — see [`docs/publish-checklist.md`](../../publish-checklist.md). Reserve unscoped `threejs-doctor`. |

## P1 — measurements that reflect a live scene (done)

- **`measure()` times real frames.** `waitFrame` advances to the next host frame. Doctor wraps `renderer.render` / `composer.render` / `hostRenderer.render` so CPU times are work, not vsync. When `waitFrame` is omitted, Doctor calls `renderFrame` or `composer.render` or `renderer.render(scene, camera)` between `beginFrame` / `endFrame`. `gpuFrameTimeMs` is set only when a **queued** `EXT_disjoint_timer_query_webgl2` result is available on the GL context — never invented.
- **EffectComposer drawCalls.** While measuring, `renderer.info.autoReset = false` (restored afterward) and `info.reset()` runs at the start of each sampled frame so composer passes accumulate (133, not 1). Sampled drawCalls / triangles are the **median** across frames, not last-only.
- **Lights / textures / VRAM.** Default stats walk the scene graph for lights and material maps, plus render targets (`isWebGLRenderTarget` / `width`×`height`). VRAM uses a 4-byte-per-pixel lower bound when dimensions are known; the field is **omitted** when they are not.
- **`maxTextureSize`.** `readWebglQualitySignals` / `Doctor.getDevice()` read `MAX_TEXTURE_SIZE` from the GL context via `getParameter`. Live-attach `wrapRenderer` forwards `getContext`/`render`/`extensions.get`. Probe still defaults to 2048 only when the context does not report a size.
- **`profile: 'auto'`.** Prefers `game` for continuous RAF or high draw activity so meshCount crossing 200 (chunking) does not flip a running game to CAD. The first auto resolution is pinned for the Doctor instance. **Games should still set `profile: 'game'` explicitly.**

## P2 — checks that catch real cost (done, findings-only)

No new destructive safe passes. Fields are omitted when they cannot be counted.

- **Triangle budget + top contributors.** **Cost** = drawn `renderer.info.triangles`. **Attribution** = scene-graph `index.count/3` (else `position.count/3`) × `InstancedMesh.count`. Finding `triangles/too-many` when **drawn** exceeds the profile budget; evidence still names the heaviest mesh (`name:triangles` + share) from the graph.
- **Uncullable meshes.** `culling/frustum-disabled` when `frustumCulled === false`. `culling/oversized-bounds` when a world-space bounding-sphere radius is **greater than `camera.far`**. InstancedMesh uses `computeBoundingSphere()`. Oversized finding is omitted without `camera.far` or a bounding sphere.
- **Shadow-pass cost.** `shadows/expensive-pass` when counted caster triangles (same formula, `castShadow` meshes only) exceed `maxShadowTriangles`. `shadows/casters-outside-frustum` when a caster's **instance-aware** world sphere sits fully outside **every** testable shadow camera. Omitted when no shadow camera matrix/projection can be read.
- **Composer vs renderer.** Detect `isEffectComposer`, `{ passes, renderTarget1\|writeBuffer }`, or pmndrs `{ passes, inputBuffer\|outputBuffer }`. Pass `DoctorOptions.composer` when the composer is not on the graph. `renderer/composer-resolution-mismatch` when composer pixel ratio differs from `renderer.getPixelRatio()` or composer RT area differs from the drawing buffer by >10%, including after a renderer DPR/size change with a stale composer.
- **Intensity 0.** `lights/zero-intensity` for lights with `intensity <= 0` that are still `visible !== false`. Prefer a **fixed-size light pool** and disable via intensity/visible. Removing lights recompiles materials and can hitch.
- **InstancedMesh leaks.** `lifecycle/instance-buffer-growth` when `instanceMatrix`/`instanceColor` byte length grows **or** an InstancedMesh is **removed without dispose()** (listen `removed` / `dispose`; do not rely only on summing buffers still in the graph).

## P3 — trustworthy before/after (done, scaffolding)

Prefer **invalid/incomplete** over a pretty false win. Fixed-clock mocks are not proof that a pass is visually safe on a real scene.

- **Stable A/B.** `compareAbSamples({ a, b })` uses **medians** of interleaved rounds and builds a noise band from **A-round spread** (half-range). An A-vs-A control is `inside-noise`. `claimAbDelta` never returns `win` inside that band. `Doctor.compareAb({ rounds, poses, applyB, restoreA })` pins a camera pose and interleaves A/B measures. Moving scenes without fixed poses are high-noise (~50% in the arcade-racer write-up); fixed poses were ~2%. The 2% floor is **not invented as a GPU number** — it is the documented host observation, and the harness uses the measured A variance.
- **Pixel-diff gate.** Opt-in: `optimize({ apply: ['safe'], visualGate: { capture, maxChangedRatio } })`. Control = capture twice before applying (reproduce-before-safe). If the candidate buffer changes more than `max(control, maxChangedRatio)` pixels, `visualDelta: true` (do not treat the pass as visually safe). Default `maxChangedRatio` is **0.005** (0.5% of pixels, ~4.6k at 720p — tighter than 2% / ~18k). Default runtime does **not** call `readPixels`. `apply: ['safe']` without `visualGate` is **not** a visual-safety claim. Unit tests use mocked RGBA buffers.
- **Hidden / throttled.** Live `measure()` (no synthetic `now`) sets `invalid` + `incomplete` when `document.visibilityState === 'hidden'`. Frame gaps ≥250ms (≥2 gaps, or any ≥1000ms) set `invalidReason: 'throttled-raf'`. Synthetic clocks used in unit tests are not treated as hidden tabs.
- **Score by measured cost.** `computeDoctorScore` applies a sliding penalty for **drawn** `triangles` vs the profile budget, and a bonus when a **previous** snapshot shows a ≥20% **drawn** drop or a ≥10% drop in **measured** `gpuFrameTimeMs`. GPU time is never invented. Leftover unused geometry does not block the bonus.
- **Real-scene testing.** Acceptance is this file plus unpublished fixtures ([`examples/acceptance-fixture`](../../../examples/acceptance-fixture), [`examples/acceptance-fixture-game`](../../../examples/acceptance-fixture-game), Playwright [`examples/real-host-e2e`](../../../examples/real-host-e2e)). See [host-integration.md](./host-integration.md). Headless bench fixtures / fixed `now()` clocks are CI smoke, not evidence that a pass is visually safe.

### Residual limits

- No default GPU readback; visual gate is opt-in and test-harness sized.
- Noise band is A-round half-range, not a confidence interval.
- Score still starts from findings; cost weighting is a directional correction, not a full profiler.
- Hidden-tab detection is skipped when the host injects `now()` (unit tests).
- **npm publish** is still a follow-up (`docs/publish-checklist.md`); no tokens in this PR.
- SwiftShader / headless Chromium is correctness for sampler wiring, composer mismatch, instance bounds, and drawn-triangle drop — not a GPU-time number.

## Clockwork Climb / continuous RAF games

[Clockwork Climb](https://github.com/tommyato/gamedevjs-2026-entry) is a continuous rAF game. Attach only after the page exposes the host:

- Open with **`?verify-ui=1`** so debug/UI hooks are on.
- Then `window.__ccGame` holds the live `{ scene, camera, renderer }` (or a bundle root the IIFE can walk). Paste [`examples/live-attach/dist/attach.iife.js`](../../../examples/live-attach/dist/attach.iife.js) after that assignment exists. Preferred alias remains `window.__THREEJS_DOCTOR_HOST__`.

**`safe-auto` must not demand-loop games.** `frameloop-demand` is omitted from default `SAFE_PASSES` / Quality Ladder generic caps. Doctor `apply: ['safe']` and `QualityController` add it only when the profile is clearly `marketing` or `product` (static). Hosts that want it anyway opt in with `optimize({ apply: ['frameloop-demand'] })`. On a game, demand-loop starves frames, inflates p95, and marks samples `invalid` (`throttled-raf` / `floorFailed`).

**Caps must never raise resolution.** `pixel-budget` / `dpr-cap` treat Three.js `setDrawingBufferSize(width, height, pixelRatio)` as **CSS size × DPR**. Passing drawing-buffer (device) pixels as `width`/`height` multiplies DPR again and can increase `drawingBufferPixels` versus the advise baseline.

## distance-cull (opt-in)

The pass remains available as `optimize({ apply: ['distance-cull'] })` or `optimize({ apply: ['aggressive'] })`. It uses world-space bounds / `getWorldPosition` and **InstancedMesh.computeBoundingBox()** when present. It is **one-shot**. Hosts must re-run it (or use a per-frame variant) as the camera moves. Three.js already frustum-culls; this pass is not part of default `SAFE_PASSES`.
