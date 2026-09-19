import { describe, it, expect, afterEach } from 'vitest'
import { createGpuFrameSampler, waitGpuMacrotask, guardWaitFrame } from '../gpu-timer.js'
import { Doctor } from '../doctor.js'
import type { DoctorRendererLike } from '../passes/types.js'

const TIME_ELAPSED_EXT = 0x88bf
const GPU_DISJOINT_EXT = 0x8fbb
const QUERY_RESULT_AVAILABLE = 0x8867
const QUERY_RESULT = 0x8866

function clock(step = 16) {
  let t = 0
  return () => {
    t += step
    return t
  }
}

type FakeQuery = {
  id: number
  ended: boolean
  createdAt: number
  availableAfter: number
  ns: number
  deleted: boolean
}

/** Real WebGL2 shape: methods on the context, constants (+ queryCounterEXT) on the EXT. */
function webgl2TimerGl(opts?: { delayFrames?: number; disjoint?: boolean; ns?: number }) {
  const delay = opts?.delayFrames ?? 1
  let ns = opts?.ns ?? 2_000_000
  const queries: FakeQuery[] = []
  let frame = 0
  const deleted: unknown[] = []
  let disjointFlag = opts?.disjoint === true

  const gl = {
    QUERY_RESULT_AVAILABLE,
    QUERY_RESULT,
    createQuery() {
      if (this !== gl) throw new TypeError('Illegal invocation')
      const q: FakeQuery = {
        id: queries.length,
        ended: false,
        createdAt: frame,
        availableAfter: frame + delay,
        ns,
        deleted: false,
      }
      queries.push(q)
      return q
    },
    beginQuery(_target: number, _query: unknown) {
      if (this !== gl) throw new TypeError('Illegal invocation')
    },
    endQuery(_target: number) {
      if (this !== gl) throw new TypeError('Illegal invocation')
      const q = queries[queries.length - 1]
      if (q) q.ended = true
    },
    getQueryParameter(query: FakeQuery, pname: number) {
      if (this !== gl) throw new TypeError('Illegal invocation')
      if (pname === QUERY_RESULT_AVAILABLE) {
        if (!query?.ended || query.deleted) return false
        return frame > (query.availableAfter ?? 0)
      }
      if (pname === QUERY_RESULT) return query?.ns ?? ns
      return 0
    },
    getParameter(pname: number) {
      if (this !== gl) throw new TypeError('Illegal invocation')
      if (pname === GPU_DISJOINT_EXT) {
        const value = disjointFlag
        disjointFlag = false
        return value
      }
      return 0
    },
    deleteQuery(query: FakeQuery) {
      if (this !== gl) throw new TypeError('Illegal invocation')
      deleted.push(query)
      if (query) query.deleted = true
    },
    getExtension(name: string) {
      return name === 'EXT_disjoint_timer_query_webgl2' ? ext : null
    },
    tick() {
      frame += 1
    },
    setNs(next: number) {
      ns = next
    },
    liveQueries() {
      return queries.filter((q) => !q.deleted)
    },
    deleted,
    queries,
  }

  const ext = {
    TIME_ELAPSED_EXT,
    GPU_DISJOINT_EXT,
    queryCounterEXT() {},
  }

  return { gl, ext }
}

function rendererFor(gl: object, extra?: { extensions?: { get: (name: string) => unknown }; ext?: unknown }) {
  return {
    info: {
      render: { calls: 1, triangles: 1 },
      memory: { geometries: 0, textures: 0 },
    },
    setPixelRatio() {},
    getContext() {
      return gl
    },
    render() {
      if (typeof (gl as { tick?: () => void }).tick === 'function') (gl as { tick: () => void }).tick()
    },
    ...(extra?.extensions ? { extensions: extra.extensions } : {}),
    ...(extra?.ext
      ? {
          getExtension(name: string) {
            return name === 'EXT_disjoint_timer_query_webgl2' ? extra.ext : null
          },
        }
      : {}),
  }
}

describe('GPU timer uses WebGL2RenderingContext methods, not the EXT object', () => {
  it('does not construct a sampler when createQuery lives only on the EXT object', () => {
    const ext = {
      TIME_ELAPSED_EXT,
      GPU_DISJOINT_EXT,
      createQuery: () => ({}),
      beginQuery() {},
      endQuery() {},
      getQueryParameter() {
        return true
      },
    }
    const gl = {
      QUERY_RESULT_AVAILABLE,
      QUERY_RESULT,
      getExtension() {
        return ext
      },
    }
    const sampler = createGpuFrameSampler(
      rendererFor(gl, { ext }) as unknown as DoctorRendererLike,
    )
    expect(sampler).toBeUndefined()
  })

  it('constructs a sampler when methods are on the GL context and constants are on the EXT', () => {
    const { gl, ext } = webgl2TimerGl()
    const sampler = createGpuFrameSampler(
      rendererFor(gl, { ext }) as unknown as DoctorRendererLike,
    )
    expect(sampler).toBeDefined()
  })

  it('prefers renderer.extensions.get over renderer.getExtension', () => {
    const { gl, ext } = webgl2TimerGl()
    let viaExtensions = 0
    let viaGetExtension = 0
    const renderer = rendererFor(gl, {
      extensions: {
        get(name: string) {
          viaExtensions += 1
          return name === 'EXT_disjoint_timer_query_webgl2' ? ext : null
        },
      },
    }) as unknown as DoctorRendererLike & { getExtension: (name: string) => unknown }
    renderer.getExtension = () => {
      viaGetExtension += 1
      return null
    }
    expect(createGpuFrameSampler(renderer)).toBeDefined()
    expect(viaExtensions).toBeGreaterThan(0)
    expect(viaGetExtension).toBe(0)
  })

  it('omits gpuFrameTimeMs until a later frame of the same measure reports QUERY_RESULT_AVAILABLE', async () => {
    const { gl, ext } = webgl2TimerGl({ delayFrames: 1, ns: 4_000_000 })
    const renderer = rendererFor(gl, { ext })
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 3,
      now: clock(),
    })
    const sample = await doctor.measure(3)
    expect(sample.gpuFrameTimeMs).toBe(4)
    expect(gl.liveQueries()).toHaveLength(0)
  })

  it('discards the result when GPU_DISJOINT_EXT is set and never invents a time', async () => {
    const { gl, ext } = webgl2TimerGl({ delayFrames: 1, disjoint: true, ns: 9_000_000 })
    const renderer = rendererFor(gl, { ext })
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 3,
      now: clock(),
    })
    const sample = await doctor.measure()
    expect(Object.prototype.hasOwnProperty.call(sample, 'gpuFrameTimeMs')).toBe(false)
  })

  it('does not carry measure A GPU times into measure B with no work', async () => {
    const { gl, ext } = webgl2TimerGl({ delayFrames: 3, ns: 4_630_000 })
    const renderer = rendererFor(gl, { ext })
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 4,
      now: clock(),
    })
    const a = await doctor.measure(4)
    expect(a.gpuFrameTimeMs === 4.63 || a.gpuFrameTimeMs === undefined).toBe(true)
    expect(gl.liveQueries()).toHaveLength(0)

    gl.setNs(1_000_000)
    const originalRender = renderer.render
    renderer.render = () => {}
    const b = await doctor.measure(4)
    renderer.render = originalRender
    expect(Object.prototype.hasOwnProperty.call(b, 'gpuFrameTimeMs')).toBe(false)
    expect(b.gpuFrameTimeMs).toBeUndefined()
    expect(gl.liveQueries()).toHaveLength(0)
  })

  it('collects every available query result in one harvest, not only the oldest', () => {
    const { gl, ext } = webgl2TimerGl({ delayFrames: 2, ns: 3_000_000 })
    const sampler = createGpuFrameSampler(rendererFor(gl, { ext }) as unknown as DoctorRendererLike)
    expect(sampler).toBeDefined()
    sampler!.begin()
    gl.tick()
    sampler!.end()
    sampler!.begin()
    gl.tick()
    sampler!.end()
    gl.tick()
    gl.tick()
    const harvested = sampler!.end()
    const times = Array.isArray(harvested) ? harvested : harvested === undefined ? [] : [harvested]
    expect(times.length).toBeGreaterThanOrEqual(2)
    expect(times.every((ms) => ms === 3)).toBe(true)
  })

  it('reads delayed GPU results inside one measure and never invents gpuFrameTimeMs', async () => {
    const { gl, ext } = webgl2TimerGl({ delayFrames: 3, ns: 7_000_000 })
    const renderer = rendererFor(gl, { ext })
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 8,
      now: clock(),
    })
    const sample = await doctor.measure(8)
    expect(sample.gpuFrameTimeMs).toBe(7)
    expect(gl.liveQueries()).toHaveLength(0)
  })

  it('does not leave pending queries from a tight renderFrame-only loop to poison the next measure', async () => {
    const { gl, ext } = webgl2TimerGl({ delayFrames: 8, ns: 9_000_000 })
    const renderer = rendererFor(gl, { ext })
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 6,
      now: clock(),
    })
    const first = await doctor.measure(6)
    expect(first.gpuTimingSkipped).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(first, 'gpuFrameTimeMs')).toBe(false)
    expect(gl.liveQueries()).toHaveLength(0)

    gl.setNs(2_000_000)
    const second = await doctor.measure(6)
    expect(second.gpuFrameTimeMs).toBeUndefined()
    expect(gl.liveQueries()).toHaveLength(0)
  })
})

describe('waitGpuMacrotask does not hang when rAF is stalled', () => {
  const originalRaf = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf
    if (originalCancel) globalThis.cancelAnimationFrame = originalCancel
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  it('resolves via timeout when requestAnimationFrame never fires', async () => {
    globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame
    const start = Date.now()
    const result = await waitGpuMacrotask(30)
    expect(Date.now() - start).toBeLessThan(400)
    expect(result.timedOut).toBe(true)
  })

  it('resolves immediately as hidden when the document is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    let rafScheduled = 0
    globalThis.requestAnimationFrame = (() => {
      rafScheduled += 1
      return 1
    }) as typeof requestAnimationFrame
    const result = await waitGpuMacrotask(500)
    expect(result.timedOut).toBe(true)
    expect(rafScheduled).toBe(0)
  })

  it('resolves without timeout when rAF fires first', async () => {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0)
      return 1
    }) as typeof requestAnimationFrame
    const result = await waitGpuMacrotask(200)
    expect(result.timedOut).toBe(false)
  })

  it('does not mark a visible live-clock GPU measure hidden when rAF is stalled', async () => {
    globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    const { gl, ext } = webgl2TimerGl({ delayFrames: 1, ns: 2_000_000 })
    const renderer = rendererFor(gl, { ext })
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 2,
    })
    const sample = await Promise.race([
      doctor.measure(2),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('measure hung on stalled rAF')), 800)
      }),
    ])
    expect(sample.invalidReason).not.toBe('hidden')
    expect(sample.invalid).not.toBe(true)
  })

  it('does not mark a visible slow 120ms rAF as invalid hidden', async () => {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = setTimeout(() => cb(0), 120)
      return id as unknown as number
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((id: number) => {
      clearTimeout(id)
    }) as typeof cancelAnimationFrame
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    const { gl, ext } = webgl2TimerGl({ delayFrames: 1, ns: 2_000_000 })
    const renderer = rendererFor(gl, { ext })
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 2,
    })
    const sample = await doctor.measure(2)
    expect(sample.invalidReason).not.toBe('hidden')
    expect(sample.invalid).not.toBe(true)
  })

  it('marks a live-clock GPU measure invalid/hidden only when the document is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    const { gl, ext } = webgl2TimerGl({ delayFrames: 1, ns: 2_000_000 })
    const renderer = rendererFor(gl, { ext })
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 2,
    })
    const sample = await Promise.race([
      doctor.measure(2),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('measure hung on hidden document')), 800)
      }),
    ])
    expect(sample.invalid).toBe(true)
    expect(sample.invalidReason).toBe('hidden')
  })

  it('does not hang when a host waitFrame is raw rAF and the document is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: {
        info: { render: { calls: 1, triangles: 1 }, memory: { geometries: 0, textures: 0 } },
        setPixelRatio() {},
        render() {},
      } as never,
      profile: 'game',
      measureFrames: 2,
      waitFrame: () => new Promise(requestAnimationFrame),
    })
    const sample = await Promise.race([
      doctor.measure(2),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('measure hung on user waitFrame')), 800)
      }),
    ])
    expect(sample.invalid).toBe(true)
    expect(sample.invalidReason).toBe('hidden')
  })

  it('marks waitFrame stalled after the stall cap when the host never settles while visible', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    const never = () => new Promise(() => {})
    const start = Date.now()
    const result = await guardWaitFrame(never, 20, 50)
    expect(Date.now() - start).toBeLessThan(400)
    expect(result.stalled).toBe(true)
  })

  it('does not mark a settling waitFrame as stalled', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    const result = await guardWaitFrame(async () => {}, 20, 200)
    expect(result.stalled).toBe(false)
  })

  it('marks measure invalid stalled when waitFrame never settles while visible', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: {
        info: { render: { calls: 1, triangles: 1 }, memory: { geometries: 0, textures: 0 } },
        setPixelRatio() {},
        render() {},
      } as never,
      profile: 'game',
      measureFrames: 2,
      waitFrame: () => new Promise(() => {}),
      waitFrameStallMs: 40,
    })
    const sample = await Promise.race([
      doctor.measure(2),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('measure hung on stalled waitFrame')), 800)
      }),
    ])
    expect(sample.invalid).toBe(true)
    expect(sample.invalidReason).toBe('stalled')
  })
})
