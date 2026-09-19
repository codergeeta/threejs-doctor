import { describe, it, expect, vi, afterEach } from 'vitest'
import { attachQualityLadder } from '../attach.js'
import type { QualityLadderReport } from '@threejs-doctor/runtime'

function fakeRenderer() {
  return {
    isWebGLRenderer: true,
    pixelRatio: 3,
    antialias: true,
    toneMapping: 4,
    shadowMap: { enabled: true },
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
    info: {
      render: { calls: 40, triangles: 8000 },
      memory: { geometries: 8, textures: 4 },
    },
    setPixelRatio(v: number) {
      this.pixelRatio = v
    },
  }
}

function fakeScene() {
  const lights = [
    { isLight: true, castShadow: true },
    { isLight: true, castShadow: false },
  ]
  return {
    isScene: true,
    children: lights,
    traverse(cb: (o: Record<string, unknown>) => void) {
      for (const light of lights) cb(light)
    },
  }
}

function fakeCamera() {
  return { isCamera: true, position: { x: 0, y: 1, z: 4 } }
}

function pelagicDebug() {
  const rt = (w: number, h: number) => ({
    width: w,
    height: h,
    setSize(nw: number, nh: number) {
      this.width = nw
      this.height = nh
    },
  })
  return {
    scene: fakeScene(),
    renderer: fakeRenderer(),
    camera: fakeCamera(),
    cascades: [{ size: 128, dispose() {}, resize(n: number) { this.size = n } }],
    reflectionTarget: rt(768, 768),
    refractionTarget: rt(768, 768),
    runPass() {},
  }
}

function parseLoggedReport(log: ReturnType<typeof vi.spyOn>): QualityLadderReport {
  const line = log.mock.calls
    .map((args) => args[0])
    .find((arg) => typeof arg === 'string' && arg.startsWith('{'))
  expect(typeof line).toBe('string')
  return JSON.parse(line as string) as QualityLadderReport
}

afterEach(() => {
  vi.restoreAllMocks()
  const g = globalThis as {
    pelagic?: unknown
    __THREEJS_DOCTOR_LAST_REPORT__?: unknown
    __THREEJS_DOCTOR_HOST__?: unknown
  }
  delete g.pelagic
  delete g.__THREEJS_DOCTOR_LAST_REPORT__
  delete g.__THREEJS_DOCTOR_HOST__
})

describe('attachQualityLadder', () => {
  it('boots and runs the ladder in advise, logging JSON.stringify(report)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    let t = 0
    const renderer = fakeRenderer()
    const report = await attachQualityLadder({
      scene: fakeScene(),
      camera: fakeCamera(),
      renderer,
      now: () => {
        t += 16
        return t
      },
      windowFrames: 3,
      measureFrames: 3,
      mountOverlay: false,
    })
    expect(report.qualityMode).toBe('advise')
    expect(report.profile).toBe('game')
    expect(report.appliedPasses).toEqual([])
    expect(renderer.pixelRatio).toBe(3)
    expect(report.adapterUnavailable).toBeUndefined()
    const logged = parseLoggedReport(log)
    expect(logged.qualityMode).toBe('advise')
    expect(logged.baseline.avgFps).toBe(report.baseline.avgFps)
    expect(logged.baseline.avgFps).toBe(62.5)
    expect(Object.prototype.hasOwnProperty.call(report, 'ttfiMs')).toBe(false)
    expect(
      (globalThis as { __THREEJS_DOCTOR_LAST_REPORT__?: QualityLadderReport }).__THREEJS_DOCTOR_LAST_REPORT__,
    ).toEqual(report)
  })

  it('persists LAST_REPORT after boot even when runLadder later throws', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    let t = 0
    let frames = 0
    await expect(
      attachQualityLadder({
        scene: fakeScene(),
        camera: fakeCamera(),
        renderer: fakeRenderer(),
        mode: 'safe-auto',
        now: () => t,
        waitFrame: async () => {
          frames += 1
          if (frames <= 3) {
            t += 80
            return
          }
          throw new TypeError("Cannot read properties of null (reading 'pack')")
        },
        windowFrames: 3,
        measureFrames: 3,
        mountOverlay: false,
      }),
    ).resolves.toMatchObject({ startTier: expect.any(String) })
    const last = (globalThis as { __THREEJS_DOCTOR_LAST_REPORT__?: QualityLadderReport })
      .__THREEJS_DOCTOR_LAST_REPORT__
    expect(last).toBeDefined()
    expect(last!.baseline.p95FrameTimeMs).toBeGreaterThanOrEqual(50)
    parseLoggedReport(log)
  })

  it('sets LAST_REPORT in a finally block even when runLadder throws', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { QualityController } = await import('@threejs-doctor/runtime')
    const orig = QualityController.prototype.runLadder
    QualityController.prototype.runLadder = async function (this: InstanceType<typeof QualityController>) {
      const report = await orig.call(this)
      throw Object.assign(new Error('runLadder exploded after publish'), { report })
    }
    try {
      await expect(
        attachQualityLadder({
          scene: fakeScene(),
          camera: fakeCamera(),
          renderer: fakeRenderer(),
          now: (() => {
            let t = 0
            return () => {
              t += 16
              return t
            }
          })(),
          windowFrames: 3,
          measureFrames: 3,
          mountOverlay: false,
        }),
      ).rejects.toThrow(/exploded/)
      const last = (globalThis as { __THREEJS_DOCTOR_LAST_REPORT__?: QualityLadderReport })
        .__THREEJS_DOCTOR_LAST_REPORT__
      expect(last).toBeDefined()
      expect(last!.baseline).toBeDefined()
      const g = globalThis as typeof globalThis & { window?: { __THREEJS_DOCTOR_LAST_REPORT__?: QualityLadderReport } }
      if (g.window) {
        expect(g.window.__THREEJS_DOCTOR_LAST_REPORT__).toBe(last)
      }
      parseLoggedReport(log)
    } finally {
      QualityController.prototype.runLadder = orig
    }
  })

  it('registers the ocean adapter when window.pelagic.debug exists', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const debug = pelagicDebug()
    ;(globalThis as unknown as { pelagic: { debug: typeof debug } }).pelagic = { debug }
    let t = 0
    const report = await attachQualityLadder({
      mode: 'safe-auto',
      now: () => {
        t += 16
        return t
      },
      windowFrames: 3,
      measureFrames: 3,
      mountOverlay: false,
    })
    expect(report.adapterUnavailable).not.toBe(true)
    expect(report.appliedKnobs.length).toBeGreaterThan(0)
    expect(report.appliedKnobs.some((k) => k.capability === 'fftSize')).toBe(true)
    parseLoggedReport(log)
  })

  it('does not register the ocean adapter when __THREEJS_DOCTOR_HOST__ wins over pelagic', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const debug = pelagicDebug()
    const scene = fakeScene()
    const camera = fakeCamera()
    const renderer = fakeRenderer()
    let t = 0
    const report = await attachQualityLadder({
      root: {
        __THREEJS_DOCTOR_HOST__: { scene, camera, renderer },
        pelagic: { debug },
      },
      mode: 'safe-auto',
      now: () => {
        t += 16
        return t
      },
      windowFrames: 3,
      measureFrames: 3,
      mountOverlay: false,
    })
    expect(report.appliedKnobs).toEqual([])
    expect(report.adapterUnavailable).toBeUndefined()
    parseLoggedReport(log)
  })

  it('discovers window.__THREEJS_DOCTOR_HOST__ without pelagic and runs generic caps only', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const scene = fakeScene()
    const camera = fakeCamera()
    const renderer = fakeRenderer()
    let t = 0
    const report = await attachQualityLadder({
      root: { __THREEJS_DOCTOR_HOST__: { scene, camera, renderer } },
      mode: 'safe-auto',
      now: () => {
        t += 16
        return t
      },
      windowFrames: 3,
      measureFrames: 3,
      mountOverlay: false,
    })
    expect(report.adapterUnavailable).toBeUndefined()
    expect(report.appliedKnobs).toEqual([])
    expect(report.appliedPasses.length).toBeGreaterThan(0)
    parseLoggedReport(log)
  })

  it('passes host composer into Doctor so composer-resolution-mismatch can fire', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const composer = {
      isEffectComposer: true,
      passes: [{}],
      renderTarget1: { width: 800, height: 450 },
      pixelRatio: 1,
    }
    const renderer = fakeRenderer()
    let t = 0
    const report = await attachQualityLadder({
      root: {
        __THREEJS_DOCTOR_HOST__: {
          scene: fakeScene(),
          camera: fakeCamera(),
          renderer,
          composer,
        },
      },
      now: () => {
        t += 16
        return t
      },
      windowFrames: 3,
      measureFrames: 3,
      mountOverlay: false,
    })
    expect(report.findings.some((f) => f.id === 'renderer/composer-resolution-mismatch')).toBe(true)
    parseLoggedReport(log)
  })

  it('skips ocean adapter registration when pelagic.debug is missing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    let t = 0
    const report = await attachQualityLadder({
      mode: 'safe-auto',
      scene: fakeScene(),
      camera: fakeCamera(),
      renderer: fakeRenderer(),
      now: () => {
        t += 16
        return t
      },
      windowFrames: 3,
      measureFrames: 3,
      mountOverlay: false,
    })
    expect(report.adapterUnavailable).toBeUndefined()
    expect(report.appliedKnobs).toEqual([])
    expect(report.appliedPasses.length).toBeGreaterThan(0)
    parseLoggedReport(log)
  })

  it('throws when no scene/camera/renderer can be discovered', async () => {
    await expect(attachQualityLadder({ mountOverlay: false, root: { nothing: true } })).rejects.toThrow(
      /could not find/i,
    )
  })

  it('error lists canvas count, WebGL presence, and explicit-pass console instructions', async () => {
    const canvas = {
      nodeType: 1,
      tagName: 'CANVAS',
      getContext(type: string) {
        if (type === 'webgl2' || type === 'webgl') return { drawingBufferWidth: 64, drawingBufferHeight: 64 }
        return null
      },
    }
    const err = await attachQualityLadder({
      mountOverlay: false,
      root: {
        document: {
          querySelectorAll(sel: string) {
            return sel === 'canvas' ? [canvas] : []
          },
        },
      },
    }).then(
      () => {
        throw new Error('expected discover failure')
      },
      (e: unknown) => e as Error,
    )
    expect(err.message).toMatch(/could not find scene\/camera\/renderer/i)
    expect(err.message).toMatch(/1 canvas/)
    expect(err.message).toMatch(/WebGL context: yes/)
    expect(err.message).toMatch(/renderer: no/)
    expect(err.message).toMatch(/attachQualityLadder\(\{ scene, camera, renderer \}\)/)
    expect(err.message).toMatch(/this page's console/i)
  })

  it('hooks render on a nested app.gfx renderer when window.THREE is missing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const scene = fakeScene()
    const camera = fakeCamera()
    const renderer = Object.assign(fakeRenderer(), {
      render(s: unknown, c: unknown) {
        this._last = [s, c]
      },
      _last: undefined as unknown,
    })
    let t = 0
    const report = await attachQualityLadder({
      root: {
        app: { gfx: { renderer } },
        __THREE__: 'r152',
      },
      now: () => {
        t += 16
        return t
      },
      waitFrame: async () => {
        renderer.render(scene, camera)
      },
      windowFrames: 3,
      measureFrames: 3,
      mountOverlay: false,
    })
    expect(report.qualityMode).toBe('advise')
    expect(report.baseline.avgFps).toBe(62.5)
    parseLoggedReport(log)
  })

  it('hooks renderer.render to capture scene/camera when only the renderer is discoverable', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const scene = fakeScene()
    const camera = fakeCamera()
    const renderer = Object.assign(fakeRenderer(), {
      render(s: unknown, c: unknown) {
        this._last = [s, c]
      },
      _last: undefined as unknown,
    })
    let t = 0
    const report = await attachQualityLadder({
      root: { renderer },
      now: () => {
        t += 16
        return t
      },
      waitFrame: async () => {
        renderer.render(scene, camera)
      },
      windowFrames: 3,
      measureFrames: 3,
      mountOverlay: false,
    })
    expect(report.qualityMode).toBe('advise')
    expect(report.baseline.avgFps).toBe(62.5)
    parseLoggedReport(log)
  })

  it('forces potato startTier from device: "phone" without WEBGL_debug_renderer_info', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const requested: string[] = []
    const renderer = Object.assign(fakeRenderer(), {
      getExtension(name: string) {
        requested.push(name)
        if (name === 'EXT_color_buffer_float' || name === 'OES_texture_float_linear') return {}
        return null
      },
    })
    let t = 0
    const report = await attachQualityLadder({
      scene: fakeScene(),
      camera: fakeCamera(),
      renderer,
      device: 'phone',
      now: () => {
        t += 16
        return t
      },
      windowFrames: 3,
      measureFrames: 3,
      mountOverlay: false,
    })
    expect(report.startTier).toBe('potato')
    expect(report.maxTier).toBe('mid')
    expect(requested).not.toContain('WEBGL_debug_renderer_info')
    expect(requested).not.toContain('UNMASKED_RENDERER_WEBGL')
    parseLoggedReport(log)
  })

  it('forces phone-class probe from explicit device fields (touch, coarse, memory, high DPR)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const requested: string[] = []
    const renderer = Object.assign(fakeRenderer(), {
      pixelRatio: 1,
      getExtension(name: string) {
        requested.push(name)
        return name === 'EXT_color_buffer_float' || name === 'OES_texture_float_linear' ? {} : null
      },
    })
    let t = 0
    const report = await attachQualityLadder({
      scene: fakeScene(),
      camera: fakeCamera(),
      renderer,
      mode: 'safe-auto',
      device: {
        maxTouchPoints: 5,
        coarsePointer: true,
        deviceMemory: 4,
        devicePixelRatio: 3,
      },
      now: () => {
        t += 16
        return t
      },
      windowFrames: 3,
      measureFrames: 3,
      mountOverlay: false,
    })
    expect(report.startTier).toBe('potato')
    expect(report.maxTier).toBe('mid')
    expect(requested).not.toContain('WEBGL_debug_renderer_info')
    parseLoggedReport(log)
  })

  it('captures closed-over scene/camera/renderer via THREE.WebGLRenderer.prototype.render', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    class WebGLRenderer {
      isWebGLRenderer = true
      pixelRatio = 2
      last: unknown[] | undefined
      info = {
        render: { calls: 40, triangles: 8000 },
        memory: { geometries: 8, textures: 4 },
      }
      setPixelRatio(v: number) {
        this.pixelRatio = v
      }
      render(scene: unknown, camera: unknown) {
        this.last = [scene, camera]
      }
    }
    const scene = fakeScene()
    const camera = fakeCamera()
    let instance: WebGLRenderer | undefined
    const root: {
      THREE: { WebGLRenderer: typeof WebGLRenderer }
      __THREEJS_DOCTOR_HOST__?: { scene: unknown; camera: unknown; renderer: unknown }
    } = { THREE: { WebGLRenderer } }
    let t = 0
    const report = await attachQualityLadder({
      root,
      now: () => {
        t += 16
        return t
      },
      waitFrame: async () => {
        instance ??= new WebGLRenderer()
        instance.render(scene, camera)
      },
      windowFrames: 3,
      measureFrames: 3,
      mountOverlay: false,
    })
    expect(report.qualityMode).toBe('advise')
    expect(root.__THREEJS_DOCTOR_HOST__?.scene).toBe(scene)
    expect(root.__THREEJS_DOCTOR_HOST__?.camera).toBe(camera)
    expect(root.__THREEJS_DOCTOR_HOST__?.renderer).toBe(instance)
    expect(report.baseline.avgFps).toBe(62.5)
    parseLoggedReport(log)
  })

  it('still requires an explicit pass when renderer.render never yields scene/camera', async () => {
    const renderer = Object.assign(fakeRenderer(), {
      render() {
        /* bundled game called with internals, not scene/camera */
      },
    })
    const err = await attachQualityLadder({
      mountOverlay: false,
      root: { renderer },
      waitFrame: async () => {
        renderer.render()
      },
      now: () => 16,
      windowFrames: 1,
      measureFrames: 1,
    }).then(
      () => {
        throw new Error('expected discover failure')
      },
      (e: unknown) => e as Error,
    )
    expect(err.message).toMatch(/found WebGLRenderer but not scene\/camera/i)
    expect(err.message).toMatch(/renderer: yes/)
    expect(err.message).toMatch(/scene: no/)
    expect(err.message).toMatch(/render\(\) hook/i)
    expect(err.message).toMatch(/attachQualityLadder\(\{ scene, camera, renderer \}\)/)
  })
})
