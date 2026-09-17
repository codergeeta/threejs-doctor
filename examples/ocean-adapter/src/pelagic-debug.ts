export interface PelagicCascadeLike {
  size: number
  dispose?: () => void
  resize?: (n: number) => void
}

export interface PelagicRtLike {
  width: number
  height: number
  setSize(width: number, height: number): void
}

export interface PelagicDebugHandle {
  renderer?: { setPixelRatio?: (n: number) => void; pixelRatio?: number }
  scene?: unknown
  cascades?: Array<PelagicCascadeLike | null | undefined>
  reflectionTarget?: PelagicRtLike
  refractionTarget?: PelagicRtLike
  causticWide?: PelagicRtLike
  causticDetail?: PelagicRtLike | null
  waterMesh?: { geometry?: unknown }
  terrainMesh?: { geometry?: unknown }
  effectQuality?: number
  runPass?: (...args: unknown[]) => void
  updateSpectrum?: () => void
  dprLoop?: { enabled: boolean }
}
