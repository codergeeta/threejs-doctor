import { createOceanAdapter, getPelagicDebug } from '@threejs-doctor/ocean-adapter-example'
import {
  Doctor,
  QualityController,
  type DoctorOptions,
  type QualityControllerOptions,
  type QualityLadderReport,
} from '@threejs-doctor/runtime'
import type { Profile, QualityMode } from '@threejs-doctor/core'
import {
  attemptDiscovery,
  formatDiscoveryError,
  waitForSceneCameraFromRenderer,
  type ExplicitHandles,
} from './discover.js'
import { collectSceneStats } from './scene-stats.js'
import { wrapRenderer } from './wrap-renderer.js'
import { waitLiveFrame } from './wait-frame.js'

export interface AttachQualityLadderOptions {
  mode?: QualityMode
  profile?: Exclude<Profile, 'auto'>
  scene?: unknown
  camera?: unknown
  renderer?: unknown
  root?: unknown
  now?: () => number
  waitFrame?: () => Promise<void>
  waitForFirstInteractive?: () => Promise<void>
  windowFrames?: number
  measureFrames?: number
  mountOverlay?: boolean
  autoRun?: boolean
  log?: (line: string) => void
}

export async function attachQualityLadder(
  options: AttachQualityLadderOptions = {},
): Promise<QualityLadderReport> {
  const root = options.root ?? globalThis
  const persist = (report: QualityLadderReport) => {
    const assign = (target: object | undefined | null) => {
      if (!target || typeof target !== 'object') return
      try {
        ;(target as { __THREEJS_DOCTOR_LAST_REPORT__?: QualityLadderReport }).__THREEJS_DOCTOR_LAST_REPORT__ =
          report
      } catch {
        // page may freeze window; still try other roots
      }
    }
    assign(globalThis)
    if (root !== globalThis) assign(root as object)
    const win = (globalThis as { window?: object }).window
    if (win) assign(win)
    if (typeof window !== 'undefined') assign(window)
  }
  const explicit: ExplicitHandles = {}
  if (options.scene !== undefined) explicit.scene = options.scene
  if (options.camera !== undefined) explicit.camera = options.camera
  if (options.renderer !== undefined) explicit.renderer = options.renderer

  const attempt = attemptDiscovery(root, explicit)
  let scene = attempt.scene
  let camera = attempt.camera
  let rendererHandle = attempt.renderer

  if (rendererHandle != null && scene == null) {
    const waitFrameForHook =
      options.waitFrame ?? (options.now === undefined ? waitLiveFrame(rendererHandle) : undefined)
    const captured = await waitForSceneCameraFromRenderer(rendererHandle, {
      maxAttempts: waitFrameForHook ? 32 : 1,
      ...(waitFrameForHook ? { waitFrame: waitFrameForHook } : {}),
    })
    if (captured?.scene != null) {
      scene = captured.scene
      camera = captured.camera ?? camera
    }
  }

  if (scene == null || rendererHandle == null) {
    attempt.probe.foundRenderer = rendererHandle != null
    attempt.probe.foundScene = scene != null
    throw new Error(formatDiscoveryError(attempt.probe))
  }

  const found = {
    scene,
    camera: camera ?? {},
    renderer: rendererHandle,
  }

  const renderer = wrapRenderer(found.renderer as object)
  const sceneForDoctor = found.scene as DoctorOptions['scene']
  const cameraForDoctor = found.camera ?? {}

  const useLiveClock = options.now === undefined
  const waitFrame =
    options.waitFrame ?? (useLiveClock ? waitLiveFrame(found.renderer) : undefined)

  const doctorOpts: DoctorOptions = {
    scene: sceneForDoctor,
    camera: cameraForDoctor,
    renderer,
    profile: options.profile ?? 'game',
    getSceneStats: () => collectSceneStats(found.scene, renderer),
  }
  if (options.now) doctorOpts.now = options.now
  if (options.measureFrames !== undefined) doctorOpts.measureFrames = options.measureFrames
  if (waitFrame) doctorOpts.waitFrame = waitFrame

  const doctor = new Doctor(doctorOpts)
  const qcOpts: QualityControllerOptions = {
    mode: options.mode ?? 'advise',
  }
  if (options.now) qcOpts.now = options.now
  if (options.windowFrames !== undefined) qcOpts.windowFrames = options.windowFrames
  if (options.waitForFirstInteractive) {
    qcOpts.waitForFirstInteractive = options.waitForFirstInteractive
  }
  qcOpts.onReport = persist

  const ladder = new QualityController(doctor, qcOpts)
  const debug = getPelagicDebug(root)
  if (debug) ladder.registerAdapter(createOceanAdapter(debug))

  if (
    options.mountOverlay !== false &&
    typeof document !== 'undefined' &&
    document.body
  ) {
    doctor.mountOverlay()
  }

  let report: QualityLadderReport | undefined
  try {
    await ladder.boot()
    report = await ladder.runLadder()
    return report
  } finally {
    const last =
      report ??
      (globalThis as { __THREEJS_DOCTOR_LAST_REPORT__?: QualityLadderReport }).__THREEJS_DOCTOR_LAST_REPORT__
    if (last) {
      persist(last)
      try {
        const line = JSON.stringify(last)
        ;(options.log ?? console.log)(line)
      } catch {
        // LAST_REPORT is still set; console JSON is best-effort
      }
    }
  }
}
