/**
 * Optional GPU elapsed-time sampler.
 *
 * On WebGL2, EXT_disjoint_timer_query_webgl2 exposes constants + queryCounterEXT
 * on the extension object. createQuery / beginQuery / endQuery / getQueryParameter
 * / deleteQuery live on WebGL2RenderingContext. Never invent GPU times: return a
 * number only after QUERY_RESULT_AVAILABLE on a later frame, and discard the
 * sample when GPU_DISJOINT_EXT is set.
 *
 * Pending queries are tagged with a measure id. `beginMeasure` / `endMeasure`
 * delete leftovers so one measure() cannot report the previous measure's times.
 * Each harvest collects every available result, not only the oldest.
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

interface PendingQuery {
  query: unknown
  measureId: number
}

export interface GpuFrameSampler {
  begin(): void
  /** End the active query (if any) and collect every available result for this measure. */
  end(): number[]
  /** Collect every available result without ending a new query. */
  harvest(): number[]
  /** Drop pending/active queries from a previous measure. */
  beginMeasure(): void
  /** Drop leftovers so they cannot enter the next measure. */
  endMeasure(): void
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

export interface GpuMacrotaskWait {
  /** True when rAF did not fire in time, or the document is already hidden. */
  timedOut: boolean
}

const DEFAULT_GPU_MACROTASK_TIMEOUT_MS = 100

export function documentIsHidden(): boolean {
  try {
    if (typeof document === 'undefined') return false
    return document.visibilityState === 'hidden' || document.hidden === true
  } catch {
    return false
  }
}

/**
 * Host `waitFrame` can be `() => new Promise(requestAnimationFrame)`, which hangs in
 * background tabs. Abort when the document is hidden; if rAF is merely slow while
 * visible, keep waiting so <10 FPS devices are not cut off.
 */
export async function guardWaitFrame(
  waitFrame: () => Promise<unknown>,
  timeoutMs = DEFAULT_GPU_MACROTASK_TIMEOUT_MS,
): Promise<void> {
  if (documentIsHidden()) return
  let frameSettled = false
  const frame = Promise.resolve()
    .then(() => waitFrame())
    .finally(() => {
      frameSettled = true
    })
  await Promise.race([frame, waitGpuMacrotask(timeoutMs)])
  if (frameSettled || documentIsHidden()) return
  await Promise.race([
    frame,
    new Promise<void>((resolve) => {
      if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return
      const onVis = () => {
        if (documentIsHidden()) {
          document.removeEventListener('visibilitychange', onVis)
          resolve()
        }
      }
      document.addEventListener('visibilitychange', onVis)
    }),
  ])
}

/**
 * Yield a macrotask so QUERY_RESULT_AVAILABLE can flip.
 * rAF is raced against a short timeout because browsers pause rAF in background tabs.
 * A timeout is not "hidden" — callers must read `document.visibilityState`.
 */
export function waitGpuMacrotask(timeoutMs = DEFAULT_GPU_MACROTASK_TIMEOUT_MS): Promise<GpuMacrotaskWait> {
  return new Promise((resolve) => {
    let settled = false
    const done = (timedOut: boolean) => {
      if (settled) return
      settled = true
      resolve({ timedOut })
    }

    if (documentIsHidden()) {
      done(true)
      return
    }

    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(() => done(false), 0)
      return
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const rafId = requestAnimationFrame(() => {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      done(false)
    })
    timeoutId = setTimeout(() => {
      if (typeof cancelAnimationFrame === 'function') {
        try {
          cancelAnimationFrame(rafId)
        } catch {
          // best-effort
        }
      }
      done(true)
    }, timeoutMs)
  })
}

export function createGpuFrameSampler(renderer: DoctorRendererLike): GpuFrameSampler | undefined {
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
  const pending: PendingQuery[] = []
  let active: PendingQuery | undefined
  let measureId = 0

  const deleteQuery = (query: unknown) => {
    try {
      gl.deleteQuery?.(query)
    } catch {
      // best-effort
    }
  }

  const discardAll = () => {
    if (active !== undefined) {
      try {
        gl.endQuery!(target)
      } catch {
        // best-effort
      }
      deleteQuery(active.query)
      active = undefined
    }
    while (pending.length > 0) {
      deleteQuery(pending.shift()!.query)
    }
  }

  const harvest = (): number[] => {
    const times: number[] = []
    while (pending.length > 0) {
      const item = pending[0]!
      if (item.measureId !== measureId) {
        pending.shift()
        deleteQuery(item.query)
        continue
      }
      let available: unknown
      try {
        available = gl.getQueryParameter!(item.query, availablePname)
      } catch {
        pending.shift()
        deleteQuery(item.query)
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
        ns = gl.getQueryParameter!(item.query, resultPname)
      } catch {
        ns = undefined
      }
      deleteQuery(item.query)
      if (disjoint) {
        discardAll()
        return []
      }
      if (typeof ns === 'number' && Number.isFinite(ns)) times.push(ns / 1e6)
    }
    return times
  }

  const closeActive = () => {
    if (active === undefined) return
    try {
      gl.endQuery!(target)
      pending.push(active)
    } catch {
      deleteQuery(active.query)
    }
    active = undefined
  }

  return {
    begin() {
      try {
        closeActive()
        const query = gl.createQuery!()
        if (!query) return
        gl.beginQuery!(target, query)
        active = { query, measureId }
      } catch {
        active = undefined
      }
    },
    end() {
      try {
        closeActive()
        return harvest()
      } catch {
        return []
      }
    },
    harvest() {
      try {
        return harvest()
      } catch {
        return []
      }
    },
    beginMeasure() {
      measureId += 1
      discardAll()
    },
    endMeasure() {
      discardAll()
    },
  }
}
