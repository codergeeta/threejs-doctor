import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mountOverlay } from '../overlay/mount-overlay.js'
import { Doctor } from '../doctor.js'
import type { MetricsSample, RendererInfoLike } from '@threejs-doctor/core'

const baseline: MetricsSample = {
  avgFps: 30, p95FrameTimeMs: 40, drawCalls: 200, triangles: 50_000,
  textureCount: 10, estimatedVramBytes: 40_000_000, geometryCount: 40,
  lightCount: 3, shadowCastingLightCount: 2,
}
const after: MetricsSample = {
  avgFps: 48, p95FrameTimeMs: 22, drawCalls: 90, triangles: 50_000,
  textureCount: 10, estimatedVramBytes: 40_000_000, geometryCount: 40,
  lightCount: 3, shadowCastingLightCount: 1,
}

function createDoctor() {
  const info: RendererInfoLike = {
    render: { calls: 180, triangles: 40_000 },
    memory: { geometries: 40, textures: 8 },
  }
  const renderer = {
    info,
    pixelRatio: 3,
    antialias: true,
    setPixelRatio(v: number) {
      this.pixelRatio = v
    },
  }
  const scene = {
    children: [],
    traverse() {},
  }
  let t = 0
  return new Doctor({
    scene: scene as never,
    camera: {},
    renderer: renderer as never,
    profile: 'marketing',
    mode: 'optimize',
    measureFrames: 3,
    now: () => {
      t += 16
      return t
    },
    getSceneStats: () => ({
      textureCount: 8,
      estimatedVramBytes: 32_000_000,
      geometryCount: 40,
      lightCount: 3,
      shadowCastingLightCount: 2,
    }),
  })
}

describe('mountOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders score and draw-call delta then unmounts cleanly', () => {
    const handle = mountOverlay({
      getScore: () => 82,
      getBaseline: () => baseline,
      getAfter: () => after,
    })
    const el = document.getElementById('threejs-doctor-overlay')
    expect(el).not.toBeNull()
    expect(el?.textContent).toContain('82')
    expect(el?.textContent).toMatch(/drawCalls/i)
    expect(el?.textContent).toContain('-110')
    handle.unmount()
    expect(document.getElementById('threejs-doctor-overlay')).toBeNull()
  })

  it('shows a placeholder when after metrics are missing', () => {
    mountOverlay({
      getScore: () => 40,
      getBaseline: () => baseline,
    })
    expect(document.getElementById('threejs-doctor-overlay')?.textContent).toContain(
      'No after metrics',
    )
  })

  it('refresh repaints live score and deltas', () => {
    let score = 10
    let afterSample: MetricsSample | undefined
    const handle = mountOverlay({
      getScore: () => score,
      getBaseline: () => baseline,
      getAfter: () => afterSample,
    })
    expect(document.getElementById('threejs-doctor-overlay')?.textContent).toContain('10')
    expect(document.getElementById('threejs-doctor-overlay')?.textContent).toContain(
      'No after metrics',
    )
    score = 82
    afterSample = after
    handle.refresh()
    const text = document.getElementById('threejs-doctor-overlay')?.textContent ?? ''
    expect(text).toContain('82')
    expect(text).toContain('-110')
  })

  it('Doctor.mountOverlay paints the last report and unmountOverlay removes it', async () => {
    const doctor = createDoctor()
    const report = await doctor.diagnose()
    doctor.mountOverlay()
    const el = document.getElementById('threejs-doctor-overlay')
    expect(el).not.toBeNull()
    expect(el?.textContent).toContain(String(report.score))
    expect(el?.textContent).toContain('No after metrics')
    doctor.unmountOverlay()
    expect(document.getElementById('threejs-doctor-overlay')).toBeNull()
  })

  it('Doctor overlay refreshes after optimize with before/after deltas', async () => {
    const doctor = createDoctor()
    doctor.mountOverlay()
    expect(document.getElementById('threejs-doctor-overlay')?.textContent).toContain(
      'No after metrics',
    )
    const report = await doctor.optimize({ apply: ['safe'] })
    const text = document.getElementById('threejs-doctor-overlay')?.textContent ?? ''
    expect(text).toContain(String(report.score))
    expect(text).toMatch(/drawCalls/i)
    const drawDelta = report.deltas?.drawCalls ?? 0
    expect(text).toContain(`drawCalls: ${drawDelta >= 0 ? '+' : ''}${drawDelta}`)
    doctor.unmountOverlay()
  })

  it('optimize does not flash diagnose-only overlay text', async () => {
    const doctor = createDoctor()
    await doctor.diagnose()
    doctor.mountOverlay()
    const el = document.getElementById('threejs-doctor-overlay')
    expect(el).not.toBeNull()
    const paints: string[] = []
    const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')
    Object.defineProperty(el, 'textContent', {
      configurable: true,
      enumerable: true,
      get() {
        return descriptor?.get?.call(this) as string
      },
      set(value: string) {
        paints.push(String(value))
        descriptor?.set?.call(this, value)
      },
    })
    const report = await doctor.optimize({ apply: ['safe'] })
    expect(paints.some((t) => t.includes('No after metrics'))).toBe(false)
    expect(paints.at(-1)).toContain(`Doctor Score ${report.score}`)
    expect(paints.at(-1)).toMatch(/drawCalls/i)
    doctor.unmountOverlay()
  })
})
