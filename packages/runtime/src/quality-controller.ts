import {
  SAFE_PASSES,
  resolveStartTier,
  type AdapterCapability,
  type MetricsSample,
  type Mode,
  type PassId,
  type Profile,
  type QualityAdapter,
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

    if (this.mode !== 'advise') {
      if (this.mode === 'takeover') {
        this.exclusive = this.adapter?.takeExclusiveControl?.()
      }
      const result = this.doctor.applyPassesImmediate([...SAFE_PASSES], {
        qualityTier: startTier,
      })
      appliedPasses.push(...result.appliedPasses)
      failedPasses.push(...result.failedPasses)
      // adapter.apply is Task 4; do not invent knobs here
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
      baseline: diagnosed.baseline,
      appliedPasses,
      appliedKnobs,
      failedPasses,
      unsupportedKnobs: [],
      floorFailed: false,
      applyFailed: failedPasses.length > 0,
      incomplete,
    }
    if (ttfiMs !== undefined) report.ttfiMs = ttfiMs
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
}
