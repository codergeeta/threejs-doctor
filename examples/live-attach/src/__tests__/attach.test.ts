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
  const g = globalThis as { pelagic?: unknown }
  delete g.pelagic
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
})
