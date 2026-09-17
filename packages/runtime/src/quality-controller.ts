import {
  ADAPTER_KNOBS,
  GENERIC_CAPS,
  HYSTERESIS,
  SAFE_PASSES,
  createHysteresisState,
  evaluateWindow,
  resolveStartTier,
  type AdapterCapability,
  type AdapterExtras,
  type HysteresisState,
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
import type { QualityHudState } from './overlay/format-quality-hud.js'

export interface QualityControllerOptions {
  mode?: QualityMode
  startTier?: QualityTier | 'auto'
  maxTier?: QualityTier | 'auto'
  ttfiBudgetMs?: number
  targetFps?: number
  windowFrames?: number
  now?: () => number
  waitForFirstInteractive?: () => Promise<void>
  onReport?: (report: QualityLadderReport) => void
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
  const unsupported: AdapterCapability[] = []
  const maybeSet = <K extends keyof QualityKnobSet>(key: K, cap: AdapterCapability) => {
    const value = table[key]
    if (value === undefined) return
    if (!advertised.has(cap)) {
      if (!unsupported.includes(cap)) unsupported.push(cap)
      return
    }
    knobs[key] = value as QualityKnobSet[K]
    applied.push({ capability: cap, value })
  }
  maybeSet('fftSize', 'fftSize')
  maybeSet('spectrumEveryNFrames', 'fftSize')
  maybeSet('rtScale', 'rtScale')
  maybeSet('meshLod', 'meshLod')
  maybeSet('deferredHdr', 'deferredHdr')
  return { knobs, applied, unsupported }
}

function copyExtras(sample: MetricsSample, extras: AdapterExtras | undefined): MetricsSample {
  if (!extras) return sample
  const next: MetricsSample = { ...sample }
  if (typeof extras.simPassCount === 'number') next.simPassCount = extras.simPassCount
  if (typeof extras.bytesLoaded === 'number') next.bytesLoaded = extras.bytesLoaded
  if (typeof extras.compileMs === 'number') next.compileMs = extras.compileMs
  return next
}

function isUsableSample(sample: MetricsSample | undefined): sample is MetricsSample {
  return !!sample && sample.p95FrameTimeMs > 0
}

function diffMetrics(
  baseline: MetricsSample,
  after: MetricsSample,
): Partial<Record<keyof MetricsSample, number>> {
  const deltas: Partial<Record<keyof MetricsSample, number>> = {}
  ;(Object.keys(baseline) as Array<keyof MetricsSample>).forEach((key) => {
    const before = baseline[key]
    const next = after[key]
    if (typeof before === 'number' && typeof next === 'number') {
      deltas[key] = next - before
    }
  })
  return deltas
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
    this.doctor.attachQualityHud(() => this.hudState())
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
    const waitInteractive = this.options.waitForFirstInteractive
    if (waitInteractive) {
      try {
        await waitInteractive()
        ttfiMs = now() - bootStart
      } catch {
        incomplete = true
      }
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
    this.publish(report)
    return report
  }

  async runLadder(): Promise<QualityLadderReport> {
    if (!this.booted) await this.boot()
    const windowFrames = this.options.windowFrames ?? HYSTERESIS.windowFrames
    let state = createHysteresisState({
      tier: this.last!.tier,
      maxTier: this.last!.maxTier,
      phase: 'runtime',
    })
    let baseline: MetricsSample | undefined
    let after: MetricsSample | undefined
    let incomplete = this.last!.incomplete
    let holdsAtTarget = 0
    // Consume applyFailed for hysteresis on the next window only (report flag stays).
    let pendingApplyFailed = this.last!.applyFailed
    const bootSample = this.mergeExtras(this.last!.baseline)
    if (isUsableSample(bootSample) && this.shouldSeedBootWindow(bootSample, pendingApplyFailed)) {
      baseline = bootSample
      const seeded = this.applyWindowDecision(state, bootSample, pendingApplyFailed, baseline, incomplete, {
        allowStop: false,
        holdsAtTarget,
      })
      state = seeded.state
      pendingApplyFailed = seeded.pendingApplyFailed
      holdsAtTarget = seeded.holdsAtTarget
    }
    // Max 12 windows safety valve (unit tests and production).
    const maxWindows = 12
    try {
      for (let w = 0; w < maxWindows; w++) {
        if (this.mode !== 'advise') this.clampCeiling(state.tier)
        let sample: MetricsSample
        try {
          sample = this.mergeExtras(await this.doctor.measure(windowFrames))
        } catch {
          const fallback = after ?? baseline ?? this.last?.baseline
          if (isUsableSample(fallback)) {
            if (!baseline) baseline = fallback
            const recovered = this.applyWindowDecision(
              state,
              fallback,
              pendingApplyFailed,
              baseline,
              true,
              { holdsAtTarget },
            )
            state = recovered.state
          }
          incomplete = true
          after = undefined
          break
        }
        if (!isUsableSample(sample)) {
          continue
        }
        if (!baseline) baseline = sample
        after = sample
        const stepped = this.applyWindowDecision(state, sample, pendingApplyFailed, baseline, incomplete, {
          holdsAtTarget,
        })
        state = stepped.state
        pendingApplyFailed = stepped.pendingApplyFailed
        holdsAtTarget = stepped.holdsAtTarget
        if (stepped.stop) break
      }
    } catch {
      incomplete = true
      after = undefined
    }
    const report = this.finalize(state, baseline ?? this.last!.baseline, after, incomplete)
    this.publish(report)
    return report
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

  private publish(report: QualityLadderReport): void {
    this.last = report
    this.doctor.refreshOverlay()
    this.options.onReport?.(report)
  }

  private shouldSeedBootWindow(sample: MetricsSample, applyFailed: boolean): boolean {
    if (sample.p95FrameTimeMs >= HYSTERESIS.emergencyP95Ms) return true
    return applyFailed && sample.p95FrameTimeMs > HYSTERESIS.dropP95Ms
  }

  private applyWindowDecision(
    state: HysteresisState,
    sample: MetricsSample,
    pendingApplyFailed: boolean,
    baseline: MetricsSample,
    incomplete: boolean,
    opts: { allowStop?: boolean; holdsAtTarget?: number } = {},
  ): {
    state: HysteresisState
    pendingApplyFailed: boolean
    holdsAtTarget: number
    stop: boolean
  } {
    const allowStop = opts.allowStop !== false
    let holdsAtTarget = opts.holdsAtTarget ?? 0
    const decision = evaluateWindow(state, sample.p95FrameTimeMs, {
      applyFailed: pendingApplyFailed,
    })
    const last = this.last!
    if (this.mode === 'advise') {
      const nextState = { ...decision.next, tier: state.tier }
      const advised: QualityLadderReport = {
        ...last,
        recommendedTier: decision.next.tier,
        baseline,
        incomplete,
      }
      if (!incomplete) {
        advised.after = sample
        advised.deltas = diffMetrics(baseline, sample)
      }
      this.publish(advised)
      holdsAtTarget = sample.p95FrameTimeMs <= HYSTERESIS.dropP95Ms ? holdsAtTarget + 1 : 0
      const stop = allowStop && (holdsAtTarget >= 3 || decision.reason === 'floor')
      return { state: nextState, pendingApplyFailed: false, holdsAtTarget, stop }
    }
    if (decision.action === 'drop' || decision.action === 'climb') {
      const rungFailed = this.applyRung(decision.next.tier)
      if (this.last) {
        const published: QualityLadderReport = { ...this.last, baseline, incomplete }
        if (!incomplete) {
          published.after = sample
          published.deltas = diffMetrics(baseline, sample)
        }
        this.publish(published)
      }
      return {
        state: decision.next,
        pendingApplyFailed: rungFailed,
        holdsAtTarget: 0,
        stop: false,
      }
    }
    const nextLast: QualityLadderReport = {
      ...last,
      tier: decision.next.tier,
      baseline,
      incomplete,
    }
    if (decision.reason === 'floor') {
      nextLast.floorFailed = true
      nextLast.tier = 'potato'
    }
    if (!incomplete) {
      nextLast.after = sample
      nextLast.deltas = diffMetrics(baseline, sample)
    }
    this.publish(nextLast)
    if (decision.reason === 'floor') {
      return {
        state: decision.next,
        pendingApplyFailed: false,
        holdsAtTarget: 0,
        stop: allowStop,
      }
    }
    const atTarget = sample.p95FrameTimeMs <= HYSTERESIS.dropP95Ms
    const waitingToClimb =
      sample.p95FrameTimeMs <= HYSTERESIS.climbP95Ms && decision.reason !== 'ceiling'
    holdsAtTarget = atTarget && !waitingToClimb ? holdsAtTarget + 1 : 0
    return {
      state: decision.next,
      pendingApplyFailed: false,
      holdsAtTarget,
      stop: allowStop && holdsAtTarget >= 3,
    }
  }

  private hudState(): QualityHudState | undefined {
    if (!this.last) return undefined
    const sample = this.last.after ?? this.last.baseline
    const state: QualityHudState = {
      score: this.last.score,
      profile: this.last.profile,
      qualityMode: this.last.qualityMode,
      startTier: this.last.startTier,
      tier: this.last.tier,
    }
    if (this.last.ttfiMs !== undefined) state.ttfiMs = this.last.ttfiMs
    if (typeof sample.avgFps === 'number') state.avgFps = sample.avgFps
    if (typeof sample.p95FrameTimeMs === 'number') state.p95FrameTimeMs = sample.p95FrameTimeMs
    if (typeof sample.simPassCount === 'number') state.simPassCount = sample.simPassCount
    if (typeof sample.bytesLoaded === 'number') state.bytesLoaded = sample.bytesLoaded
    if (this.exclusive) state.exclusive = true
    return state
  }

  private mergeExtras(sample: MetricsSample): MetricsSample {
    let extras: AdapterExtras | undefined
    try {
      extras = this.adapter?.readExtras?.()
    } catch {
      extras = undefined
    }
    return copyExtras(sample, extras)
  }

  private clampCeiling(tier: QualityTier): void {
    this.doctor.reclampPixelRatioCeiling(GENERIC_CAPS[tier].pixelRatio)
  }

  private applyRung(tier: QualityTier): boolean {
    for (let i = this.knobHandles.length - 1; i >= 0; i--) {
      try {
        this.knobHandles[i]!.rollback()
      } catch {
        // best-effort
      }
    }
    this.knobHandles = []
    this.doctor.rollbackAll()

    const appliedPasses: PassId[] = []
    const failedPasses: Array<{ id: PassId; error: string }> = []
    const appliedKnobs: AppliedKnob[] = []
    let unsupportedKnobs: AdapterCapability[] = []
    let thisRungFailed = false
    let applyFailed = this.last?.applyFailed ?? false
    let adapterUnavailable = this.last?.adapterUnavailable ?? false

    const result = this.doctor.applyPassesImmediate([...SAFE_PASSES], { qualityTier: tier })
    appliedPasses.push(...result.appliedPasses)
    failedPasses.push(...result.failedPasses)
    if (failedPasses.length > 0) {
      applyFailed = true
      thisRungFailed = true
    }

    if (this.adapter && this.mode !== 'advise') {
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
        const filtered = knobsFor(tier, caps)
        unsupportedKnobs = filtered.unsupported
        let handle: { rollback(): void } | undefined
        try {
          handle = this.adapter.apply(tier, filtered.knobs)
          this.knobHandles.push(handle)
          appliedKnobs.push(...filtered.applied)
        } catch {
          try {
            handle?.rollback()
          } catch {
            // best-effort
          }
          applyFailed = true
          thisRungFailed = true
        }
      }
    }

    if (this.last) {
      const next: QualityLadderReport = {
        ...this.last,
        tier,
        appliedPasses,
        appliedKnobs,
        failedPasses,
        unsupportedKnobs,
        applyFailed,
      }
      if (adapterUnavailable) next.adapterUnavailable = true
      this.last = next
    }
    return thisRungFailed
  }

  private finalize(
    state: HysteresisState,
    baseline: MetricsSample,
    after: MetricsSample | undefined,
    incomplete: boolean,
  ): QualityLadderReport {
    const last = this.last!
    const report: QualityLadderReport = {
      profile: last.profile,
      mode: last.mode,
      qualityMode: this.mode,
      phase: 'runtime',
      tier: last.floorFailed ? 'potato' : state.tier,
      startTier: last.startTier,
      maxTier: last.maxTier,
      score: last.score,
      findings: last.findings,
      baseline,
      appliedPasses: last.appliedPasses,
      appliedKnobs: last.appliedKnobs,
      failedPasses: last.failedPasses,
      unsupportedKnobs: last.unsupportedKnobs,
      floorFailed: last.floorFailed,
      applyFailed: last.applyFailed,
      incomplete,
    }
    if (last.ttfiMs !== undefined) report.ttfiMs = last.ttfiMs
    if (last.adapterUnavailable) report.adapterUnavailable = true
    if (last.recommendedTier !== undefined) report.recommendedTier = last.recommendedTier
    if (!incomplete && after !== undefined) {
      report.after = after
      report.deltas = diffMetrics(baseline, after)
    }
    return report
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
