# Changelog

## Unreleased

- **0.1.2 pending npm publish** after merge. Do not publish from a cloud agent VM. Trusted Publisher (OIDC provenance) is still needed; 0.1.0/0.1.1 were token publishes.

## 0.1.2

- Runtime: `waitGpuMacrotask` races `requestAnimationFrame` against a short timeout so `measure()` cannot hang in a background tab; timeout/hidden bails with `invalid: 'hidden'`.
- Runtime: visual-gate rollback undoes **only** handles from the current `optimize()` call. Earlier accepted passes stay applied; the report’s after/deltas/appliedPasses reflect the restored accepted state.
- Scan: `--profile auto` treats any continuous loop as `game` and never recommends `frameloop-demand` from static facts alone.
- Scan: positional light intensity `0`, non-literal-false `castShadow` assignments, Points/Line/Sprite frustumCulled as info, drop `materials/too-unique`, composer pixel-ratio drift, `.gitignore` / minified / vendored three skip, `file:line` on findings, `--format sarif`, Static Doctor Score label.

## 0.1.1

- Real static scan + `ci --min-score`.
- Docs: **0.1.1 is on npm**. Trusted Publisher remains leftover (not a blocker).
- live-attach: cheap bundled-host discovery — host `composer`, canvas `domElement` reverse lookup, R3F `canvas.__r3f`, WebGL canvas cap (max 8), extra bundle roots. Cheap walk does not expand live `scene` graphs. Deep walk stays opt-in. Host snippet: `examples/host-shim/expose.js`.
- host-shim: official `three.module.js` assigns own-property `render` (prototype hooks never run); optional `intercept-three-module.js` wraps the constructor so the first `render(scene, camera)` writes `__THREEJS_DOCTOR_HOST__`.
