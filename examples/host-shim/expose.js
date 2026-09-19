/* @threejs-doctor/host-shim unpublished. Drop-in for game authors / auditors.
   Call once after scene, camera, renderer exist. Then paste live-attach IIFE.
   Composer is optional. Do not invent metrics. */
window.__THREEJS_DOCTOR_HOST__ = {
  scene: scene,
  camera: camera,
  renderer: renderer,
  // composer: composer,
}
