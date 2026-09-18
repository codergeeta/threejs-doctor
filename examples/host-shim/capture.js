/* @threejs-doctor/host-shim unpublished. Hook WebGLRenderer render once. Deep-walk only if __THREEJS_DOCTOR_ATTACH__.deepWalk. Keep enqueue in sync with live-attach findRendererDeep. Do not invent metrics. */
(function (root) {
  var MAX_VISITS = 5000
  var MAX_DEPTH = 8
  var MAX_MS = 80
  var SKIP = {
    document: 1, location: 1, navigation: 1, window: 1, self: 1, frames: 1, parent: 1, top: 1,
    navigator: 1, performance: 1, console: 1, localStorage: 1, sessionStorage: 1, history: 1,
    screen: 1, visualViewport: 1, crypto: 1, indexedDB: 1, chrome: 1, external: 1, css: 1,
    parentNode: 1, parentElement: 1, offsetParent: 1, ownerDocument: 1, style: 1, classList: 1,
    dataset: 1, attributes: 1, childNodes: 1, children: 1, firstChild: 1, lastChild: 1,
    nextSibling: 1, previousSibling: 1, nextElementSibling: 1, previousElementSibling: 1,
    geometry: 1, morphAttributes: 1, index: 1,
    __THREEJS_DOCTOR_HOST__: 1, __THREEJS_DOCTOR_LAST_REPORT__: 1, __THREEJS_DOCTOR_ATTACH__: 1,
  }

  function isObj(v) {
    return v && typeof v === 'object'
  }

  function isNamedRenderer(v) {
    try {
      return !!(v && v.constructor && v.constructor.name === 'WebGLRenderer' && typeof v.render === 'function')
    } catch (e) {
      return false
    }
  }

  function isDuckRenderer(v) {
    return typeof v.setPixelRatio === 'function' && isObj(v.info)
  }

  function isIframe(v) {
    return isObj(v) && typeof v.tagName === 'string' && String(v.tagName).toUpperCase() === 'IFRAME'
  }

  function crossOriginIframe(v) {
    if (!isIframe(v)) return false
    try {
      var w = v.contentWindow
      if (w) void w.location.href
      return false
    } catch (e) {
      return true
    }
  }

  function looksLikeScene(scene) {
    return scene && (scene.isScene === true || (typeof scene.traverse === 'function' && Array.isArray(scene.children)))
  }

  function nowMs() {
    try {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
    } catch (e) {}
    return Date.now()
  }

  function hook(target) {
    if (!target || typeof target.render !== 'function') return false
    var original = target.render
    target.render = function (scene, camera) {
      if (looksLikeScene(scene)) {
        root.__THREEJS_DOCTOR_HOST__ = { scene: scene, camera: camera, renderer: this }
        target.render = original
        console.log('[threejs-doctor host-shim] captured scene/camera/renderer')
      }
      return original.apply(this, arguments)
    }
    console.log('[threejs-doctor host-shim] hooked WebGLRenderer render once')
    return true
  }

  var T = root.THREE || root.three || (isObj(root.__THREE__) ? root.__THREE__ : null)
  var Ctor = (T && T.WebGLRenderer) || root.WebGLRenderer
  if (Ctor && Ctor.prototype && typeof Ctor.prototype.render === 'function') {
    hook(Ctor.prototype)
    return
  }

  var attach = isObj(root.__THREEJS_DOCTOR_ATTACH__) ? root.__THREEJS_DOCTOR_ATTACH__ : {}
  if (attach.deepWalk !== true) {
    console.warn('[threejs-doctor host-shim] THREE.WebGLRenderer not found on this page. Set window.__THREEJS_DOCTOR_ATTACH__ = { deepWalk: true } for a bounded graph walk.')
    return
  }

  var seen = typeof WeakSet === 'function' ? new WeakSet() : []
  function already(v) {
    if (seen.has) return seen.has(v)
    for (var i = 0; i < seen.length; i++) if (seen[i] === v) return true
    return false
  }
  function mark(v) {
    if (seen.add) seen.add(v)
    else seen.push(v)
  }

  var queue = []
  var head = 0
  var visits = 0
  function enqueue(v, depth) {
    if (!isObj(v) || depth > MAX_DEPTH || already(v)) return
    if (visits + (queue.length - head) >= MAX_VISITS) return
    mark(v)
    queue.push({ v: v, d: depth })
  }

  enqueue(root, 0)
  try {
    if (root.document) enqueue(root.document, 0)
  } catch (e) {}
  try {
    var doc = root.document
    if (doc && typeof doc.querySelectorAll === 'function') {
      var canvases = doc.querySelectorAll('canvas')
      for (var c = 0; c < canvases.length; c++) enqueue(canvases[c], 0)
    }
  } catch (e) {}

  var named = null
  var duck = null
  var found = null
  var aborted = false
  var t0 = nowMs()
  while (head < queue.length && visits < MAX_VISITS && !found) {
    if (nowMs() - t0 >= MAX_MS) {
      aborted = true
      break
    }
    var next = queue[head++]
    var value = next.v
    var depth = next.d
    if (!isObj(value)) continue
    visits++
    if (crossOriginIframe(value)) continue
    try {
      if (value.isWebGLRenderer === true) {
        found = value
        break
      }
      if (!named && isNamedRenderer(value)) named = value
      else if (!duck && isDuckRenderer(value)) duck = value
    } catch (e) {
      continue
    }
    if (depth >= MAX_DEPTH) continue
    if (typeof value.nodeType === 'number') {
      var tag = typeof value.tagName === 'string' ? String(value.tagName).toUpperCase() : ''
      if (tag === 'IFRAME') {
        try {
          if (!crossOriginIframe(value)) {
            enqueue(value.contentWindow, depth + 1)
            enqueue(value.contentDocument, depth + 1)
          }
        } catch (e) {}
        continue
      }
      if (tag !== 'CANVAS' && typeof value.getContext !== 'function' && value !== root && value !== root.document) {
        continue
      }
    }
    var names
    try {
      names = Object.getOwnPropertyNames(value)
    } catch (e) {
      try {
        names = Object.keys(value)
      } catch (e2) {
        continue
      }
    }
    for (var n = 0; n < names.length; n++) {
      if (nowMs() - t0 >= MAX_MS) {
        aborted = true
        break
      }
      var key = names[n]
      if (SKIP[key]) continue
      var child
      try {
        child = value[key]
      } catch (e) {
        continue
      }
      if (!isObj(child)) continue
      if (ArrayBuffer.isView(child)) continue
      if (crossOriginIframe(child)) continue
      if (typeof child.nodeType === 'number') {
        var ctag = typeof child.tagName === 'string' ? String(child.tagName).toUpperCase() : ''
        if (ctag !== 'CANVAS' && ctag !== 'IFRAME' && typeof child.getContext !== 'function') continue
      }
      enqueue(child, depth + 1)
    }
    if (aborted) break
  }

  if (aborted) {
    console.warn('[threejs-doctor host-shim] deep walk aborted (budget); THREE.WebGLRenderer not found on this page')
    return
  }

  found = found || named || duck
  if (!found) {
    console.warn('[threejs-doctor host-shim] THREE.WebGLRenderer not found on this page')
    return
  }

  var instCtor = found.constructor
  if (instCtor && instCtor.prototype && typeof instCtor.prototype.render === 'function') {
    hook(instCtor.prototype)
    return
  }
  if (!hook(found)) {
    console.warn('[threejs-doctor host-shim] THREE.WebGLRenderer not found on this page')
  }
})(typeof window !== 'undefined' ? window : globalThis)
