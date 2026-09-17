import type { DeviceCapabilities } from '@threejs-doctor/core'
import type { DoctorRendererLike, DoctorSceneLike } from '@threejs-doctor/runtime'

export function createProductFixture() {
  const lights = [{ castShadow: true }, { castShadow: true }, { castShadow: true }]
  const renderer: DoctorRendererLike = {
    info: { render: { calls: 110, triangles: 30_000 }, memory: { geometries: 8, textures: 10 } },
    pixelRatio: 2.5,
    antialias: true,
    setPixelRatio(v: number) { this.pixelRatio = v },
  }
  const scene: DoctorSceneLike = {
    children: lights,
    traverse(cb) {
      for (const l of lights) cb(l as never)
      cb({
        isMesh: true,
        geometry: { uuid: 'p1' },
        material: { uuid: 'pmat' },
        matrixAutoUpdate: true,
        visible: true,
        position: { distanceTo: () => 5 },
      })
    },
  }
  const device: DeviceCapabilities = {
    tier: 'low', maxTextureSize: 4096, webgl: true, webgpu: false,
    devicePixelRatio: 2.5, hardwareConcurrency: 4,
  }
  return {
    profile: 'product' as const,
    scene,
    renderer,
    camera: {},
    device,
    getSceneStats: () => ({
      textureCount: 10,
      estimatedVramBytes: 48_000_000,
      geometryCount: 8,
      lightCount: lights.length,
      shadowCastingLightCount: lights.filter((l) => l.castShadow).length,
    }),
  }
}
