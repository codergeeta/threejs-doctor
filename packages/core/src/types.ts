export type Profile = 'marketing' | 'product' | 'game' | 'cad' | 'auto'
export type Mode = 'diagnose' | 'optimize' | 'benchmark'
export type DeviceTier = 'low' | 'mid' | 'high'
export type Severity = 'info' | 'warn' | 'error'
export type PassId =
  | 'dpr-cap'
  | 'pixel-budget'
  | 'shadow-budget'
  | 'postfx-budget'
  | 'tone-map-lite'
  | 'anisotropy-cap'
  | 'frameloop-demand'
  | 'distance-cull'
  | 'material-downgrade'

export const SAFE_PASSES: readonly PassId[] = [
  'dpr-cap',
  'pixel-budget',
  'shadow-budget',
  'postfx-budget',
  'tone-map-lite',
  'anisotropy-cap',
] as const

/** One-shot passes that are not safe by default (world-space distance-cull hides permanently). */
export const AGGRESSIVE_PASSES: readonly PassId[] = ['distance-cull'] as const

/** Marketing/product (static) scenes may demand-loop; games and CAD keep the host RAF. */
export function isStaticDemandProfile(profile: Profile): boolean {
  return profile === 'marketing' || profile === 'product'
}

/**
 * Default Quality Ladder / Doctor `apply: ['safe']` set.
 * `frameloop-demand` is omitted unless the profile is clearly marketing/product,
 * or the host opts in via `optimize({ apply: ['frameloop-demand'] })`.
 */
export function safePassesFor(profile: Profile): PassId[] {
  if (isStaticDemandProfile(profile)) {
    return [...SAFE_PASSES, 'frameloop-demand']
  }
  return [...SAFE_PASSES]
}

export interface DeviceCapabilities {
  tier: DeviceTier
  maxTextureSize: number
  webgl: boolean
  webgpu: boolean
  devicePixelRatio: number
  hardwareConcurrency: number
  deviceMemory?: number
  maxTouchPoints?: number
  coarsePointer?: boolean
  prefersReducedData?: boolean
  colorBufferFloat?: boolean
  floatLinear?: boolean
  maxRenderbufferSize?: number
}

export interface MetricsSample {
  avgFps: number
  p95FrameTimeMs: number
  drawCalls: number
  /** Drawn triangles from renderer.info.render.triangles (never invented). */
  triangles: number
  textureCount: number
  estimatedVramBytes?: number | undefined
  geometryCount: number
  lightCount: number
  shadowCastingLightCount: number
  simPassCount?: number
  bytesLoaded?: number
  compileMs?: number
  drawingBufferPixels?: number
  /** GPU elapsed ms from EXT_disjoint_timer_query_webgl2 when a result is actually available. */
  gpuFrameTimeMs?: number | undefined
  /** Live run was hidden or rAF-throttled; do not treat this sample as a score win. */
  invalid?: boolean | undefined
  invalidReason?: string | undefined
}

export interface SceneSnapshot {
  objectCount: number
  meshCount: number
  geometryCount: number
  materialCount: number
  textureCount: number
  estimatedVramBytes: number
  lightCount: number
  shadowCastingLightCount: number
  drawCalls: number
  triangles: number
  maxTextureDimension: number
  continuousFrameloop: boolean
  matrixAutoUpdateCount: number
  /** Finite renderer DPR when known; omitted/undefined means do not flag uncapped-dpr. */
  rendererPixelRatio?: number | undefined
  /** MSAA flag from GL context attributes when known. */
  antialias?: boolean | undefined
  /**
   * Scene-graph triangle attribution: indexed/non-indexed geometry × InstancedMesh.count.
   * Used to name top contributors. Cost / score / triangles/too-many use `triangles` (drawn).
   * Omitted when no mesh geometry could be counted.
   */
  geometryTriangleCount?: number | undefined
  /** Top contributor as `name:triangles` (first of top-N). Omitted when none counted. */
  triangleContributorSummary?: string | undefined
  topContributorShare?: number | undefined
  frustumCulledDisabledCount?: number | undefined
  /**
   * Meshes whose world bounding-sphere radius is greater than `camera.far`.
   * InstancedMesh uses computeBoundingSphere() (instance-aware), not the prototype sphere.
   * Omitted when camera.far or a bounding sphere cannot be read.
   */
  oversizedBoundCount?: number | undefined
  shadowTriangleCount?: number | undefined
  /** Casters fully outside every detectable shadow camera. Omitted when no shadow camera is testable. */
  shadowCastersOutsideFrustum?: number | undefined
  zeroIntensityLightCount?: number | undefined
  instancedBufferBytes?: number | undefined
  /** InstancedMesh removed from the graph without dispose(). */
  removedUndisposedInstancedCount?: number | undefined
  composerPixelRatio?: number | undefined
  composerWidth?: number | undefined
  composerHeight?: number | undefined
  drawingBufferWidth?: number | undefined
  drawingBufferHeight?: number | undefined
  /** Copied from a measured sample only when EXT_disjoint_timer_query_webgl2 returned a result. */
  gpuFrameTimeMs?: number | undefined
}

export interface RendererInfoLike {
  render: { calls: number; triangles: number; points?: number | undefined }
  memory: { geometries: number; textures: number }
  autoReset?: boolean | undefined
  reset?: () => void
}
