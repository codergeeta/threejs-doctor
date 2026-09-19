import { describe, it, expect } from 'vitest'
import {
  attemptDiscovery,
  discoverThreeHandles,
  findRendererDeep,
  DEEP_WALK_MAX_DEPTH,
  DEEP_WALK_MAX_MS,
  DEEP_WALK_MAX_NODES,
} from '../discover.js'

function fakeRenderer(id: string) {
  return {
    id,
    isWebGLRenderer: true,
    pixelRatio: 2,
    info: { render: { calls: 1, triangles: 10 }, memory: { geometries: 1, textures: 1 } },
    setPixelRatio(v: number) {
      this.pixelRatio = v
    },
  }
}

function fakeScene(name: string) {
  return {
    name,
    isScene: true,
    children: [],
    traverse() {},
  }
}

function fakeCamera() {
  return { isCamera: true, isPerspectiveCamera: true, position: { x: 0, y: 1, z: 5 } }
}

describe('discoverThreeHandles', () => {
  it('prefers explicit scene/camera/renderer over window globals', () => {
    const scene = fakeScene('explicit')
    const camera = fakeCamera()
    const renderer = fakeRenderer('explicit')
    const root = {
      scene: fakeScene('window'),
      camera: fakeCamera(),
      renderer: fakeRenderer('window'),
    }
    const found = discoverThreeHandles(root, { scene, camera, renderer })
    expect(found?.source).toBe('explicit')
    expect(found?.scene).toBe(scene)
    expect(found?.camera).toBe(camera)
    expect(found?.renderer).toBe(renderer)
  })

  it('reads window.pelagic.debug when present', () => {
    const scene = fakeScene('ocean')
    const renderer = fakeRenderer('ocean')
    const camera = fakeCamera()
    const root = {
      pelagic: { debug: { scene, renderer, camera } },
    }
    const found = discoverThreeHandles(root)
    expect(found?.source).toBe('pelagic')
    expect(found?.scene).toBe(scene)
    expect(found?.renderer).toBe(renderer)
    expect(found?.camera).toBe(camera)
  })

  it('reads window.__THREEJS_DOCTOR_HOST__ without pelagic', () => {
    const scene = fakeScene('host')
    const camera = fakeCamera()
    const renderer = fakeRenderer('host')
    const root = {
      __THREEJS_DOCTOR_HOST__: { scene, camera, renderer },
    }
    const found = discoverThreeHandles(root)
    expect(found?.source).toBe('host')
    expect(found?.scene).toBe(scene)
    expect(found?.camera).toBe(camera)
    expect(found?.renderer).toBe(renderer)
  })

  it('prefers __THREEJS_DOCTOR_HOST__ over pelagic.debug', () => {
    const scene = fakeScene('host')
    const camera = fakeCamera()
    const renderer = fakeRenderer('host')
    const root = {
      __THREEJS_DOCTOR_HOST__: { scene, camera, renderer },
      pelagic: {
        debug: {
          scene: fakeScene('ocean'),
          camera: fakeCamera(),
          renderer: fakeRenderer('ocean'),
        },
      },
    }
    const found = discoverThreeHandles(root)
    expect(found?.source).toBe('host')
    expect(found?.scene).toBe(scene)
    expect(found?.renderer).toBe(renderer)
  })

  it('falls through when __THREEJS_DOCTOR_HOST__ is missing renderer', () => {
    const scene = fakeScene('ocean')
    const camera = fakeCamera()
    const renderer = fakeRenderer('ocean')
    const root = {
      __THREEJS_DOCTOR_HOST__: { scene: fakeScene('incomplete'), camera },
      pelagic: { debug: { scene, renderer, camera } },
    }
    const found = discoverThreeHandles(root)
    expect(found?.source).toBe('pelagic')
    expect(found?.scene).toBe(scene)
    expect(found?.renderer).toBe(renderer)
  })

  it('finds isScene / isCamera / isWebGLRenderer on the root object', () => {
    const scene = fakeScene('walk')
    const camera = fakeCamera()
    const renderer = fakeRenderer('walk')
    const root = { app: { scene, camera, renderer } }
    const found = discoverThreeHandles(root)
    expect(found?.source).toBe('walk')
    expect(found?.scene).toBe(scene)
    expect(found?.camera).toBe(camera)
    expect(found?.renderer).toBe(renderer)
  })

  it('returns undefined when nothing Three-like is present', () => {
    expect(discoverThreeHandles({ foo: 1, bar: 'nope' })).toBeUndefined()
  })

  it('ignores throwing window getters while walking', () => {
    const scene = fakeScene('throw')
    const camera = fakeCamera()
    const renderer = fakeRenderer('throw')
    const root: Record<string, unknown> = { scene, camera, renderer }
    Object.defineProperty(root, 'hostile', {
      enumerable: true,
      get() {
        throw new Error('denied')
      },
    })
    const found = discoverThreeHandles(root)
    expect(found?.scene).toBe(scene)
    expect(found?.renderer).toBe(renderer)
  })

  it('discovers handles from canvas.__THREE__ without window globals', () => {
    const scene = fakeScene('canvas-three')
    const camera = fakeCamera()
    const renderer = fakeRenderer('canvas-three')
    const canvas = {
      nodeType: 1,
      tagName: 'CANVAS',
      __THREE__: { scene, camera, renderer },
      getContext(type: string) {
        if (type === 'webgl' || type === 'webgl2') return { drawingBufferWidth: 8, drawingBufferHeight: 8 }
        return null
      },
    }
    const found = discoverThreeHandles({
      document: {
        querySelectorAll(sel: string) {
          return sel === 'canvas' ? [canvas] : []
        },
      },
    })
    expect(found?.source).toBe('canvas')
    expect(found?.scene).toBe(scene)
    expect(found?.camera).toBe(camera)
    expect(found?.renderer).toBe(renderer)
  })

  it('discovers a renderer stored on canvas.userData and known internals', () => {
    const scene = fakeScene('canvas-userData')
    const camera = fakeCamera()
    const renderer = fakeRenderer('canvas-userData')
    const canvas = {
      nodeType: 1,
      tagName: 'CANVAS',
      userData: { scene, camera },
      _renderer: renderer,
      getContext() {
        return null
      },
    }
    const found = discoverThreeHandles({
      document: {
        querySelectorAll(sel: string) {
          return sel === 'canvas' ? [canvas] : []
        },
      },
    })
    expect(found?.source).toBe('canvas')
    expect(found?.renderer).toBe(renderer)
    expect(found?.scene).toBe(scene)
    expect(found?.camera).toBe(camera)
  })

  it('walks a WebGL context hanging off the canvas for renderer/scene', () => {
    const scene = fakeScene('gl')
    const camera = fakeCamera()
    const renderer = fakeRenderer('gl')
    const gl = { drawingBufferWidth: 16, drawingBufferHeight: 16, __THREE__: { renderer, scene, camera } }
    const canvas = {
      nodeType: 1,
      tagName: 'CANVAS',
      getContext(type: string) {
        if (type === 'webgl2' || type === 'webgl') return gl
        return null
      },
    }
    const found = discoverThreeHandles({
      document: {
        querySelectorAll(sel: string) {
          return sel === 'canvas' ? [canvas] : []
        },
      },
    })
    expect(found?.source).toBe('canvas')
    expect(found?.renderer).toBe(renderer)
    expect(found?.scene).toBe(scene)
  })

  it('finds handles nested under window.game deeper than the shallow global walk', () => {
    const scene = fakeScene('game')
    const camera = fakeCamera()
    const renderer = fakeRenderer('game')
    const root = {
      game: { engine: { world: { view: { runtime: { scene, camera, renderer } } } } },
    }
    const found = discoverThreeHandles(root)
    expect(found?.source).toBe('walk')
    expect(found?.scene).toBe(scene)
    expect(found?.camera).toBe(camera)
    expect(found?.renderer).toBe(renderer)
  })

  it('finds Clockwork Climb handles under window.__ccGame', () => {
    const scene = fakeScene('cc')
    const camera = fakeCamera()
    const renderer = fakeRenderer('cc')
    const root = {
      __ccGame: { scene, camera, renderer },
    }
    const found = discoverThreeHandles(root)
    expect(found?.scene).toBe(scene)
    expect(found?.camera).toBe(camera)
    expect(found?.renderer).toBe(renderer)
  })

  it('reads non-enumerable window.__THREE__ and module-like default exports', () => {
    const scene = fakeScene('ns')
    const camera = fakeCamera()
    const renderer = fakeRenderer('ns')
    const root: Record<string, unknown> = {}
    Object.defineProperty(root, '__THREE__', {
      enumerable: false,
      value: { __esModule: true, default: { scene, camera, renderer } },
    })
    const found = discoverThreeHandles(root)
    expect(found?.scene).toBe(scene)
    expect(found?.renderer).toBe(renderer)
    expect(found?.camera).toBe(camera)
  })

  it('skips crashing bundle-root getters and still reads window.app', () => {
    const scene = fakeScene('app')
    const camera = fakeCamera()
    const renderer = fakeRenderer('app')
    const root: Record<string, unknown> = {}
    Object.defineProperty(root, 'game', {
      enumerable: true,
      get() {
        throw new Error('game denied')
      },
    })
    Object.defineProperty(root, 'app', {
      enumerable: false,
      value: { scene, camera, renderer },
    })
    const found = discoverThreeHandles(root)
    expect(found?.scene).toBe(scene)
    expect(found?.renderer).toBe(renderer)
  })

  it('reads non-enumerable scene/camera on a found renderer', () => {
    const scene = fakeScene('hidden')
    const camera = fakeCamera()
    const renderer = fakeRenderer('hidden')
    Object.defineProperty(renderer, 'scene', { enumerable: false, value: scene })
    Object.defineProperty(renderer, 'camera', { enumerable: false, value: camera })
    const found = discoverThreeHandles({ leftover: true, renderer })
    expect(found?.renderer).toBe(renderer)
    expect(found?.scene).toBe(scene)
    expect(found?.camera).toBe(camera)
  })

  it('discovers a nested isWebGLRenderer under app.gfx', () => {
    const renderer = fakeRenderer('nested-app-gfx')
    const root = { app: { gfx: { renderer } } }
    expect(findRendererDeep(root)).toBe(renderer)
    const found = attemptDiscovery(root)
    expect(found.renderer).toBe(renderer)
    expect(found.probe.foundRenderer).toBe(true)
  })

  it('discovers isWebGLRenderer nested deeper than the shallow global walk', () => {
    const renderer = fakeRenderer('deep-stash')
    const root = {
      stash: { a: { b: { c: { d: { e: { f: { renderer } } } } } } },
      __THREE__: 'r152',
    }
    expect(findRendererDeep(root)).toBe(renderer)
    expect(attemptDiscovery(root).renderer).toBeUndefined()
    const found = attemptDiscovery(root, {}, { deepWalk: true })
    expect(found.renderer).toBe(renderer)
  })

  it('discovers a non-enumerable nested renderer that is not a known bundle root', () => {
    const renderer = fakeRenderer('hidden-runtime')
    const root: Record<string, unknown> = {}
    Object.defineProperty(root, 'runtime', {
      enumerable: false,
      value: { gfx: { renderer } },
    })
    expect(findRendererDeep(root)).toBe(renderer)
    expect(attemptDiscovery(root).renderer).toBeUndefined()
    const found = attemptDiscovery(root, {}, { deepWalk: true })
    expect(found.renderer).toBe(renderer)
  })

  it('treats constructor name WebGLRenderer as a renderer without isWebGLRenderer', () => {
    class WebGLRenderer {
      pixelRatio = 1
      render() {}
    }
    const renderer = new WebGLRenderer()
    const root = { stash: { a: { b: { c: { d: { e: { renderer } } } } } } }
    expect(findRendererDeep(root)).toBe(renderer)
    expect(attemptDiscovery(root).renderer).toBeUndefined()
    const found = attemptDiscovery(root, {}, { deepWalk: true })
    expect(found.renderer).toBe(renderer)
  })

  it('opts into deep walk from window.__THREEJS_DOCTOR_ATTACH__.deepWalk', () => {
    const renderer = fakeRenderer('attach-flag')
    const root = {
      stash: { gfx: { renderer } },
      __THREEJS_DOCTOR_ATTACH__: { deepWalk: true },
    }
    expect(attemptDiscovery(root).renderer).toBe(renderer)
  })

  it('skips cross-origin iframe contentWindow and finds a sibling renderer', () => {
    const trapped = fakeRenderer('trapped-in-iframe')
    const visible = fakeRenderer('beside-iframe')
    const iframe = {
      nodeType: 1,
      tagName: 'IFRAME',
      renderer: trapped,
      get contentWindow() {
        throw new Error('Blocked a frame with origin')
      },
    }
    const root = {
      hostileFrame: iframe,
      stash: { gfx: { renderer: visible } },
    }
    expect(() => findRendererDeep(root)).not.toThrow()
    expect(findRendererDeep(root)).toBe(visible)
    expect(findRendererDeep(root)).not.toBe(trapped)
  })

  it('walks non-enumerable own props on a canvas for a nested renderer', () => {
    const renderer = fakeRenderer('canvas-gfx')
    const canvas: Record<string, unknown> = {
      nodeType: 1,
      tagName: 'CANVAS',
      getContext() {
        return { drawingBufferWidth: 8, drawingBufferHeight: 8 }
      },
    }
    Object.defineProperty(canvas, 'gfx', {
      enumerable: false,
      value: { renderer },
    })
    const root = {
      document: {
        querySelectorAll(sel: string) {
          return sel === 'canvas' ? [canvas] : []
        },
      },
    }
    expect(findRendererDeep(root)).toBe(renderer)
    const found = attemptDiscovery(root)
    expect(found.renderer).toBe(renderer)
    expect(found.source).toBe('canvas')
  })
})

describe('findRendererDeep budgets', () => {
  it('keeps hard caps at or below paste-safe limits', () => {
    expect(DEEP_WALK_MAX_NODES).toBeLessThanOrEqual(5000)
    expect(DEEP_WALK_MAX_DEPTH).toBeLessThanOrEqual(8)
    expect(DEEP_WALK_MAX_MS).toBeGreaterThanOrEqual(50)
    expect(DEEP_WALK_MAX_MS).toBeLessThanOrEqual(100)
  })

  it('still finds a nested isWebGLRenderer within budget when the graph is shallow', () => {
    const renderer = fakeRenderer('budget-shallow')
    const root = { app: { gfx: { renderer } } }
    expect(
      findRendererDeep(root, { maxNodes: DEEP_WALK_MAX_NODES, maxDepth: DEEP_WALK_MAX_DEPTH, maxMs: DEEP_WALK_MAX_MS }),
    ).toBe(renderer)
    expect(attemptDiscovery(root).renderer).toBe(renderer)
  })

  it('does not visit more than maxNodes on a huge object graph', () => {
    const touched = new Set<unknown>()
    const root: Record<string, unknown> = { label: 'hang-fixture' }
    for (let i = 0; i < 8000; i += 1) {
      const child: Record<string, unknown> = {}
      Object.defineProperty(child, 'isWebGLRenderer', {
        enumerable: false,
        get() {
          touched.add(child)
          return false
        },
      })
      root[`n${i}`] = child
    }
    const found = findRendererDeep(root, { maxNodes: 200, maxDepth: 8, maxMs: 100 })
    expect(found).toBeUndefined()
    expect(touched.size).toBeLessThanOrEqual(200)
  })

  it('aborts and returns undefined when wall clock exceeds maxMs', () => {
    let nowMs = 0
    let checks = 0
    const root: Record<string, unknown> = { label: 'slow-hang-fixture' }
    for (let i = 0; i < 4000; i += 1) {
      const child: Record<string, unknown> = {}
      Object.defineProperty(child, 'isWebGLRenderer', {
        enumerable: false,
        get() {
          checks += 1
          nowMs += 10
          return false
        },
      })
      root[`n${i}`] = child
    }
    const found = findRendererDeep(root, {
      maxNodes: 5000,
      maxDepth: 8,
      maxMs: 50,
      now: () => nowMs,
    })
    expect(found).toBeUndefined()
    expect(nowMs).toBeLessThanOrEqual(50 + 10)
    expect(checks).toBeLessThan(20)
  })

  it('default attach discovery skips deep walk so a huge graph cannot freeze paste', () => {
    let checks = 0
    const renderer = fakeRenderer('buried')
    const root: Record<string, unknown> = {
      stash: { a: { b: { c: { d: { e: { f: { renderer } } } } } } },
    }
    for (let i = 0; i < 3000; i += 1) {
      const child: Record<string, unknown> = {}
      Object.defineProperty(child, 'isWebGLRenderer', {
        enumerable: false,
        get() {
          checks += 1
          return false
        },
      })
      root[`n${i}`] = child
    }
    const found = attemptDiscovery(root)
    expect(found.renderer).toBeUndefined()
    expect(checks).toBeLessThanOrEqual(400)
    expect(checks).toBeLessThan(1000)
  })
})

function fakeComposer() {
  return {
    isEffectComposer: true,
    passes: [{}],
    renderTarget1: { width: 800, height: 450 },
    pixelRatio: 1,
  }
}

describe('cheap bundled-host discovery (no deep walk)', () => {
  it('reads composer from window.__THREEJS_DOCTOR_HOST__', () => {
    const scene = fakeScene('host-composer')
    const camera = fakeCamera()
    const renderer = fakeRenderer('host-composer')
    const composer = fakeComposer()
    const found = discoverThreeHandles({
      __THREEJS_DOCTOR_HOST__: { scene, camera, renderer, composer },
    })
    expect(found?.source).toBe('host')
    expect(found?.scene).toBe(scene)
    expect(found?.renderer).toBe(renderer)
    expect(found?.composer).toBe(composer)
  })

  it('finds a non-enumerable window.renderer and pairs scene/camera on it', () => {
    const scene = fakeScene('win-renderer')
    const camera = fakeCamera()
    const renderer = fakeRenderer('win-renderer')
    Object.defineProperty(renderer, 'scene', { enumerable: false, value: scene })
    Object.defineProperty(renderer, 'camera', { enumerable: false, value: camera })
    const root: Record<string, unknown> = {}
    Object.defineProperty(root, 'renderer', { enumerable: false, value: renderer })
    const found = discoverThreeHandles(root)
    expect(found?.renderer).toBe(renderer)
    expect(found?.scene).toBe(scene)
    expect(found?.camera).toBe(camera)
  })

  it('matches a cheap-root renderer to the WebGL canvas via renderer.domElement', () => {
    const scene = fakeScene('dom-el')
    const camera = fakeCamera()
    const gl = { drawingBufferWidth: 64, drawingBufferHeight: 48 }
    const canvas = {
      nodeType: 1,
      tagName: 'CANVAS',
      getContext(type: string) {
        if (type === 'webgl2' || type === 'webgl') return gl
        return null
      },
    }
    const renderer = Object.assign(fakeRenderer('dom-el'), { domElement: canvas, scene, camera })
    const root: Record<string, unknown> = {
      document: {
        querySelectorAll(sel: string) {
          return sel === 'canvas' ? [canvas] : []
        },
      },
    }
    Object.defineProperty(root, 'gameApp', { enumerable: false, value: { gfx: renderer } })
    const found = discoverThreeHandles(root)
    expect(found?.source).toBe('canvas')
    expect(found?.renderer).toBe(renderer)
    expect(found?.scene).toBe(scene)
    expect(found?.camera).toBe(camera)
  })

  it('reads canvas.__r3f.getState() { scene, camera, gl } without deep walk', () => {
    const scene = fakeScene('r3f')
    const camera = fakeCamera()
    const renderer = fakeRenderer('r3f')
    const canvas = {
      nodeType: 1,
      tagName: 'CANVAS',
      __r3f: {
        getState() {
          return { scene, camera, gl: renderer }
        },
      },
      getContext(type: string) {
        if (type === 'webgl' || type === 'webgl2') return { drawingBufferWidth: 8, drawingBufferHeight: 8 }
        return null
      },
    }
    const found = discoverThreeHandles({
      document: {
        querySelectorAll(sel: string) {
          return sel === 'canvas' ? [canvas] : []
        },
      },
    })
    expect(found?.source).toBe('canvas')
    expect(found?.scene).toBe(scene)
    expect(found?.camera).toBe(camera)
    expect(found?.renderer).toBe(renderer)
  })

  it('prefers the WebGL canvas and does not inspect dozens of dummy canvases', () => {
    let dummyInspects = 0
    const dummies = Array.from({ length: 40 }, () => ({
      nodeType: 1,
      tagName: 'CANVAS',
      get __THREE__() {
        dummyInspects += 1
        return undefined
      },
      getContext() {
        return null
      },
    }))
    const scene = fakeScene('webgl-preferred')
    const camera = fakeCamera()
    const renderer = fakeRenderer('webgl-preferred')
    const webglCanvas = {
      nodeType: 1,
      tagName: 'CANVAS',
      __THREE__: { scene, camera, renderer },
      getContext(type: string) {
        if (type === 'webgl2' || type === 'webgl') return { drawingBufferWidth: 128, drawingBufferHeight: 96 }
        return null
      },
    }
    const found = discoverThreeHandles({
      document: {
        querySelectorAll(sel: string) {
          return sel === 'canvas' ? [...dummies, webglCanvas] : []
        },
      },
    })
    expect(found?.source).toBe('canvas')
    expect(found?.scene).toBe(scene)
    expect(found?.renderer).toBe(renderer)
    expect(dummyInspects).toBe(0)
  })

  it('reads composer from a cheap bundle root when the host object omitted it', () => {
    const scene = fakeScene('bundle-composer')
    const camera = fakeCamera()
    const renderer = fakeRenderer('bundle-composer')
    const composer = fakeComposer()
    const found = discoverThreeHandles({
      __game: { scene, camera, renderer, composer },
    })
    expect(found?.scene).toBe(scene)
    expect(found?.renderer).toBe(renderer)
    expect(found?.composer).toBe(composer)
  })

  it('does not walk into a window.scene graph with huge geometry attributes', () => {
    let keysTouched = 0
    const huge: Record<string, unknown> = {}
    for (let i = 0; i < 8000; i += 1) {
      Object.defineProperty(huge, `k${i}`, {
        enumerable: true,
        get() {
          keysTouched += 1
          return 0
        },
      })
    }
    const scene = {
      name: 'heavy-scene',
      isScene: true,
      children: [
        {
          geometry: {
            attributes: {
              position: { array: huge },
            },
          },
        },
      ],
      traverse() {},
    }
    const camera = fakeCamera()
    const renderer = fakeRenderer('heavy-scene')
    const found = discoverThreeHandles({ scene, camera, renderer })
    expect(found?.scene).toBe(scene)
    expect(found?.renderer).toBe(renderer)
    expect(keysTouched).toBe(0)
  })

  it('inspects at most MAX_INSPECT_CANVASES WebGL canvases and prefers the largest', () => {
    const hidden = {
      scene: fakeScene('tiny'),
      camera: fakeCamera(),
      renderer: fakeRenderer('tiny'),
    }
    const visible = {
      scene: fakeScene('large'),
      camera: fakeCamera(),
      renderer: fakeRenderer('large'),
    }
    const canvases = Array.from({ length: 9 }, (_, i) => {
      const size = i === 0 ? 4 : 32 + i
      const handles = i === 0 ? hidden : i === 8 ? visible : undefined
      return {
        nodeType: 1,
        tagName: 'CANVAS',
        __THREE__: handles,
        getContext(type: string) {
          if (type === 'webgl2' || type === 'webgl') return { drawingBufferWidth: size, drawingBufferHeight: size }
          return null
        },
      }
    })
    const found = discoverThreeHandles({
      document: {
        querySelectorAll(sel: string) {
          return sel === 'canvas' ? canvases : []
        },
      },
    })
    expect(found?.source).toBe('canvas')
    expect(found?.scene).toBe(visible.scene)
    expect(found?.renderer).toBe(visible.renderer)
  })

  it('reads canvas.__r3f.store.getState() when getState is not on the bag itself', () => {
    const scene = fakeScene('r3f-store')
    const camera = fakeCamera()
    const renderer = fakeRenderer('r3f-store')
    const canvas = {
      nodeType: 1,
      tagName: 'CANVAS',
      __r3f: {
        store: {
          getState() {
            return { scene, camera, gl: renderer }
          },
        },
      },
      getContext(type: string) {
        if (type === 'webgl' || type === 'webgl2') return { drawingBufferWidth: 8, drawingBufferHeight: 8 }
        return null
      },
    }
    const found = discoverThreeHandles({
      document: {
        querySelectorAll(sel: string) {
          return sel === 'canvas' ? [canvas] : []
        },
      },
    })
    expect(found?.source).toBe('canvas')
    expect(found?.scene).toBe(scene)
    expect(found?.renderer).toBe(renderer)
  })

  it('keeps an explicit composer on discoverThreeHandles', () => {
    const scene = fakeScene('explicit-composer')
    const camera = fakeCamera()
    const renderer = fakeRenderer('explicit-composer')
    const composer = fakeComposer()
    const found = discoverThreeHandles({ leftover: true }, { scene, camera, renderer, composer })
    expect(found?.source).toBe('explicit')
    expect(found?.composer).toBe(composer)
  })
})
