import { describe, it, expect } from 'vitest'
import { Doctor } from '../doctor.js'
import { probeDevice } from '@threejs-doctor/core'

function clock(step = 16) {
  let t = 0
  return () => {
    t += step
    return t
  }
}

/** EffectComposer-shaped: each renderer.render() is one pass; autoReset drops prior passes. */
function composerRenderer() {
  const info = {
    autoReset: true,
    render: { calls: 0, triangles: 0, points: 0 },
    memory: { geometries: 2, textures: 3 },
    reset() {
      this.render.calls = 0
      this.render.triangles = 0
      this.render.points = 0
    },
  }
  const renderer = {
    info,
    setPixelRatio() {},
    render() {
      info.render.calls += 1
      info.render.triangles += 50
      info.render.points += 2
      if (info.autoReset !== false) {
        info.render.calls = 1
        info.render.triangles = 50
        info.render.points = 2
      }
    },
  }
  return renderer
}

describe('P1: measure times real host frames', () => {
  it('calls renderer.render between begin/end when the host does not pass waitFrame', async () => {
    let renders = 0
    const renderer = {
      info: {
        render: { calls: 0, triangles: 0 },
        memory: { geometries: 1, textures: 1 },
      },
      setPixelRatio() {},
      render() {
        renders += 1
        this.info.render.calls = 12
        this.info.render.triangles = 400
      },
    }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 4,
      now: clock(),
    })
    await doctor.measure()
    expect(renders).toBe(4)
  })

  it('uses waitFrame as the host render path and does not also call renderer.render', async () => {
    let hostFrames = 0
    let doctorRenders = 0
    const renderer = {
      info: {
        render: { calls: 0, triangles: 0 },
        memory: { geometries: 1, textures: 1 },
      },
      setPixelRatio() {},
      render() {
        doctorRenders += 1
      },
    }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 3,
      now: clock(),
      waitFrame: async () => {
        hostFrames += 1
        renderer.info.render.calls = 40
      },
    })
    await doctor.measure()
    expect(hostFrames).toBe(3)
    expect(doctorRenders).toBe(0)
  })

  it('records gpuFrameTimeMs only when the timer query result is available', async () => {
    const ext = {
      TIME_ELAPSED_EXT: 0x88bf,
      GPU_DISJOINT_EXT: 0x8fbb,
    }
    const gl = {
      QUERY_RESULT_AVAILABLE: 0x8867,
      QUERY_RESULT: 0x8866,
      createQuery: () => ({}),
      beginQuery() {},
      endQuery() {},
      deleteQuery() {},
      getQueryParameter(_q: unknown, pname: number) {
        if (pname === 0x8867) return true
        if (pname === 0x8866) return 2_000_000
        return 0
      },
      getParameter() {
        return false
      },
      getExtension(name: string) {
        return name === 'EXT_disjoint_timer_query_webgl2' ? ext : null
      },
    }
    const renderer = {
      info: {
        render: { calls: 1, triangles: 1 },
        memory: { geometries: 0, textures: 0 },
      },
      setPixelRatio() {},
      extensions: {
        get(name: string) {
          return name === 'EXT_disjoint_timer_query_webgl2' ? ext : null
        },
      },
      getContext() {
        return gl
      },
      render() {},
    }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 2,
      now: clock(),
    })
    const sample = await doctor.measure()
    expect(sample.gpuFrameTimeMs).toBe(2)
  })

  it('omits gpuFrameTimeMs when the extension exists but no query result is available', async () => {
    const ext = {
      TIME_ELAPSED_EXT: 0x88bf,
      GPU_DISJOINT_EXT: 0x8fbb,
    }
    const gl = {
      QUERY_RESULT_AVAILABLE: 0x8867,
      QUERY_RESULT: 0x8866,
      createQuery: () => ({}),
      beginQuery() {},
      endQuery() {},
      deleteQuery() {},
      getQueryParameter() {
        return false
      },
      getParameter() {
        return false
      },
      getExtension() {
        return ext
      },
    }
    const renderer = {
      info: {
        render: { calls: 1, triangles: 1 },
        memory: { geometries: 0, textures: 0 },
      },
      setPixelRatio() {},
      getContext() {
        return gl
      },
      getExtension() {
        return ext
      },
      render() {},
    }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 2,
      now: clock(),
    })
    const sample = await doctor.measure()
    expect(Object.prototype.hasOwnProperty.call(sample, 'gpuFrameTimeMs')).toBe(false)
  })

  it('does not invent gpuFrameTimeMs when EXT_disjoint_timer_query_webgl2 is missing', async () => {
    const renderer = {
      info: {
        render: { calls: 1, triangles: 1 },
        memory: { geometries: 0, textures: 0 },
      },
      setPixelRatio() {},
      getExtension() {
        return null
      },
      render() {},
    }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 2,
      now: clock(),
    })
    const sample = await doctor.measure()
    expect(Object.prototype.hasOwnProperty.call(sample, 'gpuFrameTimeMs')).toBe(false)
  })
})

describe('P1: EffectComposer drawCalls accumulate while measuring', () => {
  it('reports accumulated composer passes, not the last pass after autoReset', async () => {
    const renderer = composerRenderer()
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 2,
      now: clock(),
      waitFrame: async () => {
        renderer.render()
        renderer.render()
      },
    })
    const sample = await doctor.measure()
    expect(sample.drawCalls).toBe(2)
    expect(sample.triangles).toBe(100)
  })

  it('sets autoReset false during the host frame then restores the previous value', async () => {
    const renderer = composerRenderer()
    expect(renderer.info.autoReset).toBe(true)
    const seen: Array<boolean | undefined> = []
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 1,
      now: clock(),
      waitFrame: async () => {
        seen.push(renderer.info.autoReset)
        renderer.render()
        renderer.render()
      },
    })
    await doctor.measure()
    expect(seen).toEqual([false])
    expect(renderer.info.autoReset).toBe(true)
  })
})

describe('P1: lights, textures, and render-target VRAM', () => {
  it('collects lights from the scene so light rules can fire without getSceneStats', async () => {
    const lights = Array.from({ length: 8 }, () => ({ isLight: true, castShadow: true }))
    const scene = {
      children: lights,
      traverse(cb: (o: Record<string, unknown>) => void) {
        for (const l of lights) cb(l)
      },
    }
    const renderer = {
      info: {
        render: { calls: 20, triangles: 1000 },
        memory: { geometries: 1, textures: 1 },
      },
      setPixelRatio() {},
      render() {},
    }
    const doctor = new Doctor({
      scene: scene as never,
      camera: {},
      renderer: renderer as never,
      profile: 'product',
      measureFrames: 1,
      now: clock(),
    })
    const report = await doctor.diagnose()
    expect(report.baseline.lightCount).toBe(8)
    expect(report.baseline.shadowCastingLightCount).toBe(8)
    expect(report.findings.some((f) => f.id === 'lights/too-many')).toBe(true)
    expect(report.findings.some((f) => f.id === 'shadows/too-many-casters')).toBe(true)
  })

  it('estimates VRAM from textures and render targets when dimensions are known', async () => {
    const map = { uuid: 'albedo', image: { width: 1024, height: 1024 } }
    const rt = { isWebGLRenderTarget: true, width: 4096, height: 4096, texture: { uuid: 'rt0' } }
    const scene = {
      children: [],
      traverse(cb: (o: Record<string, unknown>) => void) {
        cb({
          isMesh: true,
          geometry: { uuid: 'g' },
          material: { uuid: 'm', map },
        })
      },
    }
    const renderer = {
      info: {
        render: { calls: 10, triangles: 100 },
        memory: { geometries: 1, textures: 2 },
      },
      setPixelRatio() {},
      render() {},
      shadowMap: { enabled: true },
    }
    Object.assign(renderer, { renderTarget: rt })
    const doctor = new Doctor({
      scene: scene as never,
      camera: {},
      renderer: renderer as never,
      profile: 'marketing',
      measureFrames: 1,
      now: clock(),
    })
    const sample = await doctor.measure()
    expect(sample.textureCount).toBeGreaterThanOrEqual(2)
    expect(sample.estimatedVramBytes).toBeGreaterThan(1024 * 1024 * 4)
    expect(sample.estimatedVramBytes).toBe(1024 * 1024 * 4 + 4096 * 4096 * 4)
    const report = await doctor.diagnose()
    expect(report.findings.some((f) => f.id === 'textures/high-vram')).toBe(true)
  })

  it('omits estimatedVramBytes when no texture or RT dimensions are known', async () => {
    const scene = {
      children: [],
      traverse(cb: (o: Record<string, unknown>) => void) {
        cb({
          isMesh: true,
          geometry: { uuid: 'g' },
          material: { uuid: 'm', map: { uuid: 'unk' } },
        })
      },
    }
    const renderer = {
      info: {
        render: { calls: 1, triangles: 1 },
        memory: { geometries: 1, textures: 1 },
      },
      setPixelRatio() {},
      render() {},
    }
    const doctor = new Doctor({
      scene: scene as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 1,
      now: clock(),
    })
    const sample = await doctor.measure()
    expect(Object.prototype.hasOwnProperty.call(sample, 'estimatedVramBytes')).toBe(false)
  })
})

describe('P1: device probe reads WebGL maxTextureSize', () => {
  it('forwards GL MAX_TEXTURE_SIZE instead of defaulting to 2048', () => {
    const desktop = probeDevice({
      devicePixelRatio: 1,
      hardwareConcurrency: 16,
      maxTextureSize: 16384,
      webgl: true,
      webgpu: true,
    })
    const phone = probeDevice({
      devicePixelRatio: 3,
      hardwareConcurrency: 4,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
    })
    expect(desktop.maxTextureSize).toBe(16384)
    expect(phone.maxTextureSize).toBe(4096)
    expect(desktop.tier).not.toBe(phone.tier)
    expect(desktop.tier).toBe('high')
    expect(phone.tier).toBe('low')
  })

  it('Doctor.getDevice reads maxTextureSize from the GL context', () => {
    const renderer = {
      info: {
        render: { calls: 0, triangles: 0 },
        memory: { geometries: 0, textures: 0 },
      },
      setPixelRatio() {},
      getContext() {
        return {
          MAX_TEXTURE_SIZE: 0x0d33,
          getParameter(pname: number) {
            if (pname === 0x0d33) return 16384
            return 0
          },
          getExtension() {
            return null
          },
        }
      },
      getExtension() {
        return null
      },
    }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 1,
      now: clock(),
    })
    expect(doctor.getDevice().maxTextureSize).toBe(16384)
  })
})

describe('P1: profile auto is stable for interactive games', () => {
  it('classifies a continuous high-mesh scene as game, not cad', async () => {
    const meshes = Array.from({ length: 220 }, (_, i) => ({
      isMesh: true,
      geometry: { uuid: `g${i}` },
      material: { uuid: `m${i}` },
    }))
    const scene = {
      children: meshes,
      traverse(cb: (o: Record<string, unknown>) => void) {
        for (const m of meshes) cb(m)
      },
    }
    const renderer = {
      info: {
        render: { calls: 90, triangles: 20_000 },
        memory: { geometries: 220, textures: 8 },
      },
      setPixelRatio() {},
      render() {},
    }
    const doctor = new Doctor({
      scene: scene as never,
      camera: {},
      renderer: renderer as never,
      profile: 'auto',
      frameloop: 'always',
      measureFrames: 1,
      now: clock(),
    })
    const report = await doctor.diagnose()
    expect(report.profile).toBe('game')
  })

  it('classifies an on-demand racer with high draw activity as game, not marketing', async () => {
    const meshes = Array.from({ length: 80 }, (_, i) => ({
      isMesh: true,
      geometry: { uuid: `g${i}` },
      material: { uuid: `m${i}` },
    }))
    const scene = {
      children: meshes,
      traverse(cb: (o: Record<string, unknown>) => void) {
        for (const m of meshes) cb(m)
      },
    }
    const renderer = {
      info: {
        render: { calls: 133, triangles: 40_000 },
        memory: { geometries: 80, textures: 12 },
      },
      setPixelRatio() {},
      render() {},
    }
    const doctor = new Doctor({
      scene: scene as never,
      camera: {},
      renderer: renderer as never,
      profile: 'auto',
      frameloop: 'demand',
      measureFrames: 1,
      now: clock(),
    })
    const report = await doctor.diagnose()
    expect(report.profile).toBe('game')
  })

  it('does not flip auto from game to cad when meshCount later crosses 200', async () => {
    const objects: Array<Record<string, unknown>> = Array.from({ length: 80 }, (_, i) => ({
      isMesh: true,
      geometry: { uuid: `g${i}` },
      material: { uuid: `m${i}` },
    }))
    const scene = {
      children: objects,
      traverse(cb: (o: Record<string, unknown>) => void) {
        for (const o of objects) cb(o)
      },
    }
    const renderer = {
      info: {
        render: { calls: 100, triangles: 10_000 },
        memory: { geometries: 80, textures: 8 },
      },
      setPixelRatio() {},
      render() {},
    }
    const doctor = new Doctor({
      scene: scene as never,
      camera: {},
      renderer: renderer as never,
      profile: 'auto',
      frameloop: 'always',
      measureFrames: 1,
      now: clock(),
    })
    expect((await doctor.diagnose()).profile).toBe('game')
    for (let i = 80; i < 220; i++) {
      objects.push({
        isMesh: true,
        geometry: { uuid: `g${i}` },
        material: { uuid: `m${i}` },
      })
    }
    renderer.info.memory.geometries = 220
    expect((await doctor.diagnose()).profile).toBe('game')
  })
})
