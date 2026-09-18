import { describe, it, expect } from 'vitest'
import { createGpuFrameSampler } from '../gpu-timer.js'
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

/** Real WebGL2 shape: methods on the context, constants (+ queryCounterEXT) on the EXT. */
function webgl2TimerGl(opts?: { delayFrames?: number; disjoint?: boolean; ns?: number }) {
  const delay = opts?.delayFrames ?? 1
  const ns = opts?.ns ?? 2_000_000
  const queries: Array<{ ended: boolean; createdAt: number; availableAfter: number }> = []
  let frame = 0
  const deleted: unknown[] = []

  const gl = {
    QUERY_RESULT_AVAILABLE,
    QUERY_RESULT,
    createQuery() {
      const q = { id: queries.length, ended: false, createdAt: frame, availableAfter: frame + delay }
      queries.push(q)
      return q
    },
    beginQuery(_target: number, _query: unknown) {},
    endQuery(_target: number) {
      const q = queries[queries.length - 1]
      if (q) q.ended = true
    },
    getQueryParameter(query: { ended?: boolean; availableAfter?: number }, pname: number) {
      if (pname === QUERY_RESULT_AVAILABLE) {
        if (!query?.ended) return false
        return frame > (query.availableAfter ?? 0)
      }
      if (pname === QUERY_RESULT) return ns
      return 0
    },
    getParameter(pname: number) {
      if (pname === GPU_DISJOINT_EXT) return opts?.disjoint === true
      return 0
    },
    deleteQuery(query: unknown) {
      deleted.push(query)
    },
    getExtension(name: string) {
      return name === 'EXT_disjoint_timer_query_webgl2' ? ext : null
    },
    tick() {
      frame += 1
    },
    deleted,
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

  it('omits gpuFrameTimeMs until a later frame reports QUERY_RESULT_AVAILABLE', async () => {
    const { gl, ext } = webgl2TimerGl({ delayFrames: 1, ns: 4_000_000 })
    const renderer = rendererFor(gl, { ext })
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 1,
      now: clock(),
    })
    const first = await doctor.measure(1)
    expect(Object.prototype.hasOwnProperty.call(first, 'gpuFrameTimeMs')).toBe(false)

    const second = await doctor.measure(2)
    expect(second.gpuFrameTimeMs).toBe(4)
    expect(gl.deleted.length).toBeGreaterThan(0)
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
})
