import {
  attachQualityLadder,
  discoverThreeHandles,
  installRendererRenderCapture,
  wrapWebGLRendererCtor,
  PHONE_CLASS_PROBE,
  type AttachQualityLadderOptions,
} from './index.js'

const g = globalThis as typeof globalThis & {
  ThreejsDoctorLiveAttach?: {
    attachQualityLadder: typeof attachQualityLadder
    discoverThreeHandles: typeof discoverThreeHandles
    installRendererRenderCapture: typeof installRendererRenderCapture
    wrapWebGLRendererCtor: typeof wrapWebGLRendererCtor
    PHONE_CLASS_PROBE: typeof PHONE_CLASS_PROBE
  }
  __THREEJS_DOCTOR_ATTACH__?: AttachQualityLadderOptions
}

g.ThreejsDoctorLiveAttach = {
  attachQualityLadder,
  discoverThreeHandles,
  installRendererRenderCapture,
  wrapWebGLRendererCtor,
  PHONE_CLASS_PROBE,
}

const opts = g.__THREEJS_DOCTOR_ATTACH__ ?? {}
if (opts.autoRun !== false) {
  void attachQualityLadder(opts).catch((err: unknown) => {
    console.error('[threejs-doctor live-attach]', err)
  })
}
