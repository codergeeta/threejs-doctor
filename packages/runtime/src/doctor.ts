import {
  MetricsCollector,
  SAFE_PASSES,
  probeDevice,
  snapshotScene,
  type MetricsSample,
  type Mode,
  type PassId,
  type Profile,
  type DeviceCapabilities,
  type SceneSnapshot,
  type SceneStatsLike,
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
import { shadowBudgetPass } from './passes/shadow-budget.js'
import { postfxBudgetPass } from './passes/postfx-budget.js'
import { frameloopDemandPass } from './passes/frameloop-demand.js'
import { distanceCullPass } from './passes/distance-cull.js'
import { materialDowngradePass } from './passes/material-downgrade.js'
import { mountOverlay as mountOverlayImpl, type OverlayHandle } from './overlay/mount-overlay.js'

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
}

const PASS_REGISTRY: Record<PassId, OptimizePass> = {
  'dpr-cap': dprCapPass,
  'shadow-budget': shadowBudgetPass,
  'postfx-budget': postfxBudgetPass,
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
    deltas[key] = after[key] - baseline[key]
  })
  return deltas
}

function snapshotFrom(
  sample: MetricsSample,
  renderer: DoctorRendererLike,
  scene: DoctorSceneLike,
  continuousFrameloop: boolean,
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
  const walked = snapshotScene({
    objectCount,
    meshCount,
    geometries,
    materials,
    textures: [],
    lights: [],
    drawCalls: sample.drawCalls,
    triangles: sample.triangles,
    continuousFrameloop,
    matrixAutoUpdateCount,
    rendererPixelRatio: renderer.pixelRatio,
    antialias: Boolean(renderer.antialias),
  })
  return {
    ...walked,
    geometryCount: sample.geometryCount,
    textureCount: sample.textureCount,
    estimatedVramBytes: sample.estimatedVramBytes,
    lightCount: sample.lightCount,
    shadowCastingLightCount: sample.shadowCastingLightCount,
  }
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

function resolvePassIds(tokens: Array<'safe' | PassId>): PassId[] {
  const ids: PassId[] = []
  const seen = new Set<PassId>()
  for (const token of tokens) {
    const chunk: readonly PassId[] = token === 'safe' ? SAFE_PASSES : [token]
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
  private frameloop: 'always' | 'demand'
  private postfxEnabled: boolean

  constructor(private readonly opts: DoctorOptions) {
    this.frameloop = opts.frameloop ?? 'always'
    this.postfxEnabled = opts.postfxEnabled ?? false
  }

  private device(): DeviceCapabilities {
    if (this.opts.device) return this.opts.device
    const hostDpr =
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as { devicePixelRatio?: unknown }).devicePixelRatio === 'number'
        ? (globalThis as { devicePixelRatio: number }).devicePixelRatio
        : this.opts.renderer.pixelRatio
    const probe: Parameters<typeof probeDevice>[0] = {
      webgl: true,
      devicePixelRatio: hostDpr,
    }
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.hardwareConcurrency === 'number'
    ) {
      probe.hardwareConcurrency = navigator.hardwareConcurrency
    }
    return probeDevice(probe)
  }

  private collector(): MetricsCollector {
    return new MetricsCollector({
      getRendererInfo: () => this.opts.renderer.info,
      getSceneStats:
        this.opts.getSceneStats ??
        (() => ({
          textureCount: this.opts.renderer.info.memory.textures,
          estimatedVramBytes: 0,
          geometryCount: this.opts.renderer.info.memory.geometries,
          lightCount: 0,
          shadowCastingLightCount: 0,
        })),
    })
  }

  private currentSnapshot(sample: MetricsSample): SceneSnapshot {
    return snapshotFrom(
      sample,
      this.opts.renderer,
      this.opts.scene,
      this.frameloop === 'always',
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

  async measure(): Promise<MetricsSample> {
    const frames = this.opts.measureFrames ?? 30
    const now = this.opts.now ?? (() => performance.now())
    const collector = this.collector()
    for (let i = 0; i < frames; i++) {
      const start = now()
      collector.beginFrame(start)
      collector.endFrame(now())
    }
    const sample = collector.sample()
    this.previousSnapshot = this.lastSnapshot
    this.lastSnapshot = this.currentSnapshot(sample)
    this.baseline = sample
    return sample
  }

  async diagnose(): Promise<DoctorReport> {
    const baseline = this.baseline ?? (await this.measure())
    const device = this.device()
    const snap = this.currentSnapshot(baseline)
    const profile = resolveProfile(this.opts.profile ?? 'auto', snap)
    const findings = runRules(this.ruleContext(snap, device, profile))
    const score = computeDoctorScore(findings, snap, profile)
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
    this.lastReport = report
    this.overlay?.refresh()
    return report
  }

  async optimize(options: { apply?: Array<'safe' | PassId> } = {}): Promise<DoctorReport> {
    const diagnosed = await this.diagnose()
    const passIds = resolvePassIds(options.apply ?? ['safe'])
    const device = this.device()
    const cameraPosition = cameraPositionOf(this.opts.camera)
    const ctx: PassContext = {
      renderer: this.opts.renderer,
      scene: this.opts.scene,
      device,
      profile: diagnosed.profile,
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

    const appliedPasses: PassId[] = []
    const failedPasses: DoctorReport['failedPasses'] = []
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
    const score = computeDoctorScore(findings, snap, diagnosed.profile)
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
    })
  }

  unmountOverlay(): void {
    this.overlay?.unmount()
    this.overlay = undefined
  }
}
