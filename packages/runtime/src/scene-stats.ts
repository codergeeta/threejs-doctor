import type { SceneStatsLike } from '@threejs-doctor/core'
import type { SnapshotTextureInput } from '@threejs-doctor/core'
import type { DoctorRendererLike, DoctorSceneLike } from './passes/types.js'

const MATERIAL_MAP_KEYS = [
  'map',
  'lightMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'normalMap',
  'displacementMap',
  'roughnessMap',
  'metalnessMap',
  'alphaMap',
  'envMap',
  'specularMap',
  'gradientMap',
  'matcap',
] as const

/** RGBA8 lower bound. Omit VRAM rather than guess compressed/half-float formats. */
const BYTES_PER_PIXEL = 4

export interface HostSceneCollection {
  stats: SceneStatsLike
  lights: Array<{ castShadow: boolean }>
  textures: SnapshotTextureInput[]
}

function finiteSize(width: unknown, height: unknown): { width: number; height: number } | undefined {
  if (typeof width !== 'number' || typeof height !== 'number') return undefined
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined
  return { width, height }
}

function textureSize(tex: Record<string, unknown>): { width: number; height: number } | undefined {
  const direct = finiteSize(tex.width, tex.height)
  if (direct) return direct
  const image = tex.image as Record<string, unknown> | undefined
  const fromImage = image ? finiteSize(image.width, image.height) : undefined
  if (fromImage) return fromImage
  const source = tex.source as { data?: Record<string, unknown> } | undefined
  if (source?.data) return finiteSize(source.data.width, source.data.height)
  return undefined
}

function rememberTexture(
  seen: Map<string, SnapshotTextureInput>,
  tex: unknown,
  fallbackId: string,
): void {
  if (!tex || typeof tex !== 'object') return
  const rec = tex as Record<string, unknown>
  const uuid = typeof rec.uuid === 'string' ? rec.uuid : fallbackId
  if (seen.has(uuid)) return
  const size = textureSize(rec)
  if (!size) {
    seen.set(uuid, { uuid, width: 0, height: 0, bytesPerPixel: BYTES_PER_PIXEL })
    return
  }
  seen.set(uuid, {
    uuid,
    width: size.width,
    height: size.height,
    bytesPerPixel: BYTES_PER_PIXEL,
  })
}

function collectMaterialTextures(
  material: unknown,
  seen: Map<string, SnapshotTextureInput>,
  id: string,
): void {
  if (!material || typeof material !== 'object') return
  const rec = material as Record<string, unknown>
  for (const key of MATERIAL_MAP_KEYS) {
    rememberTexture(seen, rec[key], `${id}:${key}`)
  }
}

function isRenderTarget(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const rec = value as Record<string, unknown>
  if (rec.isWebGLRenderTarget === true) return true
  return Boolean(rec.texture) && finiteSize(rec.width, rec.height) !== undefined
}

function rememberRenderTarget(
  seen: Map<string, SnapshotTextureInput>,
  value: unknown,
  fallbackId: string,
): void {
  if (!isRenderTarget(value)) return
  const tex = value.texture
  const uuid =
    tex && typeof tex === 'object' && typeof (tex as { uuid?: unknown }).uuid === 'string'
      ? (tex as { uuid: string }).uuid
      : fallbackId
  if (seen.has(uuid)) return
  const size = finiteSize(value.width, value.height) ?? (tex ? textureSize(tex as Record<string, unknown>) : undefined)
  if (!size) return
  seen.set(uuid, {
    uuid,
    width: size.width,
    height: size.height,
    bytesPerPixel: BYTES_PER_PIXEL,
  })
}

function scanObjectForRenderTargets(
  obj: unknown,
  seen: Map<string, SnapshotTextureInput>,
  prefix: string,
): void {
  if (!obj || typeof obj !== 'object') return
  const rec = obj as Record<string, unknown>
  rememberRenderTarget(seen, rec, prefix)
  rememberRenderTarget(seen, rec.renderTarget, `${prefix}:renderTarget`)
  const shadow = rec.shadow as Record<string, unknown> | undefined
  if (shadow) rememberRenderTarget(seen, shadow.map, `${prefix}:shadow`)
}

/**
 * Walk a live scene + renderer for lights, unique textures, and render targets.
 * VRAM is omitted unless at least one asset has known pixel dimensions.
 */
export function collectHostSceneStats(
  scene: DoctorSceneLike | unknown,
  renderer: DoctorRendererLike | unknown,
): HostSceneCollection {
  const lights: Array<{ castShadow: boolean }> = []
  const seen = new Map<string, SnapshotTextureInput>()
  const traversable = scene as { traverse?: (cb: (object: Record<string, unknown>) => void) => void }
  if (typeof traversable.traverse === 'function') {
    let index = 0
    traversable.traverse((obj) => {
      index += 1
      if (obj.isLight === true) {
        lights.push({ castShadow: obj.castShadow === true })
      }
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
      mats.forEach((mat, i) => collectMaterialTextures(mat, seen, `m${index}-${i}`))
      scanObjectForRenderTargets(obj, seen, `obj${index}`)
    })
  }

  if (renderer && typeof renderer === 'object') {
    const rec = renderer as Record<string, unknown>
    for (const [key, value] of Object.entries(rec)) {
      rememberRenderTarget(seen, value, `renderer:${key}`)
    }
    scanObjectForRenderTargets(rec.shadowMap, seen, 'renderer:shadowMap')
  }

  const sized = [...seen.values()].filter((t) => t.width > 0 && t.height > 0)
  const stats: SceneStatsLike = {
    textureCount: seen.size,
    geometryCount:
      (renderer as { info?: { memory?: { geometries?: number } } })?.info?.memory?.geometries ?? 0,
    lightCount: lights.length,
    shadowCastingLightCount: lights.filter((l) => l.castShadow).length,
  }
  if (stats.geometryCount === 0) {
    const mem = (renderer as { info?: { memory?: { geometries?: number } } })?.info?.memory?.geometries
    if (typeof mem === 'number') stats.geometryCount = mem
  }
  if (sized.length > 0) {
    stats.estimatedVramBytes = sized.reduce(
      (sum, t) => sum + t.width * t.height * t.bytesPerPixel,
      0,
    )
  }
  if (stats.textureCount === 0) {
    const memTex = (renderer as { info?: { memory?: { textures?: number } } })?.info?.memory?.textures
    if (typeof memTex === 'number') stats.textureCount = memTex
  }

  return { stats, lights, textures: sized }
}
