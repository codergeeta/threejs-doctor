import type { DeviceCapabilities } from './types.js'
import type { DeviceProbeInput } from './device-probe.js'
import type { QualityTier } from './quality-types.js'

export interface StartTierResult {
  startTier: QualityTier
  maxTier: QualityTier
  mobile: boolean
  noFloatRt: boolean
}

export function isMobileSignal(input: {
  maxTouchPoints?: number
  coarsePointer?: boolean
  deviceMemory?: number
  devicePixelRatio: number
  hardwareConcurrency: number
}): boolean {
  if ((input.maxTouchPoints ?? 0) >= 1) return true
  if (input.coarsePointer === true) return true
  if (
    input.deviceMemory !== undefined &&
    input.deviceMemory <= 8 &&
    input.devicePixelRatio >= 2 &&
    input.hardwareConcurrency <= 8
  ) {
    return true
  }
  return false
}

export function resolveStartTier(
  caps: DeviceCapabilities,
  opts: Partial<DeviceProbeInput> = {},
): StartTierResult {
  const deviceMemory = opts.deviceMemory ?? caps.deviceMemory
  const maxTouchPoints = opts.maxTouchPoints ?? caps.maxTouchPoints
  const coarsePointer = opts.coarsePointer ?? caps.coarsePointer
  const colorBufferFloat = opts.colorBufferFloat ?? caps.colorBufferFloat
  const floatLinear = opts.floatLinear ?? caps.floatLinear
  const devicePixelRatio = opts.devicePixelRatio ?? caps.devicePixelRatio
  const hardwareConcurrency = opts.hardwareConcurrency ?? caps.hardwareConcurrency
  const webgl = opts.webgl ?? caps.webgl

  if (!webgl) {
    throw new Error('webgl required for quality ladder')
  }

  const mobileInput: Parameters<typeof isMobileSignal>[0] = {
    devicePixelRatio,
    hardwareConcurrency,
  }
  if (maxTouchPoints !== undefined) mobileInput.maxTouchPoints = maxTouchPoints
  if (coarsePointer !== undefined) mobileInput.coarsePointer = coarsePointer
  if (deviceMemory !== undefined) mobileInput.deviceMemory = deviceMemory
  const mobile = isMobileSignal(mobileInput)

  if (colorBufferFloat === false) {
    return { startTier: 'potato', maxTier: 'potato', mobile, noFloatRt: true }
  }

  if (mobile) {
    const potatoClass =
      deviceMemory === undefined ||
      deviceMemory <= 4 ||
      hardwareConcurrency <= 4 ||
      floatLinear === false
    if (potatoClass) {
      return { startTier: 'potato', maxTier: 'mid', mobile: true, noFloatRt: false }
    }
    return { startTier: 'low', maxTier: 'mid', mobile: true, noFloatRt: false }
  }

  if (caps.tier === 'low') {
    return { startTier: 'low', maxTier: 'high', mobile: false, noFloatRt: false }
  }
  if (caps.tier === 'mid') {
    return { startTier: 'mid', maxTier: 'high', mobile: false, noFloatRt: false }
  }
  return { startTier: 'high', maxTier: 'high', mobile: false, noFloatRt: false }
}
