import { attachQualityLadder, discoverThreeHandles, type AttachQualityLadderOptions } from './index.js'

const g = globalThis as typeof globalThis & {
  ThreejsDoctorLiveAttach?: {
    attachQualityLadder: typeof attachQualityLadder
    discoverThreeHandles: typeof discoverThreeHandles
  }
  __THREEJS_DOCTOR_ATTACH__?: AttachQualityLadderOptions
}

g.ThreejsDoctorLiveAttach = { attachQualityLadder, discoverThreeHandles }

const opts = g.__THREEJS_DOCTOR_ATTACH__ ?? {}
if (opts.autoRun !== false) {
  void attachQualityLadder(opts).catch((err: unknown) => {
    console.error('[threejs-doctor live-attach]', err)
  })
}
