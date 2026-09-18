import type { SceneStatsLike, SceneSnapshot } from '@threejs-doctor/core'
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

export interface HostSceneInsights {
  geometryTriangleCount?: number
  triangleContributorSummary?: string
  topContributorShare?: number
  frustumCulledDisabledCount?: number
  oversizedBoundCount?: number
  shadowTriangleCount?: number
  shadowCastersOutsideFrustum?: number
  zeroIntensityLightCount?: number
  instancedBufferBytes?: number
  composerPixelRatio?: number
  composerWidth?: number
  composerHeight?: number
  drawingBufferWidth?: number
  drawingBufferHeight?: number
}

export interface HostSceneCollection {
  stats: SceneStatsLike
  lights: Array<{ castShadow: boolean }>
  textures: SnapshotTextureInput[]
  insights: HostSceneInsights
}

export interface HostCameraLike {
  far?: number
  matrixWorld?: { elements?: ArrayLike<number> }
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

function geometryTriangles(geo: unknown): number | undefined {
  if (!geo || typeof geo !== 'object') return undefined
  const rec = geo as {
    index?: { count?: unknown }
    attributes?: { position?: { count?: unknown } }
  }
  if (typeof rec.index?.count === 'number' && Number.isFinite(rec.index.count) && rec.index.count >= 3) {
    return Math.floor(rec.index.count / 3)
  }
  const pos = rec.attributes?.position?.count
  if (typeof pos === 'number' && Number.isFinite(pos) && pos >= 3) {
    return Math.floor(pos / 3)
  }
  return undefined
}

function meshTriangles(obj: Record<string, unknown>): number | undefined {
  const base = geometryTriangles(obj.geometry)
  if (base === undefined) return undefined
  if (obj.isInstancedMesh === true) {
    const count = typeof obj.count === 'number' && Number.isFinite(obj.count) && obj.count > 0 ? obj.count : 1
    return base * count
  }
  return base
}

function meshLabel(obj: Record<string, unknown>, fallback: string): string {
  if (typeof obj.name === 'string' && obj.name.length > 0) return obj.name
  if (typeof obj.uuid === 'string' && obj.uuid.length > 0) return obj.uuid
  return fallback
}

function instancedBufferBytes(obj: Record<string, unknown>): number | undefined {
  if (obj.isInstancedMesh !== true) return undefined
  let bytes = 0
  let known = false
  const matrix = obj.instanceMatrix as { array?: { byteLength?: unknown }; count?: unknown } | undefined
  if (typeof matrix?.array?.byteLength === 'number') {
    bytes += matrix.array.byteLength
    known = true
  } else if (typeof obj.count === 'number' && obj.count >= 0) {
    bytes += obj.count * 16 * 4
    known = true
  }
  const color = obj.instanceColor as { array?: { byteLength?: unknown } } | undefined
  if (typeof color?.array?.byteLength === 'number') {
    bytes += color.array.byteLength
    known = true
  }
  return known ? bytes : undefined
}

function worldScale(elements: ArrayLike<number>): number {
  const sx = Math.hypot(Number(elements[0]), Number(elements[1]), Number(elements[2]))
  const sy = Math.hypot(Number(elements[4]), Number(elements[5]), Number(elements[6]))
  const sz = Math.hypot(Number(elements[8]), Number(elements[9]), Number(elements[10]))
  return Math.max(sx, sy, sz, 0)
}

function worldRadius(obj: Record<string, unknown>): number | undefined {
  const geo = obj.geometry as { boundingSphere?: { radius?: unknown } } | undefined
  const radius = geo?.boundingSphere?.radius
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0) return undefined
  const elements = (obj.matrixWorld as { elements?: ArrayLike<number> } | undefined)?.elements
  const scale = elements && elements.length >= 12 ? worldScale(elements) : 1
  return radius * (scale > 0 ? scale : 1)
}

function worldCenter(obj: Record<string, unknown>): [number, number, number] | undefined {
  const elements = (obj.matrixWorld as { elements?: ArrayLike<number> } | undefined)?.elements
  if (!elements || elements.length < 16) return undefined
  const local = (obj.geometry as { boundingSphere?: { center?: { x?: unknown; y?: unknown; z?: unknown } } } | undefined)
    ?.boundingSphere?.center
  if (
    local &&
    typeof local.x === 'number' &&
    typeof local.y === 'number' &&
    typeof local.z === 'number'
  ) {
    return transformPoint(elements, local.x, local.y, local.z)
  }
  return [Number(elements[12]), Number(elements[13]), Number(elements[14])]
}

function transformPoint(
  m: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const w = Number(m[3]) * x + Number(m[7]) * y + Number(m[11]) * z + Number(m[15]) || 1
  return [
    (Number(m[0]) * x + Number(m[4]) * y + Number(m[8]) * z + Number(m[12])) / w,
    (Number(m[1]) * x + Number(m[5]) * y + Number(m[9]) * z + Number(m[13])) / w,
    (Number(m[2]) * x + Number(m[6]) * y + Number(m[10]) * z + Number(m[14])) / w,
  ]
}

function invert4(m: ArrayLike<number>): number[] | undefined {
  if (m.length < 16) return undefined
  const a00 = Number(m[0])
  const a01 = Number(m[1])
  const a02 = Number(m[2])
  const a03 = Number(m[3])
  const a10 = Number(m[4])
  const a11 = Number(m[5])
  const a12 = Number(m[6])
  const a13 = Number(m[7])
  const a20 = Number(m[8])
  const a21 = Number(m[9])
  const a22 = Number(m[10])
  const a23 = Number(m[11])
  const a30 = Number(m[12])
  const a31 = Number(m[13])
  const a32 = Number(m[14])
  const a33 = Number(m[15])

  const b00 = a00 * a11 - a01 * a10
  const b01 = a00 * a12 - a02 * a10
  const b02 = a00 * a13 - a03 * a10
  const b03 = a01 * a12 - a02 * a11
  const b04 = a01 * a13 - a03 * a11
  const b05 = a02 * a13 - a03 * a12
  const b06 = a20 * a31 - a21 * a30
  const b07 = a20 * a32 - a22 * a30
  const b08 = a20 * a33 - a23 * a30
  const b09 = a21 * a32 - a22 * a31
  const b10 = a21 * a33 - a23 * a31
  const b11 = a22 * a33 - a23 * a32

  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) return undefined
  const invDet = 1 / det
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * invDet,
    (a02 * b10 - a01 * b11 - a03 * b09) * invDet,
    (a31 * b05 - a32 * b04 + a33 * b03) * invDet,
    (a22 * b04 - a21 * b05 - a23 * b03) * invDet,
    (a12 * b08 - a10 * b11 - a13 * b07) * invDet,
    (a00 * b11 - a02 * b08 + a03 * b07) * invDet,
    (a32 * b02 - a30 * b05 - a33 * b01) * invDet,
    (a20 * b05 - a22 * b02 + a23 * b01) * invDet,
    (a10 * b10 - a11 * b08 + a13 * b06) * invDet,
    (a01 * b08 - a00 * b10 - a03 * b06) * invDet,
    (a30 * b04 - a31 * b02 + a33 * b00) * invDet,
    (a21 * b02 - a20 * b04 - a23 * b00) * invDet,
    (a11 * b07 - a10 * b09 - a12 * b06) * invDet,
    (a00 * b09 - a01 * b07 + a02 * b06) * invDet,
    (a31 * b01 - a30 * b03 - a32 * b00) * invDet,
    (a20 * b03 - a21 * b01 + a22 * b00) * invDet,
  ]
}

interface ShadowCameraBox {
  kind: 'ortho' | 'perspective'
  invWorld: number[]
  left?: number
  right?: number
  top?: number
  bottom?: number
  near: number
  far: number
  fov?: number
  aspect?: number
}

function readShadowCamera(light: Record<string, unknown>): ShadowCameraBox | undefined {
  const shadow = light.shadow as { camera?: Record<string, unknown> } | undefined
  const cam = shadow?.camera
  if (!cam) return undefined
  const near = cam.near
  const far = cam.far
  if (typeof near !== 'number' || typeof far !== 'number') return undefined
  const elements = (cam.matrixWorld as { elements?: ArrayLike<number> } | undefined)?.elements
  if (!elements) return undefined
  const invWorld = invert4(elements)
  if (!invWorld) return undefined
  if (
    cam.isOrthographicCamera === true ||
    (typeof cam.left === 'number' &&
      typeof cam.right === 'number' &&
      typeof cam.top === 'number' &&
      typeof cam.bottom === 'number')
  ) {
    if (
      typeof cam.left !== 'number' ||
      typeof cam.right !== 'number' ||
      typeof cam.top !== 'number' ||
      typeof cam.bottom !== 'number'
    ) {
      return undefined
    }
    return {
      kind: 'ortho',
      invWorld,
      left: cam.left,
      right: cam.right,
      top: cam.top,
      bottom: cam.bottom,
      near,
      far,
    }
  }
  if (typeof cam.fov === 'number' && typeof cam.aspect === 'number') {
    return { kind: 'perspective', invWorld, near, far, fov: cam.fov, aspect: cam.aspect }
  }
  return undefined
}

function sphereOutsideShadowCamera(
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  cam: ShadowCameraBox,
): boolean {
  const [x, y, z] = transformPoint(cam.invWorld, cx, cy, cz)
  if (cam.kind === 'ortho') {
    const left = cam.left!
    const right = cam.right!
    const top = cam.top!
    const bottom = cam.bottom!
    const zMin = Math.min(-cam.near, -cam.far)
    const zMax = Math.max(-cam.near, -cam.far)
    if (x + radius < left || x - radius > right) return true
    if (y + radius < bottom || y - radius > top) return true
    if (z + radius < zMin || z - radius > zMax) return true
    return false
  }
  const dist = -z
  if (dist + radius < cam.near || dist - radius > cam.far) return true
  const vFov = ((cam.fov ?? 75) * Math.PI) / 180
  const hy = Math.tan(vFov / 2) * Math.max(dist, cam.near)
  const hx = hy * (cam.aspect ?? 1)
  if (Math.abs(x) - radius > hx || Math.abs(y) - radius > hy) return true
  return false
}

function isComposerLike(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const rec = value as Record<string, unknown>
  if (rec.isEffectComposer === true) return true
  const hasPasses = Array.isArray(rec.passes)
  const hasTarget = rec.renderTarget1 !== undefined || rec.writeBuffer !== undefined
  return hasPasses && hasTarget
}

function rememberComposer(target: { current?: Record<string, unknown> }, value: unknown): void {
  if (target.current || !isComposerLike(value)) return
  target.current = value
}

function readComposerSize(composer: Record<string, unknown>): {
  width?: number
  height?: number
  pixelRatio?: number
} {
  const rt =
    (composer.renderTarget1 as { width?: unknown; height?: unknown } | undefined) ??
    (composer.writeBuffer as { width?: unknown; height?: unknown } | undefined)
  const size = rt ? finiteSize(rt.width, rt.height) : undefined
  const pr = composer.pixelRatio ?? composer._pixelRatio
  const out: { width?: number; height?: number; pixelRatio?: number } = {}
  if (size) {
    out.width = size.width
    out.height = size.height
  }
  if (typeof pr === 'number' && Number.isFinite(pr) && pr > 0) out.pixelRatio = pr
  return out
}

function assignDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) target[key] = value
}

/**
 * Walk a live scene + renderer for lights, unique textures, render targets, and P2 insights.
 * VRAM and P2 fields are omitted unless they can be counted from the graph.
 */
export function collectHostSceneStats(
  scene: DoctorSceneLike | unknown,
  renderer: DoctorRendererLike | unknown,
  camera?: HostCameraLike | unknown,
): HostSceneCollection {
  const lights: Array<{ castShadow: boolean }> = []
  const seen = new Map<string, SnapshotTextureInput>()
  const insights: HostSceneInsights = {}
  const contributors: Array<{ id: string; triangles: number; castShadow: boolean }> = []
  const shadowCameras: ShadowCameraBox[] = []
  const casters: Array<{ center: [number, number, number]; radius: number }> = []
  const composerRef: { current?: Record<string, unknown> } = {}
  let frustumCulledDisabledCount = 0
  let oversizedBoundCount = 0
  let oversizedMeasured = false
  let zeroIntensityLightCount = 0
  let instancedBytes = 0
  let instancedKnown = false
  let shadowTriangles = 0
  let shadowTriKnown = false

  const camFar =
    camera && typeof camera === 'object' && typeof (camera as HostCameraLike).far === 'number'
      ? (camera as HostCameraLike).far
      : undefined

  const traversable = scene as { traverse?: (cb: (object: Record<string, unknown>) => void) => void }
  if (typeof traversable.traverse === 'function') {
    let index = 0
    traversable.traverse((obj) => {
      index += 1
      rememberComposer(composerRef, obj)
      if (obj.isLight === true) {
        lights.push({ castShadow: obj.castShadow === true })
        if (obj.visible !== false && typeof obj.intensity === 'number' && obj.intensity <= 0) {
          zeroIntensityLightCount += 1
        }
        if (obj.castShadow === true) {
          const shadowCam = readShadowCamera(obj)
          if (shadowCam) shadowCameras.push(shadowCam)
        }
      }
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
      mats.forEach((mat, i) => collectMaterialTextures(mat, seen, `m${index}-${i}`))
      scanObjectForRenderTargets(obj, seen, `obj${index}`)

      if (obj.isMesh === true) {
        if (obj.frustumCulled === false) frustumCulledDisabledCount += 1
        const tris = meshTriangles(obj)
        if (tris !== undefined) {
          contributors.push({
            id: meshLabel(obj, `mesh${index}`),
            triangles: tris,
            castShadow: obj.castShadow === true,
          })
          if (obj.castShadow === true) {
            shadowTriangles += tris
            shadowTriKnown = true
          }
        }
        const radius = worldRadius(obj)
        if (typeof camFar === 'number' && camFar > 0 && radius !== undefined) {
          oversizedMeasured = true
          if (radius > camFar) oversizedBoundCount += 1
        }
        if (obj.castShadow === true) {
          const center = worldCenter(obj)
          if (center && radius !== undefined) casters.push({ center, radius })
        }
        const bytes = instancedBufferBytes(obj)
        if (bytes !== undefined) {
          instancedBytes += bytes
          instancedKnown = true
        }
      }
    })
  }

  if (renderer && typeof renderer === 'object') {
    const rec = renderer as Record<string, unknown>
    rememberComposer(composerRef, rec)
    for (const [key, value] of Object.entries(rec)) {
      rememberRenderTarget(seen, value, `renderer:${key}`)
      rememberComposer(composerRef, value)
    }
    scanObjectForRenderTargets(rec.shadowMap, seen, 'renderer:shadowMap')
    if (typeof rec.drawingBufferWidth === 'number') insights.drawingBufferWidth = rec.drawingBufferWidth
    if (typeof rec.drawingBufferHeight === 'number') insights.drawingBufferHeight = rec.drawingBufferHeight
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

  if (contributors.length > 0) {
    const total = contributors.reduce((sum, c) => sum + c.triangles, 0)
    insights.geometryTriangleCount = total
    contributors.sort((a, b) => b.triangles - a.triangles)
    const top = contributors[0]
    if (top && total > 0) {
      insights.triangleContributorSummary = `${top.id}:${top.triangles}`
      insights.topContributorShare = top.triangles / total
    }
  }
  insights.frustumCulledDisabledCount = frustumCulledDisabledCount
  if (oversizedMeasured) insights.oversizedBoundCount = oversizedBoundCount
  if (shadowTriKnown) insights.shadowTriangleCount = shadowTriangles
  if (shadowCameras.length > 0) {
    let outside = 0
    for (const caster of casters) {
      const missesAll = shadowCameras.every((cam) =>
        sphereOutsideShadowCamera(caster.center[0], caster.center[1], caster.center[2], caster.radius, cam),
      )
      if (missesAll) outside += 1
    }
    insights.shadowCastersOutsideFrustum = outside
  }
  insights.zeroIntensityLightCount = zeroIntensityLightCount
  if (instancedKnown) insights.instancedBufferBytes = instancedBytes

  if (composerRef.current) {
    const size = readComposerSize(composerRef.current)
    assignDefined(insights, 'composerWidth', size.width)
    assignDefined(insights, 'composerHeight', size.height)
    assignDefined(insights, 'composerPixelRatio', size.pixelRatio)
  }

  return { stats, lights, textures: sized, insights }
}

const INSIGHT_KEYS: Array<keyof HostSceneInsights> = [
  'geometryTriangleCount',
  'triangleContributorSummary',
  'topContributorShare',
  'frustumCulledDisabledCount',
  'oversizedBoundCount',
  'shadowTriangleCount',
  'shadowCastersOutsideFrustum',
  'zeroIntensityLightCount',
  'instancedBufferBytes',
  'composerPixelRatio',
  'composerWidth',
  'composerHeight',
  'drawingBufferWidth',
  'drawingBufferHeight',
]

/** Copy measured P2 fields onto a snapshot; skip omitted values. */
export function applyHostInsights(snapshot: SceneSnapshot, insights: HostSceneInsights): SceneSnapshot {
  const next = { ...snapshot }
  for (const key of INSIGHT_KEYS) {
    const value = insights[key]
    if (value !== undefined) {
      ;(next as unknown as Record<string, unknown>)[key] = value
    }
  }
  return next
}
