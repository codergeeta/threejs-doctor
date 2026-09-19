import type { DeviceCapabilities } from '@threejs-doctor/core'

export function deviceFromBudget(budget: 'low' | 'mid' | 'high'): DeviceCapabilities {
  if (budget === 'high') {
    return {
      tier: 'high',
      maxTextureSize: 8192,
      webgl: true,
      webgpu: true,
      devicePixelRatio: 2,
      hardwareConcurrency: 12,
    }
  }
  if (budget === 'mid') {
    return {
      tier: 'mid',
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
    }
  }
  return {
    tier: 'low',
    maxTextureSize: 4096,
    webgl: true,
    webgpu: false,
    devicePixelRatio: 2,
    hardwareConcurrency: 4,
  }
}
