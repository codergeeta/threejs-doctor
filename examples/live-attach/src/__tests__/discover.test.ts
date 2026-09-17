import { describe, it, expect } from 'vitest'
import { discoverThreeHandles } from '../discover.js'

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
})
