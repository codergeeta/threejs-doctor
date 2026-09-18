import type { SceneStatsLike } from '@threejs-doctor/core'
import { collectHostSceneStats } from '@threejs-doctor/runtime'

/** Count lights/textures from the live scene; VRAM only when dimensions are known. */
export function collectSceneStats(scene: unknown, renderer: unknown): SceneStatsLike {
  return collectHostSceneStats(scene, renderer).stats
}
