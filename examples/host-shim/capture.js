/* @threejs-doctor/host-shim unpublished. Hook THREE.WebGLRenderer.prototype.render once. Do not invent metrics. */
(function (root) {
  var T = root.THREE || root.three || root.__THREE__
  var Ctor = (T && T.WebGLRenderer) || root.WebGLRenderer
  if (!Ctor || !Ctor.prototype || typeof Ctor.prototype.render !== 'function') {
    console.warn('[threejs-doctor host-shim] THREE.WebGLRenderer not found on this page')
    return
  }
  var proto = Ctor.prototype
  var original = proto.render
  proto.render = function (scene, camera) {
    var looksLikeScene = scene && (scene.isScene === true || (typeof scene.traverse === 'function' && Array.isArray(scene.children)))
    if (looksLikeScene) {
      root.__THREEJS_DOCTOR_HOST__ = { scene: scene, camera: camera, renderer: this }
      proto.render = original
      console.log('[threejs-doctor host-shim] captured scene/camera/renderer')
    }
    return original.apply(this, arguments)
  }
  console.log('[threejs-doctor host-shim] hooked WebGLRenderer.prototype.render once')
})(typeof window !== 'undefined' ? window : globalThis)
