/**
 * Optional GPU elapsed-time sampler.
 *
 * On WebGL2, EXT_disjoint_timer_query_webgl2 exposes constants + queryCounterEXT
 * on the extension object. createQuery / beginQuery / endQuery / getQueryParameter
 * / deleteQuery live on WebGL2RenderingContext. Never invent GPU times: return a
 * number only after QUERY_RESULT_AVAILABLE on a later frame, and discard the
 * sample when GPU_DISJOINT_EXT is set.
 */
import type { DoctorRendererLike } from './passes/types.js'

const EXT_NAME = 'EXT_disjoint_timer_query_webgl2'
const QUERY_RESULT = 0x8866
const QUERY_RESULT_AVAILABLE = 0x8867

interface Webgl2TimerContext {
  createQuery?: () => unknown
  deleteQuery?: (query: unknown) => void
  beginQuery?: (target: number, query: unknown) => void
  endQuery?: (target: number) => void
  getQueryParameter?: (query: unknown, pname: number) => unknown
  getParameter?: (pname: number) => unknown
  getExtension?: (name: string) => unknown
  QUERY_RESULT?: number
  QUERY_RESULT_AVAILABLE?: number
}

interface DisjointTimerExt {
  TIME_ELAPSED_EXT?: number
  GPU_DISJOINT_EXT?: number
}

function readDisjointExt(renderer: DoctorRendererLike, gl: Webgl2TimerContext | null | undefined): unknown {
  const extensions = (renderer as { extensions?: { get?: (name: string) => unknown } }).extensions
  if (typeof extensions?.get === 'function') {
    try {
      const viaExtensions = extensions.get(EXT_NAME)
      if (viaExtensions) return viaExtensions
    } catch {
      // fall through
    }
  }
  try {
    const viaRenderer = renderer.getExtension?.(EXT_NAME)
    if (viaRenderer) return viaRenderer
  } catch {
    // fall through
  }
  try {
    const viaGl = gl?.getExtension?.(EXT_NAME)
    if (viaGl) return viaGl
  } catch {
    // fall through
  }
  return undefined
}

export function createGpuFrameSampler(renderer: DoctorRendererLike): {
  begin(): void
  end(): number | undefined
} | undefined {
  const gl = renderer.getContext?.() as Webgl2TimerContext | null | undefined
  if (!gl) return undefined
  if (
    typeof gl.createQuery !== 'function' ||
    typeof gl.beginQuery !== 'function' ||
    typeof gl.endQuery !== 'function' ||
    typeof gl.getQueryParameter !== 'function'
  ) {
    return undefined
  }

  const extRaw = readDisjointExt(renderer, gl)
  if (!extRaw || typeof extRaw !== 'object') return undefined
  const ext = extRaw as DisjointTimerExt
  const target = ext.TIME_ELAPSED_EXT
  if (typeof target !== 'number') return undefined

  const availablePname =
    typeof gl.QUERY_RESULT_AVAILABLE === 'number' ? gl.QUERY_RESULT_AVAILABLE : QUERY_RESULT_AVAILABLE
  const resultPname = typeof gl.QUERY_RESULT === 'number' ? gl.QUERY_RESULT : QUERY_RESULT
  const pending: unknown[] = []
  let active: unknown

  const deleteQuery = (query: unknown) => {
    try {
      gl.deleteQuery?.(query)
    } catch {
      // best-effort
    }
  }

  const harvest = (): number | undefined => {
    while (pending.length > 0) {
      const query = pending[0]
      let available: unknown
      try {
        available = gl.getQueryParameter!(query, availablePname)
      } catch {
        pending.shift()
        deleteQuery(query)
        continue
      }
      if (available !== true && available !== 1) break
      pending.shift()
      let disjoint = false
      if (typeof ext.GPU_DISJOINT_EXT === 'number' && typeof gl.getParameter === 'function') {
        try {
          const flag = gl.getParameter(ext.GPU_DISJOINT_EXT)
          disjoint = flag === true || flag === 1
        } catch {
          disjoint = false
        }
      }
      let ns: unknown
      try {
        ns = gl.getQueryParameter!(query, resultPname)
      } catch {
        ns = undefined
      }
      deleteQuery(query)
      if (disjoint) {
        while (pending.length > 0) {
          deleteQuery(pending.shift())
        }
        return undefined
      }
      if (typeof ns === 'number' && Number.isFinite(ns)) return ns / 1e6
    }
    return undefined
  }

  return {
    begin() {
      try {
        if (active !== undefined) {
          gl.endQuery!(target)
          pending.push(active)
          active = undefined
        }
        const query = gl.createQuery!()
        if (!query) return
        gl.beginQuery!(target, query)
        active = query
      } catch {
        active = undefined
      }
    },
    end() {
      try {
        if (active !== undefined) {
          gl.endQuery!(target)
          pending.push(active)
          active = undefined
        }
        return harvest()
      } catch {
        return undefined
      }
    },
  }
}
