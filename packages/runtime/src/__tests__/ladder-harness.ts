import { Doctor } from '../doctor.js'
import type { RendererInfoLike } from '@threejs-doctor/core'

export function createLadderDoctor(opts?: {
  pixelRatio?: number
  setPixelRatio?: (v: number) => void
  getSceneStats?: () => {
    textureCount: number
    estimatedVramBytes: number
    geometryCount: number
    lightCount: number
    shadowCastingLightCount: number
  }
  now?: () => number
  waitFrame?: () => Promise<void>
  device?: ConstructorParameters<typeof Doctor>[0] extends infer O
    ? O extends { device?: infer D }
      ? D
      : never
    : never
  measureFrames?: number
  postfxEnabled?: boolean
  setPostfxEnabled?: (enabled: boolean) => void
}) {
  const info: RendererInfoLike = {
    render: { calls: 40, triangles: 8000 },
    memory: { geometries: 8, textures: 4 },
  }
  const lights = [{ castShadow: true }, { castShadow: true }]
  const renderer = {
    info,
    pixelRatio: opts?.pixelRatio ?? 3,
    antialias: true,
    toneMapping: 4,
    shadowMap: { enabled: true },
    drawingBufferWidth: 2000,
    drawingBufferHeight: 2000,
    setPixelRatio(v: number) {
      if (opts?.setPixelRatio) {
        opts.setPixelRatio(v)
        return
      }
      this.pixelRatio = v
    },
    setDrawingBufferSize(width: number, height: number, pixelRatio: number) {
      this.drawingBufferWidth = width
      this.drawingBufferHeight = height
      this.pixelRatio = pixelRatio
    },
  }
  const scene = {
    children: lights,
    traverse(cb: (o: Record<string, unknown>) => void) {
      for (const l of lights) cb(l as never)
      cb({
        isMesh: true,
        geometry: { uuid: 'g1' },
        material: {
          uuid: 'm1',
          map: { anisotropy: 8 },
        },
        matrixAutoUpdate: false,
      })
    },
  }
  let t = 0
  const doctor = new Doctor({
    scene: scene as never,
    camera: {},
    renderer: renderer as never,
    profile: 'game',
    mode: 'optimize',
    measureFrames: opts?.measureFrames ?? 5,
    now:
      opts?.now ??
      (() => {
        t += 16
        return t
      }),
    device: opts?.device ?? {
      tier: 'low',
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      devicePixelRatio: 3,
      hardwareConcurrency: 4,
      deviceMemory: 4,
      maxTouchPoints: 5,
      coarsePointer: true,
      colorBufferFloat: true,
      floatLinear: true,
    },
    getSceneStats:
      opts?.getSceneStats ??
      (() => ({
        textureCount: 4,
        estimatedVramBytes: 8_000_000,
        geometryCount: 8,
        lightCount: 2,
        shadowCastingLightCount: lights.filter((l) => l.castShadow).length,
      })),
    ...(opts?.waitFrame ? { waitFrame: opts.waitFrame } : {}),
    ...(opts?.postfxEnabled !== undefined ? { postfxEnabled: opts.postfxEnabled } : {}),
    ...(opts?.setPostfxEnabled ? { setPostfxEnabled: opts.setPostfxEnabled } : {}),
  })
  return { doctor, renderer, lights, info }
}
