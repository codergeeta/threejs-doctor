# Real-host follow-ups (arcade racer / Kenney)

P0 from the real-host report (dpr-cap NaN, distance-cull hiding nested meshes, honest scan/ci, unpublished npm name) is handled in the runtime/CLI. Remaining items are **not** blocking this PR.

## P1 — measurements do not reflect a live scene

- `measure()` currently `beginFrame` / `endFrame` with no render between unless the host supplies `waitFrame`. Prefer GPU timer queries (`EXT_disjoint_timer_query_webgl2`) when present.
- EffectComposer: `renderer.info` resets every `render()` so drawCalls can read ~1. Use `autoReset = false` while measuring.
- Lights / VRAM / textures are often never collected; several rules cannot fire.
- Device tier ignores GPU `maxTextureSize` when the probe does not pass it (defaults 2048).
- `profile: 'auto'` can misclassify (on-demand marketing vs meshCount CAD after chunking).

## P2 — checks worth adding

Triangle budget + top contributors; uncullable meshes; shadow-pass cost; composer vs renderer pixel ratio; per-pixel light cost (intensity 0 still costs); InstancedMesh buffer leaks beyond geo/tex.

## P3 — trustworthy before/after

Stable A/B (fixed poses, interleaved, noise band); pixel-diff before calling a pass "safe"; invalidate when hidden/throttled; score by measured cost; test real scenes, not only fixed-clock mocks.

## distance-cull (opt-in)

The pass remains available as `optimize({ apply: ['distance-cull'] })` or `optimize({ apply: ['aggressive'] })`. It uses world-space bounds / `getWorldPosition` and is **one-shot**. Hosts must re-run it (or use a per-frame variant) as the camera moves. Three.js already frustum-culls; this pass is not part of default `SAFE_PASSES`.
