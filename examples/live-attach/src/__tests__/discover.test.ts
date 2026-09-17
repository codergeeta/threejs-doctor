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
})
