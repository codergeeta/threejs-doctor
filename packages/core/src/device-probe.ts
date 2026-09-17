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

export function readWebglQualitySignals(
  gl: { getExtension(name: string): unknown } | undefined,
): Pick<DeviceProbeInput, 'colorBufferFloat' | 'floatLinear'> {
  if (!gl) return {}
  return {
    colorBufferFloat: Boolean(gl.getExtension('EXT_color_buffer_float')),
    floatLinear: Boolean(gl.getExtension('OES_texture_float_linear')),
  }
}
