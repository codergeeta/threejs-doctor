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

## P3 — trustworthy before/after

Stable A/B (fixed poses, interleaved, noise band); pixel-diff before calling a pass "safe"; invalidate when hidden/throttled; score by measured cost; test real scenes, not only fixed-clock mocks.

## distance-cull (opt-in)

The pass remains available as `optimize({ apply: ['distance-cull'] })` or `optimize({ apply: ['aggressive'] })`. It uses world-space bounds / `getWorldPosition` and is **one-shot**. Hosts must re-run it (or use a per-frame variant) as the camera moves. Three.js already frustum-culls; this pass is not part of default `SAFE_PASSES`.
