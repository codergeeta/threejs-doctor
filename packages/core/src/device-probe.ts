import type { DeviceCapabilities, DeviceTier } from './types.js'

export interface DeviceProbeInput {
  devicePixelRatio: number
  hardwareConcurrency: number
  maxTextureSize: number
  webgl: boolean
  webgpu: boolean
  deviceMemory?: number
  maxTouchPoints?: number
  coarsePointer?: boolean
  prefersReducedData?: boolean
  colorBufferFloat?: boolean
  floatLinear?: boolean
  maxRenderbufferSize?: number
}

const GL_MAX_TEXTURE_SIZE = 0x0d33
const GL_MAX_RENDERBUFFER_SIZE = 0x84e8

function classifyTier(input: DeviceProbeInput): DeviceTier {
  const score =
    (input.hardwareConcurrency >= 12 ? 2 : input.hardwareConcurrency >= 8 ? 1 : 0) +
    (input.maxTextureSize >= 8192 ? 2 : input.maxTextureSize >= 4096 ? 1 : 0) +
    (input.devicePixelRatio <= 1.5 ? 1 : 0) +
    (input.webgpu ? 1 : 0)
  if (score >= 5) return 'high'
  if (score >= 3) return 'mid'
  return 'low'
}

function assignOptional(
  caps: DeviceCapabilities,
  partial: Partial<DeviceProbeInput>,
): void {
  if (partial.deviceMemory !== undefined) caps.deviceMemory = partial.deviceMemory
  if (partial.maxTouchPoints !== undefined) caps.maxTouchPoints = partial.maxTouchPoints
  if (partial.coarsePointer !== undefined) caps.coarsePointer = partial.coarsePointer
  if (partial.prefersReducedData !== undefined) {
    caps.prefersReducedData = partial.prefersReducedData
  }
  if (partial.colorBufferFloat !== undefined) caps.colorBufferFloat = partial.colorBufferFloat
  if (partial.floatLinear !== undefined) caps.floatLinear = partial.floatLinear
  if (partial.maxRenderbufferSize !== undefined) {
    caps.maxRenderbufferSize = partial.maxRenderbufferSize
  }
}

export function probeDevice(partial: Partial<DeviceProbeInput> = {}): DeviceCapabilities {
  const input: DeviceProbeInput = {
    devicePixelRatio: partial.devicePixelRatio ?? 1,
    hardwareConcurrency: partial.hardwareConcurrency ?? 4,
    maxTextureSize: partial.maxTextureSize ?? 2048,
    webgl: partial.webgl ?? false,
    webgpu: partial.webgpu ?? false,
  }
  const caps: DeviceCapabilities = {
    tier: classifyTier(input),
    maxTextureSize: input.maxTextureSize,
    webgl: input.webgl,
    webgpu: input.webgpu,
    devicePixelRatio: input.devicePixelRatio,
    hardwareConcurrency: input.hardwareConcurrency,
  }
  assignOptional(caps, partial)
  return caps
}

export interface WebglQualitySource {
  getExtension(name: string): unknown
  getParameter?(pname: number): unknown
  MAX_TEXTURE_SIZE?: number
  MAX_RENDERBUFFER_SIZE?: number
}

function readPositiveParam(
  gl: WebglQualitySource,
  constant: number | undefined,
  fallbackPname: number,
): number | undefined {
  if (typeof gl.getParameter !== 'function') return undefined
  const pname = typeof constant === 'number' ? constant : fallbackPname
  try {
    const value = gl.getParameter(pname)
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  } catch {
    return undefined
  }
  return undefined
}

export function readWebglQualitySignals(
  gl: WebglQualitySource | undefined,
): Partial<
  Pick<DeviceProbeInput, 'colorBufferFloat' | 'floatLinear' | 'maxTextureSize' | 'maxRenderbufferSize'>
> {
  if (!gl) return {}
  const signals: Partial<
    Pick<DeviceProbeInput, 'colorBufferFloat' | 'floatLinear' | 'maxTextureSize' | 'maxRenderbufferSize'>
  > = {
    colorBufferFloat: Boolean(gl.getExtension('EXT_color_buffer_float')),
    floatLinear: Boolean(gl.getExtension('OES_texture_float_linear')),
  }
  const maxTextureSize = readPositiveParam(gl, gl.MAX_TEXTURE_SIZE, GL_MAX_TEXTURE_SIZE)
  if (maxTextureSize !== undefined) signals.maxTextureSize = maxTextureSize
  const maxRenderbufferSize = readPositiveParam(
    gl,
    gl.MAX_RENDERBUFFER_SIZE,
    GL_MAX_RENDERBUFFER_SIZE,
  )
  if (maxRenderbufferSize !== undefined) signals.maxRenderbufferSize = maxRenderbufferSize
  return signals
}
