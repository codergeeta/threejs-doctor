import type { SceneStatsLike } from '@threejs-doctor/core'

interface Traversable {
  traverse?: (cb: (object: Record<string, unknown>) => void) => void
}

interface RendererMemory {
  info?: { memory?: { textures?: number; geometries?: number } }
}

/** Count lights from the live scene; never invent VRAM or FPS. */
export function collectSceneStats(scene: unknown, renderer: unknown): SceneStatsLike {
  let lightCount = 0
  let shadowCastingLightCount = 0
  const traversable = scene as Traversable
  if (typeof traversable.traverse === 'function') {
    traversable.traverse((obj) => {
      if (obj.isLight === true) {
        lightCount += 1
        if (obj.castShadow === true) shadowCastingLightCount += 1
      }
    })
  }
  const memory = (renderer as RendererMemory).info?.memory
  return {
    textureCount: memory?.textures ?? 0,
    estimatedVramBytes: 0,
    geometryCount: memory?.geometries ?? 0,
    lightCount,
    shadowCastingLightCount,
  }
}
