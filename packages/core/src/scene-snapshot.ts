import type { SceneSnapshot } from './types.js'

export interface SnapshotTextureInput {
  uuid: string
  width: number
  height: number
  bytesPerPixel: number
}

export interface SnapshotInput {
  objectCount: number
  meshCount: number
  geometries: ReadonlyArray<{ uuid: string }>
  materials: ReadonlyArray<{ uuid: string }>
  textures: ReadonlyArray<SnapshotTextureInput>
  lights: ReadonlyArray<{ castShadow: boolean }>
  drawCalls: number
  triangles: number
  continuousFrameloop: boolean
  matrixAutoUpdateCount: number
  rendererPixelRatio: number
  antialias: boolean
}

export function snapshotScene(input: SnapshotInput): SceneSnapshot {
  const geometryIds = new Set(input.geometries.map((g) => g.uuid))
  const materialIds = new Set(input.materials.map((m) => m.uuid))
  const textureIds = new Set(input.textures.map((t) => t.uuid))
  let estimatedVramBytes = 0
  let maxTextureDimension = 0
  for (const tex of input.textures) {
    estimatedVramBytes += tex.width * tex.height * tex.bytesPerPixel
    maxTextureDimension = Math.max(maxTextureDimension, tex.width, tex.height)
  }
  return {
    objectCount: input.objectCount,
    meshCount: input.meshCount,
    geometryCount: geometryIds.size,
    materialCount: materialIds.size,
    textureCount: textureIds.size,
    estimatedVramBytes,
    lightCount: input.lights.length,
    shadowCastingLightCount: input.lights.filter((l) => l.castShadow).length,
    drawCalls: input.drawCalls,
    triangles: input.triangles,
    maxTextureDimension,
    continuousFrameloop: input.continuousFrameloop,
    matrixAutoUpdateCount: input.matrixAutoUpdateCount,
    rendererPixelRatio: input.rendererPixelRatio,
    antialias: input.antialias,
  }
}
