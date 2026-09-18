import {
  MetricsCollector,
  AGGRESSIVE_PASSES,
  safePassesFor,
  probeDevice,
  readWebglQualitySignals,
  snapshotScene,
  classifyMeasureValidity,
  compareAbSamples,
  pixelChangedRatio,
  classifyVisualSafety,
  type MetricsSample,
  type Mode,
  type PassId,
  type Profile,
  type DeviceCapabilities,
  type SceneSnapshot,
  type SceneStatsLike,
  type QualityTier,
  type AbCompareResult,
} from '@threejs-doctor/core'
import {
  computeDoctorScore,
  resolveProfile,
  runRules,
  type Finding,
  type RuleContext,
} from '@threejs-doctor/rules'
import type {
  DoctorRendererLike,
  DoctorSceneLike,
  PassContext,
  PassHandle,
  OptimizePass,
} from './passes/types.js'
import { dprCapPass } from './passes/dpr-cap.js'
import { pixelBudgetPass } from './passes/pixel-budget.js'
import { shadowBudgetPass } from './passes/shadow-budget.js'
import { postfxBudgetPass } from './passes/postfx-budget.js'
import { toneMapLitePass } from './passes/tone-map-lite.js'
import { anisotropyCapPass } from './passes/anisotropy-cap.js'
import { frameloopDemandPass } from './passes/frameloop-demand.js'
import { distanceCullPass } from './passes/distance-cull.js'
import { materialDowngradePass } from './passes/material-downgrade.js'
import { mountOverlay as mountOverlayImpl, type OverlayHandle } from './overlay/mount-overlay.js'
import type { QualityHudState } from './overlay/format-quality-hud.js'
import { readRendererAntialias, readRendererPixelRatio } from './renderer-read.js'
import { collectHostSceneStats, applyHostInsights } from './scene-stats.js'
import { createGpuFrameSampler } from './gpu-timer.js'

export interface DoctorReport {
  profile: Exclude<Profile, 'auto'>
  mode: Mode
  score: number
  findings: Finding[]
  baseline: MetricsSample
  after?: MetricsSample
  deltas?: Partial<Record<keyof MetricsSample, number>>
  appliedPasses: PassId[]
  failedPasses: Array<{ id: PassId; error: string }>
  incomplete: boolean
  invalid?: boolean
  invalidReason?: string
  visualDelta?: boolean
}

export interface DoctorOptions {
  scene: DoctorSceneLike
  camera: unknown
  renderer: DoctorRendererLike
  profile?: Profile
  mode?: Mode
  measureFrames?: number
  now?: () => number
  device?: DeviceCapabilities
  getSceneStats?: () => SceneStatsLike
  postfxEnabled?: boolean
  setPostfxEnabled?: (enabled: boolean) => void
  frameloop?: 'always' | 'demand'
  setFrameloop?: (mode: 'always' | 'demand') => void
  /**
   * Awaited between beginFrame and endFrame so live attach can sample real rAF deltas.
   * When set, this is the host render path (do not also call renderer.render).
   */
  waitFrame?: () => Promise<void>
  /**
   * Host render for one frame (`composer.render()` or `renderer.render(scene, camera)`).
   * Used when `waitFrame` is omitted. If omitted, Doctor calls `renderer.render(scene, camera)` when present.
   */
  renderFrame?: () => void | Promise<void>
}

export interface CameraPose {
  x: number
  y: number
  z: number
}

export interface VisualGate {
  capture: () => ArrayLike<number> | Promise<ArrayLike<number>>
  maxChangedRatio?: number
  channelThreshold?: number
}

const PASS_REGISTRY: Record<PassId, OptimizePass> = {
  'dpr-cap': dprCapPass,
  'pixel-budget': pixelBudgetPass,
  'shadow-budget': shadowBudgetPass,
  'postfx-budget': postfxBudgetPass,
  'tone-map-lite': toneMapLitePass,
  'anisotropy-cap': anisotropyCapPass,
  'frameloop-demand': frameloopDemandPass,
  'distance-cull': distanceCullPass,
  'material-downgrade': materialDowngradePass,
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

function snapshotFrom(
  sample: MetricsSample,
  renderer: DoctorRendererLike,
  scene: DoctorSceneLike,
  continuousFrameloop: boolean,
  camera?: unknown,
): SceneSnapshot {
  let objectCount = 0
  let meshCount = 0
  let matrixAutoUpdateCount = 0
  const geometries: Array<{ uuid: string }> = []
  const materials: Array<{ uuid: string }> = []
  scene.traverse((obj) => {
    objectCount += 1
    if (obj.isMesh) meshCount += 1
    if (obj.matrixAutoUpdate) matrixAutoUpdateCount += 1
    if (obj.geometry?.uuid) geometries.push({ uuid: obj.geometry.uuid })
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
    for (const mat of mats) {
      if (mat.uuid) materials.push({ uuid: mat.uuid })
    }
  })
  const collected = collectHostSceneStats(scene, renderer, camera)
  const walked = snapshotScene({
    objectCount,
    meshCount,
    geometries,
    materials,
    textures: collected.textures,
    lights: collected.lights,
    drawCalls: sample.drawCalls,
    triangles: sample.triangles,
    continuousFrameloop,
    matrixAutoUpdateCount,
    rendererPixelRatio: readRendererPixelRatio(renderer),
    antialias: readRendererAntialias(renderer),
  })
  const merged: SceneSnapshot = {
    ...walked,
    geometryCount: sample.geometryCount,
    textureCount: sample.textureCount,
    estimatedVramBytes: sample.estimatedVramBytes ?? walked.estimatedVramBytes,
    lightCount: sample.lightCount,
    shadowCastingLightCount: sample.shadowCastingLightCount,
  }
  if (sample.gpuFrameTimeMs !== undefined) merged.gpuFrameTimeMs = sample.gpuFrameTimeMs
  return applyHostInsights(merged, collected.insights)
}

function applyCameraPose(camera: unknown, pose: CameraPose): void {
  if (!camera || typeof camera !== 'object') return
  const pos = (camera as { position?: { x: number; y: number; z: number } }).position
  if (!pos || typeof pos !== 'object') return
  pos.x = pose.x
  pos.y = pose.y
  pos.z = pose.z
}

function readVisibilityState(): string | undefined {
  if (typeof document === 'undefined') return undefined
  return document.visibilityState
}

function markReportValidity(
  report: DoctorReport,
  sample: MetricsSample | undefined,
): void {
  if (!sample?.invalid) return
  report.invalid = true
  report.incomplete = true
  if (sample.invalidReason) report.invalidReason = sample.invalidReason
}

function cameraPositionOf(camera: unknown): PassContext['cameraPosition'] {
  if (!camera || typeof camera !== 'object') return undefined
  const pos = (camera as { position?: { x: number; y: number; z: number } }).position
  if (
    !pos ||
    typeof pos.x !== 'number' ||
    typeof pos.y !== 'number' ||
    typeof pos.z !== 'number'
  ) {
    return undefined
  }
  return { x: pos.x, y: pos.y, z: pos.z }
}

function resolvePassIds(
  tokens: Array<'safe' | 'aggressive' | PassId>,
  profile: Profile,
): PassId[] {
  const ids: PassId[] = []
  const seen = new Set<PassId>()
  for (const token of tokens) {
    const chunk: readonly PassId[] =
      token === 'safe'
        ? safePassesFor(profile)
        : token === 'aggressive'
          ? AGGRESSIVE_PASSES
          : [token]
    for (const id of chunk) {
      if (seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

export class Doctor {
  private baseline: MetricsSample | undefined
  private lastSnapshot: SceneSnapshot | undefined
  private previousSnapshot: SceneSnapshot | undefined
  private lastReport: DoctorReport | undefined
  private handles: PassHandle[] = []
  private overlay: OverlayHandle | undefined
  private qualityHudGetter: (() => QualityHudState | undefined) | undefined
  private frameloop: 'always' | 'demand'
  private postfxEnabled: boolean
  private pinnedAutoProfile: Exclude<Profile, 'auto'> | undefined

  constructor(private readonly opts: DoctorOptions) {
    this.frameloop = opts.frameloop ?? 'always'
    this.postfxEnabled = opts.postfxEnabled ?? false
  }

  private device(): DeviceCapabilities {
    if (this.opts.device) return this.opts.device
    const windowDpr =
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as { devicePixelRatio?: unknown }).devicePixelRatio === 'number'
        ? (globalThis as { devicePixelRatio: number }).devicePixelRatio
        : undefined
    const rendererDpr = readRendererPixelRatio(this.opts.renderer)
    const hostDpr = windowDpr ?? rendererDpr
    const probe: Parameters<typeof probeDevice>[0] = {
      webgl: true,
    }
    if (typeof hostDpr === 'number' && Number.isFinite(hostDpr)) {
      probe.devicePixelRatio = hostDpr
    }
    if (typeof navigator !== 'undefined') {
      if (typeof navigator.hardwareConcurrency === 'number') {
        probe.hardwareConcurrency = navigator.hardwareConcurrency
      }
      const nav = navigator as Navigator & { deviceMemory?: number }
      if (typeof nav.deviceMemory === 'number') {
        probe.deviceMemory = nav.deviceMemory
      }
      if (typeof nav.maxTouchPoints === 'number') {
        probe.maxTouchPoints = nav.maxTouchPoints
      }
    }
    if (typeof matchMedia === 'function') {
      probe.coarsePointer = matchMedia('(pointer: coarse)').matches
    }
    const getExtension = this.opts.renderer.getExtension
    const gl = typeof this.opts.renderer.getContext === 'function' ? this.opts.renderer.getContext() : undefined
    if (typeof getExtension === 'function') {
      const signals = readWebglQualitySignals({
        getExtension: (name) => getExtension.call(this.opts.renderer, name),
      })
      if (signals.colorBufferFloat !== undefined) {
        probe.colorBufferFloat = signals.colorBufferFloat
      }
      if (signals.floatLinear !== undefined) {
        probe.floatLinear = signals.floatLinear
      }
    }
    if (gl) {
      const gpuSource: Parameters<typeof readWebglQualitySignals>[0] = {
        getExtension: (name) => gl.getExtension?.(name),
      }
      if (typeof gl.getParameter === 'function') {
        gpuSource.getParameter = gl.getParameter.bind(gl)
      }
      if (typeof gl.MAX_TEXTURE_SIZE === 'number') {
        gpuSource.MAX_TEXTURE_SIZE = gl.MAX_TEXTURE_SIZE
      }
      if (typeof gl.MAX_RENDERBUFFER_SIZE === 'number') {
        gpuSource.MAX_RENDERBUFFER_SIZE = gl.MAX_RENDERBUFFER_SIZE
      }
      const gpuLimits = readWebglQualitySignals(gpuSource)
      if (gpuLimits.maxTextureSize !== undefined) {
        probe.maxTextureSize = gpuLimits.maxTextureSize
      }
      if (gpuLimits.maxRenderbufferSize !== undefined) {
        probe.maxRenderbufferSize = gpuLimits.maxRenderbufferSize
      }
    }
    return probeDevice(probe)
  }

  private collector(): MetricsCollector {
    return new MetricsCollector({
      getRendererInfo: () => this.opts.renderer.info,
      getSceneStats:
        this.opts.getSceneStats ??
        (() => collectHostSceneStats(this.opts.scene, this.opts.renderer).stats),
    })
  }

  private currentSnapshot(sample: MetricsSample): SceneSnapshot {
    return snapshotFrom(
      sample,
      this.opts.renderer,
      this.opts.scene,
      this.frameloop === 'always',
      this.opts.camera,
    )
  }

  private ruleContext(
    snapshot: SceneSnapshot,
    device: DeviceCapabilities,
    profile: Exclude<Profile, 'auto'>,
  ): RuleContext {
    const ctx: RuleContext = { snapshot, device, profile }
    if (this.previousSnapshot) ctx.previousSnapshot = this.previousSnapshot
    return ctx
  }

  private concreteProfile(snap: SceneSnapshot): Exclude<Profile, 'auto'> {
    const requested = this.opts.profile ?? 'auto'
    if (requested !== 'auto') return requested
    if (this.pinnedAutoProfile) return this.pinnedAutoProfile
    this.pinnedAutoProfile = resolveProfile('auto', snap)
    return this.pinnedAutoProfile
  }

  /**
   * Profile used for generic caps. Defaults to `game` when unset so safe-auto
   * never demand-loops a continuous RAF host by assuming marketing/static.
   */
  resolvedProfile(): Exclude<Profile, 'auto'> {
    if (this.lastSnapshot) return this.concreteProfile(this.lastSnapshot)
    if (this.opts.profile && this.opts.profile !== 'auto') return this.opts.profile
    return this.lastReport?.profile ?? 'game'
  }

  genericSafePasses(): PassId[] {
    return safePassesFor(this.resolvedProfile())
  }

  private hostRenderPath(): (() => void | Promise<void>) | undefined {
    if (this.opts.renderFrame) return this.opts.renderFrame
    const render = this.opts.renderer.render
    if (typeof render === 'function') {
      return () => render.call(this.opts.renderer, this.opts.scene, this.opts.camera)
    }
    return undefined
  }

  getDevice(): DeviceCapabilities {
    return this.device()
  }

  async measure(frameCount?: number): Promise<MetricsSample> {
    const frames = frameCount ?? this.opts.measureFrames ?? 30
    const now = this.opts.now ?? (() => performance.now())
    const waitFrame = this.opts.waitFrame
    const renderFrame = waitFrame ? undefined : this.hostRenderPath()
    const collector = this.collector()
    const info = this.opts.renderer.info
    const hadAutoReset = Object.prototype.hasOwnProperty.call(info, 'autoReset')
    const prevAutoReset = info.autoReset
    const gpu = createGpuFrameSampler(this.opts.renderer)
    info.autoReset = false
    let lastCalls = info.render.calls
    let lastTriangles = info.render.triangles
    const gpuTimes: number[] = []
    try {
      for (let i = 0; i < frames; i++) {
        info.reset?.()
        const start = now()
        collector.beginFrame(start)
        gpu?.begin()
        if (waitFrame) await waitFrame()
        else if (renderFrame) await renderFrame()
        const gpuMs = gpu?.end()
        if (gpuMs !== undefined) gpuTimes.push(gpuMs)
        collector.endFrame(now())
        lastCalls = info.render.calls
        lastTriangles = info.render.triangles
      }
    } finally {
      if (hadAutoReset) info.autoReset = prevAutoReset
      else delete (info as { autoReset?: boolean }).autoReset
    }
    const sample = collector.sample()
    sample.drawCalls = lastCalls
    sample.triangles = lastTriangles
    if (gpuTimes.length > 0) {
      sample.gpuFrameTimeMs = gpuTimes.reduce((a, b) => a + b, 0) / gpuTimes.length
    }
    const liveClock = this.opts.now === undefined
    const validityInput: { visibilityState?: string; frameTimesMs: number[] } = {
      frameTimesMs: [...collector.frameTimes()],
    }
    const visibility = liveClock ? readVisibilityState() : 'visible'
    if (visibility !== undefined) validityInput.visibilityState = visibility
    const validity = classifyMeasureValidity(validityInput)
    if (validity.invalid) {
      sample.invalid = true
      if (validity.reason) sample.invalidReason = validity.reason
    }
    const width = this.opts.renderer.drawingBufferWidth
    const height = this.opts.renderer.drawingBufferHeight
    const measured =
      typeof width === 'number' && typeof height === 'number'
        ? { ...sample, drawingBufferPixels: width * height }
        : sample
    this.previousSnapshot = this.lastSnapshot
    this.lastSnapshot = this.currentSnapshot(measured)
    this.baseline = measured
    return measured
  }

  private async buildDiagnoseReport(): Promise<DoctorReport> {
    const baseline = this.baseline ?? (await this.measure())
    const device = this.device()
    const snap = this.currentSnapshot(baseline)
    const profile = this.concreteProfile(snap)
    const findings = runRules(this.ruleContext(snap, device, profile))
    const score = computeDoctorScore(findings, snap, profile, this.previousSnapshot)
    const report: DoctorReport = {
      profile,
      mode: this.opts.mode ?? 'diagnose',
      score,
      findings,
      baseline,
      appliedPasses: [],
      failedPasses: [],
      incomplete: false,
    }
    markReportValidity(report, baseline)
    return report
  }

  async diagnose(): Promise<DoctorReport> {
    const report = await this.buildDiagnoseReport()
    this.lastReport = report
    this.overlay?.refresh()
    return report
  }

  applyPassesImmediate(
    passIds: PassId[],
    extras?: { qualityTier?: QualityTier },
  ): { appliedPasses: PassId[]; failedPasses: Array<{ id: PassId; error: string }> } {
    const device = this.device()
    const cameraPosition = cameraPositionOf(this.opts.camera)
    const profile = this.resolvedProfile()
    const ctx: PassContext = {
      renderer: this.opts.renderer,
      scene: this.opts.scene,
      device,
      profile,
      postfxEnabled: this.postfxEnabled,
      setPostfxEnabled: (enabled) => {
        this.postfxEnabled = enabled
        this.opts.setPostfxEnabled?.(enabled)
      },
      frameloop: this.frameloop,
      setFrameloop: (mode) => {
        if (!this.opts.setFrameloop) return
        this.frameloop = mode
        this.opts.setFrameloop(mode)
      },
    }
    if (cameraPosition) ctx.cameraPosition = cameraPosition
    if (extras?.qualityTier) ctx.qualityTier = extras.qualityTier

    const appliedPasses: PassId[] = []
    const failedPasses: Array<{ id: PassId; error: string }> = []
    for (const id of passIds) {
      let handle: PassHandle | undefined
      try {
        const pass = PASS_REGISTRY[id]
        handle = pass.apply(ctx)
        this.handles.push(handle)
        appliedPasses.push(id)
      } catch (err) {
        try {
          handle?.rollback()
        } catch {
          // Pass-level apply already attempted restore; ignore rollback errors.
        }
        failedPasses.push({
          id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    return { appliedPasses, failedPasses }
  }

  rollbackAll(): void {
    for (let i = this.handles.length - 1; i >= 0; i--) {
      try {
        this.handles[i]!.rollback()
      } catch {
        // best-effort
      }
    }
    this.handles = []
  }

  attachQualityHud(getter: () => QualityHudState | undefined): void {
    this.qualityHudGetter = getter
    this.overlay?.refresh()
  }

  refreshOverlay(): void {
    this.overlay?.refresh()
  }

  reclampPixelRatioCeiling(maxRatio: number): void {
    const current = readRendererPixelRatio(this.opts.renderer)
    if (current !== undefined && current > maxRatio) {
      this.opts.renderer.setPixelRatio(maxRatio)
    }
  }

  forceDrawingBufferPixels(maxPixels: number): void {
    const renderer = this.opts.renderer
    const width = renderer.drawingBufferWidth
    const height = renderer.drawingBufferHeight
    if (width === undefined || height === undefined) return
    const current = width * height
    if (!(current > maxPixels)) return
    if (typeof renderer.setDrawingBufferSize !== 'function') return
    const scale = Math.sqrt(maxPixels / current)
    const newW = Math.max(1, Math.floor(width * scale))
    const newH = Math.max(1, Math.floor(height * scale))
    const prevRatio = readRendererPixelRatio(renderer)
    if (prevRatio === undefined || !(prevRatio > 0)) return
    const pr = prevRatio
    try {
      renderer.setDrawingBufferSize(newW / pr, newH / pr, pr)
    } catch {
      try {
        renderer.setDrawingBufferSize(width / pr, height / pr, pr)
      } catch {
        // best-effort restore; do not destroy the context
      }
    }
  }

  forcePostfxOff(): void {
    this.postfxEnabled = false
    try {
      this.opts.setPostfxEnabled?.(false)
    } catch {
      // best-effort
    }
  }

  forceShadowsOff(): void {
    try {
      if (this.opts.renderer.shadowMap) {
        this.opts.renderer.shadowMap.enabled = false
      }
      this.opts.scene.traverse((obj) => {
        if (obj.castShadow) obj.castShadow = false
      })
    } catch {
      // best-effort
    }
  }

  async compareAb(opts: {
    rounds?: number
    poses?: CameraPose[]
    applyB?: () => void | Promise<void>
    restoreA?: () => void | Promise<void>
    frames?: number
  } = {}): Promise<AbCompareResult> {
    const rounds = opts.rounds ?? 2
    const pose = opts.poses?.[0]
    const a: MetricsSample[] = []
    const b: MetricsSample[] = []
    for (let i = 0; i < rounds; i++) {
      if (pose) applyCameraPose(this.opts.camera, pose)
      a.push(await this.measure(opts.frames))
      await opts.applyB?.()
      if (pose) applyCameraPose(this.opts.camera, pose)
      b.push(await this.measure(opts.frames))
      await opts.restoreA?.()
    }
    return compareAbSamples({ a, b })
  }

  async optimize(
    options: {
      apply?: Array<'safe' | 'aggressive' | PassId>
      visualGate?: VisualGate
    } = {},
  ): Promise<DoctorReport> {
    const diagnosed = await this.buildDiagnoseReport()
    let controlChangedRatio = 0
    let baselinePixels: ArrayLike<number> | undefined
    if (options.visualGate) {
      const first = await options.visualGate.capture()
      const second = await options.visualGate.capture()
      baselinePixels = first
      controlChangedRatio = pixelChangedRatio(first, second, options.visualGate.channelThreshold)
    }
    const passIds = resolvePassIds(options.apply ?? ['safe'], diagnosed.profile)
    const { appliedPasses, failedPasses } = this.applyPassesImmediate(passIds)
    const device = this.device()

    let after: MetricsSample | undefined
    let incomplete = false
    try {
      after = await this.measure()
    } catch {
      incomplete = true
      after = undefined
    }

    const sampleForRules = after ?? diagnosed.baseline
    const snap = this.currentSnapshot(sampleForRules)
    const findings = runRules(this.ruleContext(snap, device, diagnosed.profile))
    const score = computeDoctorScore(findings, snap, diagnosed.profile, this.previousSnapshot)
    const report: DoctorReport = {
      profile: diagnosed.profile,
      mode: 'optimize',
      score,
      findings,
      baseline: diagnosed.baseline,
      appliedPasses,
      failedPasses,
      incomplete,
    }
    if (after) {
      report.after = after
      report.deltas = diffMetrics(diagnosed.baseline, after)
    }
    markReportValidity(report, after ?? diagnosed.baseline)
    if (options.visualGate && baselinePixels) {
      const candidate = await options.visualGate.capture()
      const candidateChangedRatio = pixelChangedRatio(
        baselinePixels,
        candidate,
        options.visualGate.channelThreshold,
      )
      const verdictOpts: {
        controlChangedRatio: number
        candidateChangedRatio: number
        maxChangedRatio?: number
      } = { controlChangedRatio, candidateChangedRatio }
      if (options.visualGate.maxChangedRatio !== undefined) {
        verdictOpts.maxChangedRatio = options.visualGate.maxChangedRatio
      }
      const verdict = classifyVisualSafety(verdictOpts)
      if (verdict.visualDelta) report.visualDelta = true
    }
    this.lastReport = report
    this.overlay?.refresh()
    return report
  }

  mountOverlay(): void {
    if (this.overlay) return
    this.overlay = mountOverlayImpl({
      getScore: () => this.lastReport?.score ?? 0,
      getBaseline: () => this.lastReport?.baseline ?? this.baseline,
      getAfter: () => this.lastReport?.after,
      getQualityHud: () => this.qualityHudGetter?.(),
    })
  }

  unmountOverlay(): void {
    this.overlay?.unmount()
    this.overlay = undefined
  }
}
