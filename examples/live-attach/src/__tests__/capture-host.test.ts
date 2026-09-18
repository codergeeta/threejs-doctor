import { describe, it, expect, afterEach } from 'vitest'
import { installRendererRenderCapture } from '../capture-host.js'

function fakeScene() {
  return {
    isScene: true,
    children: [],
    traverse() {},
  }
}

function fakeCamera() {
  return { isCamera: true, isPerspectiveCamera: true }
}

function makeThree() {
  function WebGLRenderer(this: {
    isWebGLRenderer: boolean
    pixelRatio: number
    info: { render: { calls: number; triangles: number }; memory: { geometries: number; textures: number } }
    setPixelRatio: (v: number) => void
    draws: number
  }) {
    this.isWebGLRenderer = true
    this.pixelRatio = 2
    this.draws = 0
    this.info = {
      render: { calls: 1, triangles: 10 },
      memory: { geometries: 1, textures: 1 },
    }
    this.setPixelRatio = (v: number) => {
      this.pixelRatio = v
    }
  }
  WebGLRenderer.prototype.render = function (this: { draws: number }, scene: unknown, camera: unknown) {
    this.draws += 1
    return { scene, camera }
  }
  return { WebGLRenderer }
}

afterEach(() => {
  const g = globalThis as { __THREEJS_DOCTOR_HOST__?: unknown }
  delete g.__THREEJS_DOCTOR_HOST__
})

describe('installRendererRenderCapture', () => {
  it('hooks THREE.WebGLRenderer.prototype.render once and writes __THREEJS_DOCTOR_HOST__', () => {
    const THREE = makeThree()
    const root: {
      THREE: typeof THREE
      __THREEJS_DOCTOR_HOST__?: { scene: unknown; camera: unknown; renderer: unknown }
    } = { THREE }
    const installed = installRendererRenderCapture(root)
    expect(installed.installed).toBe(true)

    const scene = fakeScene()
    const camera = fakeCamera()
    const renderer = new (THREE.WebGLRenderer as unknown as new () => {
      draws: number
      render: (scene: unknown, camera: unknown) => unknown
    })()
    renderer.render(scene, camera)

    expect(root.__THREEJS_DOCTOR_HOST__?.scene).toBe(scene)
    expect(root.__THREEJS_DOCTOR_HOST__?.camera).toBe(camera)
    expect(root.__THREEJS_DOCTOR_HOST__?.renderer).toBe(renderer)
    expect(renderer.draws).toBe(1)

    const otherScene = fakeScene()
    renderer.render(otherScene, camera)
    expect(root.__THREEJS_DOCTOR_HOST__?.scene).toBe(scene)
    expect(renderer.draws).toBe(2)

    installed.uninstall()
  })

  it('returns installed: false when THREE.WebGLRenderer is missing', () => {
    const result = installRendererRenderCapture({ nothing: true })
    expect(result.installed).toBe(false)
    expect(result.getCaptured()).toBeUndefined()
  })

  it('hooks a nested instance when THREE is missing and __THREE__ is a string', () => {
    const THREE = makeThree()
    const renderer = new (THREE.WebGLRenderer as unknown as new () => {
      render: (scene: unknown, camera: unknown) => unknown
    })()
    const root: {
      __THREE__: string
      app: { gfx: { renderer: typeof renderer } }
      __THREEJS_DOCTOR_HOST__?: { scene: unknown; renderer: unknown }
    } = {
      __THREE__: 'r152',
      app: { gfx: { renderer } },
    }
    const installed = installRendererRenderCapture(root)
    expect(installed.installed).toBe(true)
    const scene = fakeScene()
    const camera = fakeCamera()
    renderer.render(scene, camera)
    expect(root.__THREEJS_DOCTOR_HOST__?.scene).toBe(scene)
    expect(root.__THREEJS_DOCTOR_HOST__?.renderer).toBe(renderer)
    installed.uninstall()
  })

  it('finds WebGLRenderer under window.__THREE__ namespace', () => {
    const THREE = makeThree()
    const root: {
      __THREE__: typeof THREE
      __THREEJS_DOCTOR_HOST__?: { scene: unknown }
    } = { __THREE__: THREE }
    const installed = installRendererRenderCapture(root)
    expect(installed.installed).toBe(true)
    const scene = fakeScene()
    const camera = fakeCamera()
    const renderer = new (THREE.WebGLRenderer as unknown as new () => {
      render: (scene: unknown, camera: unknown) => unknown
    })()
    renderer.render(scene, camera)
    expect(root.__THREEJS_DOCTOR_HOST__?.scene).toBe(scene)
    installed.uninstall()
  })
})
