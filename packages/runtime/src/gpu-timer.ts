import type { DoctorRendererLike } from './passes/types.js'

/**
 * Optional GPU elapsed-time sampler. Returns numbers only when
 * EXT_disjoint_timer_query_webgl2 exists AND a query result is available.
 * Never invents GPU times — callers use CPU now() around the host render path.
 */
export function createGpuFrameSampler(renderer: DoctorRendererLike): {
  begin(): void
  end(): number | undefined
} | undefined {
  const gl = renderer.getContext?.() as
    | { getExtension?: (name: string) => unknown }
    | null
    | undefined
  const extName = 'EXT_disjoint_timer_query_webgl2'
  let ext: unknown
  try {
    ext = renderer.getExtension?.(extName) ?? gl?.getExtension?.(extName)
  } catch {
    ext = undefined
  }
  if (!ext || typeof ext !== 'object') return undefined
  const api = ext as {
    createQuery?: () => unknown
    beginQuery?: (target: number, query: unknown) => void
    endQuery?: (target: number) => void
    getQueryParameter?: (query: unknown, pname: number) => unknown
    TIME_ELAPSED_EXT?: number
    QUERY_RESULT_AVAILABLE?: number
    QUERY_RESULT?: number
  }
  if (typeof api.createQuery !== 'function' || typeof api.beginQuery !== 'function') return undefined
  const target = api.TIME_ELAPSED_EXT
  if (typeof target !== 'number') return undefined
  let query: unknown
  return {
    begin() {
      try {
        query = api.createQuery?.()
        if (query) api.beginQuery?.(target, query)
      } catch {
        query = undefined
      }
    },
    end() {
      try {
        api.endQuery?.(target)
        if (!query || typeof api.getQueryParameter !== 'function') return undefined
        const available = api.getQueryParameter(query, api.QUERY_RESULT_AVAILABLE ?? 0x8867)
        if (available !== true) return undefined
        const ns = api.getQueryParameter(query, api.QUERY_RESULT ?? 0x8866)
        if (typeof ns !== 'number' || !Number.isFinite(ns)) return undefined
        return ns / 1e6
      } catch {
        return undefined
      }
    },
  }
}
