import type { DeviceCapabilities, PassId, Profile, QualityTier } from '@threejs-doctor/core'

export interface DoctorRendererLike {
  info: {
    render: { calls: number; triangles: number }
    memory: { geometries: number; textures: number }
  }
  pixelRatio: number
  antialias?: boolean
  setPixelRatio(value: number): void
  getExtension?: (name: string) => unknown
  toneMapping?: number
  shadowMap?: { enabled: boolean }
  drawingBufferWidth?: number
  drawingBufferHeight?: number
  setDrawingBufferSize?: (width: number, height: number, pixelRatio: number) => void
}

export interface DoctorSceneLike {
  traverse(callback: (object: DoctorObjectLike) => void): void
  children: unknown[]
}

export interface DoctorObjectLike {
  castShadow?: boolean
  visible?: boolean
  isMesh?: boolean
  isLight?: boolean
  matrixAutoUpdate?: boolean
  geometry?: { uuid: string }
  material?: { uuid?: string } | Array<{ uuid?: string }>
  position?: { distanceTo: (v: { x: number; y: number; z: number }) => number }
}

export interface PassContext {
  renderer: DoctorRendererLike
  scene: DoctorSceneLike
  device: DeviceCapabilities
  profile: Exclude<Profile, 'auto'>
  postfxEnabled: boolean
  setPostfxEnabled?: (enabled: boolean) => void
  frameloop: 'always' | 'demand'
  setFrameloop: (mode: 'always' | 'demand') => void
  cameraPosition?: { x: number; y: number; z: number }
  cullDistance?: number
  qualityTier?: QualityTier
}

export interface PassHandle {
  rollback(): void
}

export interface OptimizePass {
  id: PassId
  apply(ctx: PassContext): PassHandle
}
