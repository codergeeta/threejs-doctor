export type QualityTier = 'potato' | 'low' | 'mid' | 'high'
export type QualityMode = 'advise' | 'safe-auto' | 'takeover'
export type LadderPhase = 'boot' | 'runtime'

export type AdapterCapability =
  | 'fftSize'
  | 'rtScale'
  | 'meshLod'
  | 'deferredHdr'
  | 'simPassCount'

export interface QualityKnobSet {
  fftSize?: number[]
  spectrumEveryNFrames?: number
  rtScale?: number
  meshLod?: 0 | 1 | 2
  deferredHdr?: boolean
  effectQuality?: number
}

export interface AdapterExtras {
  simPassCount?: number
  bytesLoaded?: number
  compileMs?: number
}

export interface KnobHandle {
  rollback(): void
}

export interface QualityAdapter {
  readonly id: string
  capabilities(): AdapterCapability[]
  snapshot(): QualityKnobSet
  apply(tier: QualityTier, knobs: QualityKnobSet): KnobHandle
  readExtras?(): AdapterExtras
  takeExclusiveControl?(): { release(): void }
}
