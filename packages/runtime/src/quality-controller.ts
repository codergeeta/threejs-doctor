import {
  ADAPTER_KNOBS,
  SAFE_PASSES,
  resolveStartTier,
  type AdapterCapability,
  type AdapterExtras,
  type MetricsSample,
  type Mode,
  type PassId,
  type Profile,
  type QualityAdapter,
  type QualityKnobSet,
  type QualityMode,
  type QualityTier,
  type LadderPhase,
} from '@threejs-doctor/core'
import type { Finding } from '@threejs-doctor/rules'
import type { Doctor } from './doctor.js'

export interface QualityControllerOptions {
  mode?: QualityMode
  startTier?: QualityTier | 'auto'
  maxTier?: QualityTier | 'auto'
  ttfiBudgetMs?: number
  targetFps?: number
  windowFrames?: number
  now?: () => number
  waitForFirstInteractive?: () => Promise<void>
}

export interface AppliedKnob {
  capability: AdapterCapability
  value: unknown
}

export interface QualityLadderReport {
  profile: Exclude<Profile, 'auto'>
  mode: Mode
  qualityMode: QualityMode
  phase: LadderPhase
  tier: QualityTier
  startTier: QualityTier
  maxTier: QualityTier
  score: number
  findings: Finding[]
  baseline: MetricsSample
  appliedPasses: PassId[]
  appliedKnobs: AppliedKnob[]
  failedPasses: Array<{ id: PassId; error: string }>
  unsupportedKnobs: AdapterCapability[]
  floorFailed: boolean
  applyFailed: boolean
  incomplete: boolean
  after?: MetricsSample
  deltas?: Partial<Record<keyof MetricsSample, number>>
  ttfiMs?: number
  adapterUnavailable?: boolean
  recommendedTier?: QualityTier
}

function knobsFor(
  tier: QualityTier,
  capabilities: AdapterCapability[],
): { knobs: QualityKnobSet; applied: AppliedKnob[]; unsupported: AdapterCapability[] } {
  const table = ADAPTER_KNOBS[tier]
  const knobs: QualityKnobSet = {}
  const applied: AppliedKnob[] = []
  const advertised = new Set(capabilities)
  const maybeSet = <K extends keyof QualityKnobSet>(key: K, cap: AdapterCapability) => {
    if (!advertised.has(cap)) return
    const value = table[key]
    if (value === undefined) return
    knobs[key] = value as QualityKnobSet[K]
    applied.push({ capability: cap, value })
  }
  maybeSet('fftSize', 'fftSize')
  maybeSet('spectrumEveryNFrames', 'fftSize')
  maybeSet('rtScale', 'rtScale')
  maybeSet('meshLod', 'meshLod')
  maybeSet('deferredHdr', 'deferredHdr')
  return { knobs, applied, unsupported: [] }
}

function copyExtras(sample: MetricsSample, extras: AdapterExtras | undefined): MetricsSample {
  if (!extras) return sample
  const next: MetricsSample = { ...sample }
  if (typeof extras.simPassCount === 'number') next.simPassCount = extras.simPassCount
  if (typeof extras.bytesLoaded === 'number') next.bytesLoaded = extras.bytesLoaded
  if (typeof extras.compileMs === 'number') next.compileMs = extras.compileMs
  return next
}

export class QualityController {
  private mode: QualityMode
  private adapter: QualityAdapter | undefined
  private booted = false
  private knobHandles: Array<{ rollback(): void }> = []
  private exclusive: { release(): void } | undefined
  private last: QualityLadderReport | undefined

  constructor(
    private readonly doctor: Doctor,
    private readonly options: QualityControllerOptions = {},
  ) {
    this.mode = options.mode ?? 'safe-auto'
  }

  registerAdapter(adapter: QualityAdapter): void {
    this.adapter = adapter
  }

  setMode(mode: QualityMode): void {
    this.mode = mode
  }

  async boot(): Promise<QualityLadderReport> {
    const now = this.options.now ?? (() => performance.now())
    const bootStart = now()
    const device = this.doctor.getDevice()
    const resolved = resolveStartTier(device)
    const startTier =
      this.options.startTier && this.options.startTier !== 'auto'
        ? this.options.startTier
        : resolved.startTier
    const maxTier =
      this.options.maxTier && this.options.maxTier !== 'auto'
        ? this.options.maxTier
        : resolved.maxTier

    const findings: Finding[] = []
    if (resolved.noFloatRt) {
      findings.push({
        id: 'quality/no-float-rt',
        severity: 'warn',
        evidence: { colorBufferFloat: false },
        message: 'Floating-point color buffers unavailable; ladder locked to potato',
        suggestedFix: 'Use a WebGL context with EXT_color_buffer_float, or stay on potato generic caps',
      })
    }

    const appliedPasses: PassId[] = []
    const failedPasses: Array<{ id: PassId; error: string }> = []
    const appliedKnobs: AppliedKnob[] = []
    let unsupportedKnobs: AdapterCapability[] = []
    let applyFailed = false
    let adapterUnavailable = false

    if (this.mode !== 'advise') {
      if (this.mode === 'takeover') {
        try {
          this.exclusive = this.adapter?.takeExclusiveControl?.()
        } catch {
          this.exclusive = undefined
          applyFailed = true
        }
      }
      const result = this.doctor.applyPassesImmediate([...SAFE_PASSES], {
        qualityTier: startTier,
      })
      appliedPasses.push(...result.appliedPasses)
      failedPasses.push(...result.failedPasses)
      if (failedPasses.length > 0) applyFailed = true

      if (this.adapter) {
        let caps: AdapterCapability[]
        try {
          caps = this.adapter.capabilities()
        } catch {
          caps = []
          adapterUnavailable = true
        }
        if (caps.length === 0) {
          adapterUnavailable = true
        } else {
          const filtered = knobsFor(startTier, caps)
          unsupportedKnobs = filtered.unsupported
          let handle: { rollback(): void } | undefined
          try {
            handle = this.adapter.apply(startTier, filtered.knobs)
            this.knobHandles.push(handle)
            appliedKnobs.push(...filtered.applied)
          } catch {
            try {
              handle?.rollback()
            } catch {
              // best-effort
            }
            applyFailed = true
          }
        }
      }
    }

    let ttfiMs: number | undefined
    let incomplete = false
    try {
      await (this.options.waitForFirstInteractive ?? (async () => {}))()
      ttfiMs = now() - bootStart
    } catch {
      incomplete = true
    }

    const diagnosed = await this.doctor.diagnose()
    let extras: AdapterExtras | undefined
    try {
      extras = this.adapter?.readExtras?.()
    } catch {
      extras = undefined
    }
    let baseline = copyExtras(diagnosed.baseline, extras)
    const bytesLoaded = this.maybeBytesLoaded(bootStart)
    if (typeof bytesLoaded === 'number' && typeof extras?.bytesLoaded !== 'number') {
      baseline = { ...baseline, bytesLoaded }
    }
    if (typeof extras?.simPassCount === 'number') {
      findings.push({
        id: 'quality/heavy-sim-passes',
        severity: 'info',
        evidence: { simPassCount: extras.simPassCount },
        message: `Adapter reported ${extras.simPassCount} simulation passes`,
        suggestedFix: 'Lower fftSize or skip spectrum frames on this tier',
      })
    }

    const report: QualityLadderReport = {
      profile: diagnosed.profile,
      mode: diagnosed.mode,
      qualityMode: this.mode,
      phase: 'runtime',
      tier: startTier,
      startTier,
      maxTier,
      score: diagnosed.score,
      findings: [...diagnosed.findings, ...findings],
      baseline,
      appliedPasses,
      appliedKnobs,
      failedPasses,
      unsupportedKnobs,
      floorFailed: false,
      applyFailed,
      incomplete,
    }
    if (ttfiMs !== undefined) report.ttfiMs = ttfiMs
    if (adapterUnavailable) report.adapterUnavailable = true
    if (this.mode === 'advise') report.recommendedTier = startTier
    this.booted = true
    this.last = report
    return report
  }

  async runLadder(): Promise<QualityLadderReport> {
    throw new Error('runLadder not implemented')
  }

  dispose(): void {
    for (let i = this.knobHandles.length - 1; i >= 0; i--) {
      try {
        this.knobHandles[i]!.rollback()
      } catch {
        // best-effort
      }
    }
    this.knobHandles = []
    this.doctor.rollbackAll()
    try {
      this.exclusive?.release()
    } catch {
      // best-effort
    }
    this.exclusive = undefined
  }

  private maybeBytesLoaded(bootStart: number): number | undefined {
    const perf = (
      globalThis as {
        performance?: {
          getEntriesByType?: (t: string) => Array<{ transferSize?: number; startTime: number }>
        }
      }
    ).performance
    const entries = perf?.getEntriesByType?.('resource')
    if (!entries) return undefined
    let sum = 0
    let any = false
    for (const e of entries) {
      if (e.startTime < bootStart) continue
      if (typeof e.transferSize === 'number' && e.transferSize > 0) {
        sum += e.transferSize
        any = true
      }
    }
    if (!any) return undefined
    return sum
  }
}
