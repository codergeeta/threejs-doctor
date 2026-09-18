import { describe, it, expect } from 'vitest'
import { Doctor } from '../doctor.js'
import { dprCapPass } from '../passes/dpr-cap.js'
import { collectHostSceneStats } from '../scene-stats.js'
import { isComposerLike, readComposerSize } from '../composer.js'
import type { PassContext } from '../passes/types.js'

function clock(step = 16) {
  let t = 0
  return () => {
    t += step
    return t
  }
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const

function indexedGeometry(triangles: number, uuid: string) {
  return {
    uuid,
    index: { count: triangles * 3 },
    boundingSphere: { radius: 1, center: { x: 0, y: 0, z: 0 } },
  }
}

describe('R2: triangle cost is drawn, geometry is attribution', () => {
  it('does not fire triangles/too-many when leftover geometry is huge but drawn is under budget', async () => {
    const leftover = {
      isMesh: true,
      isInstancedMesh: true,
      name: 'trees-original',
      count: 400,
      geometry: indexedGeometry(2_200, 'geo-tree'),
      material: { uuid: 'm' },
      instanceMatrix: { array: new Float32Array(400 * 16), count: 400 },
    }
    const chunk = {
      isMesh: true,
      isInstancedMesh: true,
      name: 'trees-chunk',
      count: 40,
      geometry: indexedGeometry(2_200, 'geo-tree-chunk'),
      material: { uuid: 'm2' },
      instanceMatrix: { array: new Float32Array(40 * 16), count: 40 },
    }
    const scene = {
      children: [leftover, chunk],
      traverse(cb: (o: object) => void) {
        cb(leftover)
        cb(chunk)
      },
    }
    const renderer = {
      info: {
        render: { calls: 12, triangles: 88_000 },
        memory: { geometries: 2, textures: 1 },
      },
      setPixelRatio() {},
      render() {},
    }
    const doctor = new Doctor({
      scene: scene as never,
      camera: { far: 200 },
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 1,
      now: clock(),
    })
    const report = await doctor.diagnose()
    expect(report.baseline.triangles).toBe(88_000)
    expect(report.findings.some((f) => f.id === 'triangles/too-many')).toBe(false)
    const collected = collectHostSceneStats(scene, renderer)
    expect(collected.insights.geometryTriangleCount).toBe(2_200 * 400 + 2_200 * 40)
  })

  it('credits score when drawn triangles drop after chunking even if unused geometry remains', async () => {
    const mesh = {
      isMesh: true,
      isInstancedMesh: true,
      name: 'trees',
      count: 400,
      geometry: indexedGeometry(2_200, 'geo-tree'),
      material: { uuid: 'm' },
      instanceMatrix: { array: new Float32Array(400 * 16), count: 400 },
    }
    const scene = {
      children: [mesh],
      traverse(cb: (o: object) => void) {
        cb(mesh)
      },
    }
    const renderer = {
      info: {
        render: { calls: 4, triangles: 880_000 },
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
    const before = await doctor.diagnose()
    renderer.info.render.triangles = 211_000
    await doctor.measure()
    const after = await doctor.diagnose()
    expect(before.baseline.triangles).toBe(880_000)
    expect(after.baseline.triangles).toBe(211_000)
    expect(after.score).toBeGreaterThan(before.score)
  })
})

describe('R2: composer discovery', () => {
  it('accepts DoctorOptions.composer and the pmndrs inputBuffer/outputBuffer shape', async () => {
    const composer = {
      passes: [{}],
      inputBuffer: { width: 800, height: 450 },
      outputBuffer: { width: 800, height: 450 },
      pixelRatio: 1,
    }
    expect(isComposerLike(composer)).toBe(true)
    expect(readComposerSize(composer).width).toBe(800)
    const renderer = {
      info: { render: { calls: 10, triangles: 100 }, memory: { geometries: 1, textures: 1 } },
      setPixelRatio() {},
      getPixelRatio: () => 2,
      drawingBufferWidth: 1600,
      drawingBufferHeight: 900,
      render() {},
    }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      composer,
      profile: 'game',
      measureFrames: 1,
      now: clock(),
    })
    const report = await doctor.diagnose()
    const hit = report.findings.find((f) => f.id === 'renderer/composer-resolution-mismatch')
    expect(hit).toBeDefined()
    expect(Number(hit?.evidence.composerWidth)).toBe(800)
  })

  it('discovers a three.js EffectComposer on scene.userData, not only renderer props', async () => {
    const composer = {
      isEffectComposer: true,
      passes: [{}],
      renderTarget1: { width: 640, height: 360 },
      writeBuffer: { width: 640, height: 360 },
      pixelRatio: 1,
    }
    const scene = { children: [], userData: { composer }, traverse() {} }
    const renderer = {
      info: { render: { calls: 4, triangles: 40 }, memory: { geometries: 1, textures: 1 } },
      setPixelRatio() {},
      getPixelRatio: () => 2,
      drawingBufferWidth: 1280,
      drawingBufferHeight: 720,
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
    const report = await doctor.diagnose()
    expect(report.findings.some((f) => f.id === 'renderer/composer-resolution-mismatch')).toBe(true)
  })

  it('fires composer-resolution-mismatch after a renderer DPR change leaves a supplied composer stale', async () => {
    const composer = {
      isEffectComposer: true,
      passes: [{}],
      renderTarget1: { width: 800, height: 450 },
      pixelRatio: 1,
      setPixelRatio(value: number) {
        this.pixelRatio = value
      },
    }
    const renderer = {
      info: { render: { calls: 4, triangles: 40 }, memory: { geometries: 1, textures: 1 } },
      pixelRatio: 1,
      drawingBufferWidth: 800,
      drawingBufferHeight: 450,
      getPixelRatio() {
        return this.pixelRatio
      },
      setPixelRatio(value: number) {
        this.pixelRatio = value
        this.drawingBufferWidth = 800 * value
        this.drawingBufferHeight = 450 * value
      },
      render() {},
    }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      composer,
      profile: 'game',
      measureFrames: 1,
      now: clock(),
    })
    const matched = await doctor.diagnose()
    expect(matched.findings.some((f) => f.id === 'renderer/composer-resolution-mismatch')).toBe(false)
    renderer.setPixelRatio(2)
    const stale = await doctor.diagnose()
    expect(stale.findings.some((f) => f.id === 'renderer/composer-resolution-mismatch')).toBe(true)
  })
})

describe('R2: InstancedMesh instance-aware bounds', () => {
  it('flags oversized-bounds from InstancedMesh.computeBoundingSphere, not the prototype sphere', async () => {
    const mesh = {
      isMesh: true,
      isInstancedMesh: true,
      count: 4,
      frustumCulled: true,
      geometry: {
        uuid: 'g',
        index: { count: 36 },
        boundingSphere: { radius: 1, center: { x: 0, y: 0, z: 0 } },
      },
      material: { uuid: 'm' },
      matrixWorld: { elements: IDENTITY },
      boundingSphere: { radius: 1, center: { x: 0, y: 0, z: 0 } },
      computeBoundingSphere() {
        this.boundingSphere = { radius: 400, center: { x: 200, y: 0, z: 0 } }
      },
    }
    const scene = {
      children: [mesh],
      traverse(cb: (o: object) => void) {
        cb(mesh)
      },
    }
    const doctor = new Doctor({
      scene: scene as never,
      camera: { far: 80, position: { x: 0, y: 0, z: 5 } },
      renderer: {
        info: { render: { calls: 1, triangles: 12 }, memory: { geometries: 1, textures: 0 } },
        setPixelRatio() {},
        render() {},
      } as never,
      profile: 'game',
      measureFrames: 1,
      now: clock(),
    })
    const report = await doctor.diagnose()
    expect(report.findings.some((f) => f.id === 'culling/oversized-bounds')).toBe(true)
    expect(mesh.computeBoundingSphere).toBeDefined()
  })
})

describe('R2: removed-without-dispose InstancedMesh leak', () => {
  it('flags a leak when an InstancedMesh is removed without dispose even if live buffer sum drops', async () => {
    const listeners = new Map<string, Array<() => void>>()
    const mesh: Record<string, unknown> = {
      isMesh: true,
      isInstancedMesh: true,
      count: 32,
      geometry: indexedGeometry(10, 'g-inst'),
      material: { uuid: 'm' },
      instanceMatrix: { array: new Float32Array(32 * 16), count: 32 },
      addEventListener(type: string, fn: () => void) {
        const list = listeners.get(type) ?? []
        list.push(fn)
        listeners.set(type, list)
      },
    }
    const objects: object[] = [mesh]
    const scene = {
      children: objects,
      traverse(cb: (o: object) => void) {
        for (const o of objects) cb(o)
      },
    }
    const renderer = {
      info: { render: { calls: 2, triangles: 320 }, memory: { geometries: 1, textures: 0 } },
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
    await doctor.measure()
    const first = await doctor.diagnose()
    expect(first.findings.some((f) => f.id === 'lifecycle/instance-buffer-growth')).toBe(false)

    objects.length = 0
    for (const fn of listeners.get('removed') ?? []) fn()
    await doctor.measure()
    await doctor.measure()
    const second = await doctor.diagnose()
    const hit = second.findings.find((f) => f.id === 'lifecycle/instance-buffer-growth')
    expect(hit).toBeDefined()
    expect(Number(hit?.evidence.removedUndisposedInstancedCount)).toBe(1)
  })

  it('does not treat pooled remove/re-add as a leak when the mesh is added back', async () => {
    const listeners = new Map<string, Array<() => void>>()
    const mesh: Record<string, unknown> = {
      isMesh: true,
      isInstancedMesh: true,
      count: 8,
      geometry: indexedGeometry(4, 'g-pool'),
      material: { uuid: 'm' },
      instanceMatrix: { array: new Float32Array(8 * 16), count: 8 },
      addEventListener(type: string, fn: () => void) {
        const list = listeners.get(type) ?? []
        list.push(fn)
        listeners.set(type, list)
      },
    }
    const objects: object[] = [mesh]
    const scene = {
      children: objects,
      traverse(cb: (o: object) => void) {
        for (const o of objects) cb(o)
      },
    }
    const doctor = new Doctor({
      scene: scene as never,
      camera: {},
      renderer: {
        info: { render: { calls: 1, triangles: 40 }, memory: { geometries: 1, textures: 0 } },
        setPixelRatio() {},
        render() {},
      } as never,
      profile: 'game',
      measureFrames: 1,
      now: clock(),
    })
    await doctor.measure()
    objects.length = 0
    for (const fn of listeners.get('removed') ?? []) fn()
    await doctor.measure()
    objects.push(mesh)
    for (const fn of listeners.get('added') ?? []) fn()
    await doctor.measure()
    const report = await doctor.diagnose()
    expect(report.findings.some((f) => f.id === 'lifecycle/instance-buffer-growth')).toBe(false)
  })
})

describe('R2: dpr-cap reaches composer', () => {
  it('calls composer.setPixelRatio and onPixelRatioChange when capping', () => {
    const ratios: number[] = []
    const composer = {
      pixelRatio: 3,
      setPixelRatio(value: number) {
        this.pixelRatio = value
      },
    }
    const renderer = {
      pixelRatio: 3,
      setPixelRatio(v: number) {
        this.pixelRatio = v
      },
      info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } },
    }
    const ctx: PassContext = {
      renderer: renderer as never,
      scene: { children: [], traverse() {} },
      device: {
        tier: 'low',
        maxTextureSize: 4096,
        webgl: true,
        webgpu: false,
        devicePixelRatio: 3,
        hardwareConcurrency: 4,
      },
      profile: 'marketing',
      postfxEnabled: true,
      frameloop: 'always',
      setFrameloop() {},
      composer,
      onPixelRatioChange(ratio) {
        ratios.push(ratio)
      },
    }
    const handle = dprCapPass.apply(ctx)
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.5)
    expect(composer.pixelRatio).toBe(renderer.pixelRatio)
    expect(ratios).toEqual([renderer.pixelRatio])
    handle.rollback()
    expect(renderer.pixelRatio).toBe(3)
    expect(composer.pixelRatio).toBe(3)
  })
})

describe('R2: measure wraps host render and uses median drawCalls', () => {
  it('times renderer.render work, not the waitFrame vsync interval', async () => {
    let t = 0
    const now = () => t
    const renderer = {
      info: {
        render: { calls: 1, triangles: 10 },
        memory: { geometries: 0, textures: 0 },
      },
      setPixelRatio() {},
      render() {
        t += 4
      },
    }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      hostRenderer: renderer,
      profile: 'game',
      measureFrames: 3,
      now,
      waitFrame: async () => {
        renderer.render()
        t += 12
      },
    })
    const sample = await doctor.measure()
    expect(sample.p95FrameTimeMs).toBe(4)
  })

  it('sums top-level wrapped render() workMs within a frame (HUD + minimap)', async () => {
    let t = 0
    const now = () => t
    const renderer = {
      info: {
        render: { calls: 1, triangles: 10 },
        memory: { geometries: 0, textures: 0 },
      },
      setPixelRatio() {},
      render() {
        t += 3
      },
    }
    const composer = {
      isEffectComposer: true,
      passes: [],
      renderTarget1: { width: 8, height: 8 },
      render() {
        t += 5
      },
    }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      composer,
      profile: 'game',
      measureFrames: 2,
      now,
      waitFrame: async () => {
        renderer.render()
        composer.render()
      },
    })
    const sample = await doctor.measure()
    expect(sample.p95FrameTimeMs).toBe(8)
  })

  it('does not double-count nested composer.render that calls renderer.render', async () => {
    let t = 0
    const now = () => t
    const renderer = {
      info: {
        render: { calls: 1, triangles: 10 },
        memory: { geometries: 0, textures: 0 },
      },
      setPixelRatio() {},
      render() {
        t += 4
      },
    }
    const composer = {
      isEffectComposer: true,
      passes: [],
      renderTarget1: { width: 8, height: 8 },
      render() {
        renderer.render()
        t += 1
      },
    }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      composer,
      profile: 'game',
      measureFrames: 2,
      now,
      waitFrame: async () => {
        composer.render()
      },
    })
    const sample = await doctor.measure()
    expect(sample.p95FrameTimeMs).toBe(5)
  })

  it('uses the median drawCalls across sampled frames, not the last frame only', async () => {
    const frames = [10, 12, 100]
    let i = 0
    const renderer = {
      info: {
        render: { calls: 0, triangles: 0 },
        memory: { geometries: 0, textures: 0 },
        autoReset: true,
        reset() {
          this.render.calls = 0
          this.render.triangles = 0
        },
      },
      setPixelRatio() {},
      render() {},
    }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 3,
      now: clock(),
      waitFrame: async () => {
        renderer.info.render.calls = frames[i] ?? 0
        renderer.info.render.triangles = (frames[i] ?? 0) * 10
        i += 1
      },
    })
    const sample = await doctor.measure()
    expect(sample.drawCalls).toBe(12)
    expect(sample.triangles).toBe(120)
  })
})
