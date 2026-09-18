import type {
  AdapterCapability,
  KnobHandle,
  QualityAdapter,
  QualityKnobSet,
  QualityTier,
} from '@threejs-doctor/core'
import type { PelagicCascadeLike, PelagicDebugHandle, PelagicRtLike } from './pelagic-debug.js'

const ADAPTER_ID = 'ocean-pelagic' as const

const FULL_CAPABILITIES: AdapterCapability[] = [
  'fftSize',
  'rtScale',
  'meshLod',
  'deferredHdr',
  'simPassCount',
]

/** Desktop reference sizes used only inside the adapter, never as report metrics. */
const DESKTOP_RT = {
  reflection: 768,
  refraction: 768,
  causticWide: 1024,
  causticDetail: 1536,
} as const

const MESH_LOD = {
  0: { water: [192, 128] as const, terrain: 192, detailCaustics: false },
  1: { water: [288, 256] as const, terrain: 320, detailCaustics: true },
  2: { water: [448, 256] as const, terrain: 432, detailCaustics: true },
} as const

interface DebugBag extends PelagicDebugHandle {
  hdrDeferred?: boolean
  waterSegments?: readonly [number, number]
  terrainSegments?: number
}

export function getPelagicDebug(root: unknown = globalThis): PelagicDebugHandle | undefined {
  return (root as { pelagic?: { debug?: PelagicDebugHandle } }).pelagic?.debug
}

export function createOceanAdapter(debug?: PelagicDebugHandle | null): QualityAdapter {
  const handle = debug ?? undefined
  let simPassCount: number | undefined

  if (handle?.runPass) {
    const original = handle.runPass
    handle.runPass = (...args: unknown[]) => {
      simPassCount = (simPassCount ?? 0) + 1
      return original.apply(handle, args)
    }
  }

  const available = handle != null && hasOceanSurface(handle)

  return {
    id: ADAPTER_ID,
    capabilities(): AdapterCapability[] {
      return available ? [...FULL_CAPABILITIES] : []
    },
    snapshot(): QualityKnobSet {
      return snapshotKnobs(handle)
    },
    apply(_tier: QualityTier, knobs: QualityKnobSet): KnobHandle {
      if (!handle) return { rollback() {} }
      return applyKnobs(handle, knobs)
    },
    readExtras() {
      if (simPassCount === undefined) return {}
      return { simPassCount }
    },
    takeExclusiveControl() {
      if (!handle) return { release() {} }
      return takeExclusive(handle)
    },
  }
}

function hasOceanSurface(debug: PelagicDebugHandle): boolean {
  if (debug.cascades?.some((cascade) => cascade != null)) return true
  return Boolean(
    debug.reflectionTarget || debug.refractionTarget || debug.causticWide || debug.causticDetail,
  )
}

function snapshotKnobs(debug: PelagicDebugHandle | undefined): QualityKnobSet {
  if (!debug || !hasOceanSurface(debug)) return {}
  const knobs: QualityKnobSet = {}
  if (debug.cascades) {
    knobs.fftSize = debug.cascades.map((cascade) => cascade?.size ?? 0)
  }
  if (debug.reflectionTarget) {
    knobs.rtScale = debug.reflectionTarget.width / DESKTOP_RT.reflection
  }
  const bag = debug as DebugBag
  if (bag.waterSegments) {
    const match = ([0, 1, 2] as const).find(
      (lod) =>
        MESH_LOD[lod].water[0] === bag.waterSegments![0] &&
        MESH_LOD[lod].water[1] === bag.waterSegments![1],
    )
    if (match !== undefined) knobs.meshLod = match
  }
  if (bag.hdrDeferred === true) knobs.deferredHdr = true
  else if (bag.hdrDeferred === false) knobs.deferredHdr = false
  return knobs
}

function applyKnobs(debug: PelagicDebugHandle, knobs: QualityKnobSet): KnobHandle {
  const rollbacks: Array<() => void> = []
  try {
    if (knobs.fftSize) rollbacks.push(applyFft(debug, knobs.fftSize))
    if (knobs.rtScale !== undefined) rollbacks.push(applyRtScale(debug, knobs.rtScale))
    if (knobs.meshLod !== undefined) rollbacks.push(applyMeshLod(debug, knobs.meshLod))
    if (knobs.deferredHdr !== undefined) rollbacks.push(applyHdr(debug, knobs.deferredHdr))
    if (knobs.spectrumEveryNFrames !== undefined) {
      rollbacks.push(applySpectrumCadence(debug, knobs.spectrumEveryNFrames))
    }
  } catch (err) {
    for (let i = rollbacks.length - 1; i >= 0; i--) {
      try {
        rollbacks[i]!()
      } catch {
        // best-effort
      }
    }
    throw err
  }
  return {
    rollback() {
      for (let i = rollbacks.length - 1; i >= 0; i--) rollbacks[i]!()
    },
  }
}

function applySpectrumCadence(debug: PelagicDebugHandle, everyN: number): () => void {
  if (everyN === 1) return () => {}
  const origUpdate = debug.updateSpectrum
  const origRunPass = debug.runPass
  const pause = !Number.isFinite(everyN) || everyN <= 0
  let frames = 0
  let skipping = false
  const due = () => {
    if (pause) return false
    const run = frames % everyN === 0
    frames += 1
    return run
  }
  if (origUpdate) {
    debug.updateSpectrum = () => {
      if (!due()) {
        skipping = true
        return
      }
      skipping = false
      return origUpdate.call(debug)
    }
  }
  if (origRunPass) {
    debug.runPass = (...args: unknown[]) => {
      if (origUpdate) {
        if (skipping || pause) return
        return origRunPass.apply(debug, args)
      }
      if (!due()) return
      return origRunPass.apply(debug, args)
    }
  }
  return () => {
    if (origUpdate) debug.updateSpectrum = origUpdate
    else delete debug.updateSpectrum
    if (origRunPass) debug.runPass = origRunPass
    else delete debug.runPass
  }
}

function isCascadeTouchSafe(
  cascade: PelagicCascadeLike | null | undefined,
): cascade is PelagicCascadeLike {
  if (cascade == null) return false
  const bag = cascade as PelagicCascadeLike & {
    texture?: unknown
    framebuffer?: unknown
    pack?: unknown
  }
  if (bag.texture === null) return false
  if (Object.prototype.hasOwnProperty.call(bag, 'framebuffer') && bag.framebuffer === null) {
    return false
  }
  if (Object.prototype.hasOwnProperty.call(bag, 'pack') && bag.pack === null) return false
  return true
}

function isRtTouchSafe(target: PelagicRtLike): boolean {
  const bag = target as PelagicRtLike & { texture?: unknown; framebuffer?: unknown; pack?: unknown }
  if (bag.texture === null) return false
  if (Object.prototype.hasOwnProperty.call(bag, 'framebuffer') && bag.framebuffer === null) {
    return false
  }
  if (Object.prototype.hasOwnProperty.call(bag, 'pack') && bag.pack === null) return false
  return true
}

function applyFft(debug: PelagicDebugHandle, fftSize: number[]): () => void {
  const cascades = debug.cascades
  if (!cascades) return () => {}
  const snaps = fftSize.map((_, i) => {
    const cascade = cascades[i]
    return {
      cascade,
      size: cascade?.size,
      update: cascade?.update,
      hadUpdate: cascade != null && Object.prototype.hasOwnProperty.call(cascade, 'update'),
    }
  })

  const restore = () => {
    snaps.forEach((snap, i) => {
      const cascade = snap.cascade
      if (!cascade || cascades[i] !== cascade) {
        if (i < cascades.length) cascades[i] = snap.cascade ?? null
      }
      if (!cascade) return
      if (snap.hadUpdate && snap.update) cascade.update = snap.update
      else delete cascade.update
      if (snap.size === undefined) return
      if (typeof cascade.resize === 'function') {
        try {
          cascade.resize(snap.size)
        } catch {
          cascade.size = snap.size
        }
      }
    })
  }

  try {
    fftSize.forEach((n, i) => {
      const cascade = cascades[i]
      if (!isCascadeTouchSafe(cascade)) return
      if (n === 0) {
        // Keep the host object. Replacing/disposing it nulls cascade.pack (a ShaderMaterial).
        if (typeof cascade.update === 'function') {
          cascade.update = () => {}
        }
        return
      }
      if (typeof cascade.resize === 'function') {
        cascade.resize(n)
      }
    })
  } catch (err) {
    restore()
    throw err
  }

  return restore
}

function applyRtScale(debug: PelagicDebugHandle, scale: number): () => void {
  const ops: Array<() => void> = []
  try {
    scaleRt(debug.reflectionTarget, 'reflectionTarget', DESKTOP_RT.reflection, scale, ops)
    scaleRt(debug.refractionTarget, 'refractionTarget', DESKTOP_RT.refraction, scale, ops)
    scaleRt(debug.causticWide, 'causticWide', DESKTOP_RT.causticWide, scale, ops)
    scaleRt(debug.causticDetail, 'causticDetail', DESKTOP_RT.causticDetail, scale, ops)
  } catch (err) {
    for (let i = ops.length - 1; i >= 0; i--) {
      try {
        ops[i]!()
      } catch {
        // best-effort
      }
    }
    throw err
  }
  return () => {
    for (let i = ops.length - 1; i >= 0; i--) ops[i]!()
  }
}

function scaleRt(
  target: PelagicRtLike | null | undefined,
  name: string,
  desktop: number,
  scale: number,
  ops: Array<() => void>,
): void {
  if (target == null) return
  if (typeof target.setSize !== 'function') {
    throw new Error(`setSize missing on ${name}`)
  }
  if (!isRtTouchSafe(target)) return
  const prevW = target.width
  const prevH = target.height
  const bag = target as PelagicRtLike & { framebuffer?: unknown }
  const hadFb = Object.prototype.hasOwnProperty.call(bag, 'framebuffer')
  const prevFb = bag.framebuffer
  const next = Math.round(desktop * scale)
  try {
    target.setSize(next, next)
  } catch {
    return
  }
  if (!isRtTouchSafe(target)) {
    try {
      target.setSize(prevW, prevH)
    } catch {
      // best-effort restore of the skipped RT only
    }
    if (hadFb) bag.framebuffer = prevFb
    return
  }
  ops.push(() => {
    target.setSize(prevW, prevH)
  })
}

function applyMeshLod(debug: PelagicDebugHandle, _lod: 0 | 1 | 2): () => void {
  const prevWaterGeom = debug.waterMesh?.geometry
  const prevTerrainGeom = debug.terrainMesh?.geometry
  // Pelagic debug has no BufferGeometry rebuild API. Spreading a Three.js
  // BufferGeometry yields a plain object and the renderer draws nothing.
  return () => {
    if (debug.waterMesh) {
      if (prevWaterGeom !== undefined) debug.waterMesh.geometry = prevWaterGeom
      else delete debug.waterMesh.geometry
    }
    if (debug.terrainMesh) {
      if (prevTerrainGeom !== undefined) debug.terrainMesh.geometry = prevTerrainGeom
      else delete debug.terrainMesh.geometry
    }
  }
}

function applyHdr(debug: PelagicDebugHandle, deferred: boolean): () => void {
  const bag = debug as DebugBag
  const had = Object.prototype.hasOwnProperty.call(bag, 'hdrDeferred')
  const prev = bag.hdrDeferred
  bag.hdrDeferred = deferred
  return () => {
    if (had && prev === true) bag.hdrDeferred = true
    else if (had && prev === false) bag.hdrDeferred = false
    else delete bag.hdrDeferred
  }
}

function takeExclusive(debug: PelagicDebugHandle): { release(): void } {
  const restoreQuality = freezeEffectQuality(debug)
  const loop = debug.dprLoop
  const prevEnabled = loop?.enabled
  if (loop) loop.enabled = false
  let released = false
  return {
    release() {
      if (released) return
      released = true
      restoreQuality()
      if (loop && prevEnabled !== undefined) loop.enabled = prevEnabled
    },
  }
}

function freezeEffectQuality(debug: PelagicDebugHandle): () => void {
  const frozen = debug.effectQuality
  const existing = Object.getOwnPropertyDescriptor(debug, 'effectQuality')
  Object.defineProperty(debug, 'effectQuality', {
    configurable: true,
    enumerable: existing?.enumerable ?? true,
    get() {
      return frozen
    },
    set() {
      /* freeze host writes during takeover */
    },
  })
  return () => {
    if (existing) {
      Object.defineProperty(debug, 'effectQuality', existing)
      return
    }
    Object.defineProperty(debug, 'effectQuality', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: frozen,
    })
  }
}
