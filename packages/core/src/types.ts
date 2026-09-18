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
  'frameloop-demand',
] as const

/** One-shot passes that are not safe by default (world-space distance-cull hides permanently). */
export const AGGRESSIVE_PASSES: readonly PassId[] = ['distance-cull'] as const

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
  triangles: number
  textureCount: number
  estimatedVramBytes: number
  geometryCount: number
  lightCount: number
  shadowCastingLightCount: number
  simPassCount?: number
  bytesLoaded?: number
  compileMs?: number
  drawingBufferPixels?: number
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
}

export interface RendererInfoLike {
  render: { calls: number; triangles: number }
  memory: { geometries: number; textures: number }
}
