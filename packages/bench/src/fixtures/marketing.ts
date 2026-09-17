import type { DeviceCapabilities } from '@threejs-doctor/core'
import type { DoctorRendererLike, DoctorSceneLike } from '@threejs-doctor/runtime'

export function createMarketingFixture() {
  const lights = [{ castShadow: true }, { castShadow: true }]
  const renderer: DoctorRendererLike = {
    info: { render: { calls: 90, triangles: 12_000 }, memory: { geometries: 12, textures: 6 } },
    pixelRatio: 3,
    antialias: true,
    setPixelRatio(v: number) { this.pixelRatio = v },
  }
  const scene: DoctorSceneLike = {
    children: lights,
    traverse(cb) {
      for (const l of lights) cb(l as never)
      cb({
        isMesh: true,
        geometry: { uuid: 'm1' },
        material: { uuid: 'mat1' },
        matrixAutoUpdate: true,
        visible: true,
        position: { distanceTo: () => 10 },
      })
    },
  }
  const device: DeviceCapabilities = {
    tier: 'low', maxTextureSize: 4096, webgl: true, webgpu: false,
    devicePixelRatio: 3, hardwareConcurrency: 4,
  }
  return {
    profile: 'marketing' as const,
    scene,
    renderer,
    camera: {},
    device,
    getSceneStats: () => ({
      textureCount: 6,
      estimatedVramBytes: 24_000_000,
      geometryCount: 12,
      lightCount: lights.length,
      shadowCastingLightCount: lights.filter((l) => l.castShadow).length,
    }),
  }
}
