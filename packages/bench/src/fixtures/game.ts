import type { DeviceCapabilities } from '@threejs-doctor/core'
import type { DoctorRendererLike, DoctorSceneLike } from '@threejs-doctor/runtime'

export function createGameFixture() {
  const lights = [
    { castShadow: true }, { castShadow: true },
    { castShadow: true }, { castShadow: true },
  ]
  const renderer: DoctorRendererLike = {
    info: { render: { calls: 160, triangles: 80_000 }, memory: { geometries: 60, textures: 20 } },
    pixelRatio: 2,
    antialias: false,
    setPixelRatio(v: number) { this.pixelRatio = v },
  }
  const scene: DoctorSceneLike = {
    children: lights,
    traverse(cb) {
      for (const l of lights) cb(l as never)
      for (let i = 0; i < 40; i++) {
        cb({
          isMesh: true,
          geometry: { uuid: `g${i}` },
          material: { uuid: 'shared' },
          matrixAutoUpdate: true,
          visible: true,
          position: { distanceTo: () => (i > 30 ? 120 : 20) },
        })
      }
    },
  }
  const device: DeviceCapabilities = {
    tier: 'mid', maxTextureSize: 8192, webgl: true, webgpu: false,
    devicePixelRatio: 2, hardwareConcurrency: 8,
  }
  return {
    profile: 'game' as const,
    scene,
    renderer,
    camera: {},
    device,
    getSceneStats: () => ({
      textureCount: 20,
      estimatedVramBytes: 96_000_000,
      geometryCount: 60,
      lightCount: lights.length,
      shadowCastingLightCount: lights.filter((l) => l.castShadow).length,
    }),
  }
}
