import type { DeviceCapabilities, PassId, Profile, QualityTier, RendererInfoLike } from '@threejs-doctor/core'

export interface DoctorRendererLike {
  info: RendererInfoLike
  /** Optional duck-typed field. Real THREE.WebGLRenderer has getPixelRatio(), not this. */
  pixelRatio?: number | undefined
  antialias?: boolean | undefined
  setPixelRatio(value: number): void
  getPixelRatio?: () => number | undefined
  render?: (scene: unknown, camera: unknown) => void
  getContext?: () => {
    getContextAttributes?: () => { antialias?: boolean } | null
    drawingBufferWidth?: number
    drawingBufferHeight?: number
    getExtension?: (name: string) => unknown
    getParameter?: (pname: number) => unknown
    MAX_TEXTURE_SIZE?: number
    MAX_RENDERBUFFER_SIZE?: number
  } | null
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
  geometry?: {
    uuid?: string
    boundingBox?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
    boundingSphere?: { radius: number }
    computeBoundingBox?: () => void
  }
  material?: { uuid?: string } | Array<{ uuid?: string }>
  position?: { distanceTo: (v: { x: number; y: number; z: number }) => number }
  matrixWorld?: { elements: ArrayLike<number> }
  getWorldPosition?: (target: { x: number; y: number; z: number }) => { x: number; y: number; z: number }
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
