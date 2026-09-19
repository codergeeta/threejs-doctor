/* @threejs-doctor/host-shim unpublished.
   Wrap WebGLRenderer so the first render(scene, camera) writes __THREEJS_DOCTOR_HOST__.
   Official three.module.js assigns this.render as an instance own-property;
   patching WebGLRenderer.prototype.render never runs. window.__THREE__ is often
   a revision string, not the library. Do not invent metrics. Deep walk stays opt-in. */
(function (root) {
  function isObj(v) {
    return v && typeof v === 'object'
  }

  function looksLikeScene(scene) {
    return scene && (scene.isScene === true || (typeof scene.traverse === 'function' && Array.isArray(scene.children)))
  }

  function hookInstance(target) {
    if (!target || typeof target.render !== 'function') return false
    var original = target.render
    target.render = function (scene, camera) {
      if (looksLikeScene(scene)) {
        var host = { scene: scene, camera: camera, renderer: this }
        if (this && this.composer) host.composer = this.composer
        root.__THREEJS_DOCTOR_HOST__ = host
        target.render = original
        console.log('[threejs-doctor host-shim] captured scene/camera/renderer')
      }
      return original.apply(this, arguments)
    }
    return true
  }

  function wrapCtor(Ctor) {
    if (typeof Ctor !== 'function') return Ctor
    function WrappedWebGLRenderer() {
      var instance
      try {
        instance = Reflect.construct(Ctor, arguments)
      } catch (e) {
        instance = Ctor.apply(this, arguments)
      }
      var target = instance && typeof instance === 'object' ? instance : this
      hookInstance(target)
      return instance
    }
    WrappedWebGLRenderer.prototype = Ctor.prototype
    try {
      Object.setPrototypeOf(WrappedWebGLRenderer, Ctor)
    } catch (e) {}
    try {
      Object.defineProperty(WrappedWebGLRenderer, 'name', { value: Ctor.name })
    } catch (e) {}
    return WrappedWebGLRenderer
  }

  function wrapModule(mod) {
    if (!isObj(mod) || typeof mod.WebGLRenderer !== 'function') return false
    if (mod.WebGLRenderer.__threejsDoctorWrapped) return true
    var wrapped = wrapCtor(mod.WebGLRenderer)
    wrapped.__threejsDoctorWrapped = true
    mod.WebGLRenderer = wrapped
    console.log('[threejs-doctor host-shim] wrapped WebGLRenderer constructor (own-property render)')
    return true
  }

  var existing = isObj(root.__THREEJS_DOCTOR_HOST__) ? root.__THREEJS_DOCTOR_HOST__ : null
  if (existing && existing.scene && existing.renderer) {
    console.log('[threejs-doctor host-shim] host already present')
    root.ThreejsDoctorHostShim = { wrapWebGLRendererModule: wrapModule, wrapWebGLRendererCtor: wrapCtor }
    return
  }

  var ns = root.THREE || root.three || (isObj(root.__THREE__) ? root.__THREE__ : null)
  wrapModule(ns)

  root.ThreejsDoctorHostShim = { wrapWebGLRendererModule: wrapModule, wrapWebGLRendererCtor: wrapCtor }
})(typeof window !== 'undefined' ? window : globalThis)
