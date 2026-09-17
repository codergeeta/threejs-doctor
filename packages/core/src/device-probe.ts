import type { DeviceCapabilities, DeviceTier } from './types.js'

export interface DeviceProbeInput {
  devicePixelRatio: number
  hardwareConcurrency: number
  maxTextureSize: number
  webgl: boolean
  webgpu: boolean
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

export function probeDevice(partial: Partial<DeviceProbeInput> = {}): DeviceCapabilities {
  const input: DeviceProbeInput = {
    devicePixelRatio: partial.devicePixelRatio ?? 1,
    hardwareConcurrency: partial.hardwareConcurrency ?? 4,
    maxTextureSize: partial.maxTextureSize ?? 2048,
    webgl: partial.webgl ?? false,
    webgpu: partial.webgpu ?? false,
  }
  return {
    tier: classifyTier(input),
    maxTextureSize: input.maxTextureSize,
    webgl: input.webgl,
    webgpu: input.webgpu,
    devicePixelRatio: input.devicePixelRatio,
    hardwareConcurrency: input.hardwareConcurrency,
  }
}
