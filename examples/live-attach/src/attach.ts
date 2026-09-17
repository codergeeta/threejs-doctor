import { createOceanAdapter, getPelagicDebug } from '@threejs-doctor/ocean-adapter-example'
import {
  Doctor,
  QualityController,
  type DoctorOptions,
  type QualityControllerOptions,
  type QualityLadderReport,
} from '@threejs-doctor/runtime'
import type { Profile, QualityMode } from '@threejs-doctor/core'
import { discoverThreeHandles, type ExplicitHandles } from './discover.js'
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
  const explicit: ExplicitHandles = {}
  if (options.scene !== undefined) explicit.scene = options.scene
  if (options.camera !== undefined) explicit.camera = options.camera
  if (options.renderer !== undefined) explicit.renderer = options.renderer

  const found = discoverThreeHandles(root, explicit)
  if (!found) {
    throw new Error(
      'threejs-doctor live-attach: could not find scene/camera/renderer. Pass them explicitly: attachQualityLadder({ scene, camera, renderer })',
    )
  }

  const renderer = wrapRenderer(found.renderer as object)
  const scene = found.scene as DoctorOptions['scene']
  const camera = found.camera ?? {}

  const useLiveClock = options.now === undefined
  const waitFrame =
    options.waitFrame ?? (useLiveClock ? waitLiveFrame(found.renderer) : undefined)

  const doctorOpts: DoctorOptions = {
    scene,
    camera,
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

  await ladder.boot()
  const report = await ladder.runLadder()
  const line = JSON.stringify(report)
  ;(options.log ?? console.log)(line)
  return report
}
