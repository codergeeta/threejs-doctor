import type { DeviceCapabilities } from '@threejs-doctor/core'
import type { DoctorRendererLike, DoctorSceneLike } from '@threejs-doctor/runtime'

export function createCadFixture() {
  const lights = [{ castShadow: true }, { castShadow: true }, { castShadow: true }]
  const renderer: DoctorRendererLike = {
    info: { render: { calls: 180, triangles: 200_000 }, memory: { geometries: 120, textures: 15 } },
    pixelRatio: 2,
    antialias: true,
    setPixelRatio(v: number) { this.pixelRatio = v },
  }
  const scene: DoctorSceneLike = {
    children: lights,
    traverse(cb) {
      for (const l of lights) cb(l as never)
      for (let i = 0; i < 80; i++) {
        cb({
          isMesh: true,
          geometry: { uuid: `cad${i}` },
          material: { uuid: `mat${i % 20}` },
          matrixAutoUpdate: true,
          visible: true,
          position: { distanceTo: () => 15 },
        })
      }
    },
  }
  const device: DeviceCapabilities = {
    tier: 'mid', maxTextureSize: 8192, webgl: true, webgpu: false,
    devicePixelRatio: 2, hardwareConcurrency: 8,
  }
  return {
    profile: 'cad' as const,
    scene,
    renderer,
    camera: {},
    device,
    getSceneStats: () => ({
      textureCount: 15,
      estimatedVramBytes: 80_000_000,
      geometryCount: 120,
      lightCount: lights.length,
      shadowCastingLightCount: lights.filter((l) => l.castShadow).length,
    }),
  }
}
