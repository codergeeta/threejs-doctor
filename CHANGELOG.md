# Changelog

## Unreleased

- Docs: **0.1.1 is on npm**. Trusted Publisher remains optional leftover (not a blocker).
- live-attach: cheap bundled-host discovery — host `composer`, canvas `domElement` reverse lookup, R3F `canvas.__r3f`, WebGL canvas cap (max 8), extra bundle roots. Cheap walk does not expand live `scene` graphs. Deep walk stays opt-in. Host snippet: `examples/host-shim/expose.js`.
- host-shim: official `three.module.js` assigns own-property `render` (prototype hooks never run); optional `intercept-three-module.js` wraps the constructor so the first `render(scene, camera)` writes `__THREEJS_DOCTOR_HOST__`.

## 0.1.1

- Real static scan + `ci --min-score`.
