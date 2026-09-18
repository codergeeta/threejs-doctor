import {
  probeDevice,
  readWebglQualitySignals,
  type DeviceCapabilities,
  type DeviceProbeInput,
} from '@threejs-doctor/core'

/** Phone-class overlay for live-attach. Never includes WEBGL_debug_renderer_info. */
export const PHONE_CLASS_PROBE: Partial<DeviceProbeInput> = {
  maxTouchPoints: 5,
  coarsePointer: true,
  deviceMemory: 4,
  devicePixelRatio: 3,
  webgpu: false,
}

export type AttachDeviceOption = 'phone' | Partial<DeviceProbeInput>

const BLOCKED_GL_EXTENSIONS = new Set([
  'WEBGL_debug_renderer_info',
  'UNMASKED_RENDERER_WEBGL',
  'UNMASKED_VENDOR_WEBGL',
])

function collectLiveProbe(renderer?: {
  getExtension?: (name: string) => unknown
  pixelRatio?: number
}): Partial<DeviceProbeInput> {
  const partial: Partial<DeviceProbeInput> = { webgl: true }
  const hostDpr = (globalThis as { devicePixelRatio?: unknown }).devicePixelRatio
  if (typeof hostDpr === 'number') partial.devicePixelRatio = hostDpr
  else if (typeof renderer?.pixelRatio === 'number') partial.devicePixelRatio = renderer.pixelRatio

  if (typeof navigator !== 'undefined') {
    if (typeof navigator.hardwareConcurrency === 'number') {
      partial.hardwareConcurrency = navigator.hardwareConcurrency
    }
    const nav = navigator as Navigator & { deviceMemory?: number }
    if (typeof nav.deviceMemory === 'number') partial.deviceMemory = nav.deviceMemory
    if (typeof nav.maxTouchPoints === 'number') partial.maxTouchPoints = nav.maxTouchPoints
  }
  if (typeof matchMedia === 'function') {
    try {
      partial.coarsePointer = matchMedia('(pointer: coarse)').matches
    } catch {
      // ignore
    }
  }

  const getExtension = renderer?.getExtension
  if (typeof getExtension === 'function') {
    const signals = readWebglQualitySignals({
      getExtension(name: string) {
        if (BLOCKED_GL_EXTENSIONS.has(name)) return null
        return getExtension.call(renderer, name)
      },
    })
    if (signals.colorBufferFloat !== undefined) partial.colorBufferFloat = signals.colorBufferFloat
    if (signals.floatLinear !== undefined) partial.floatLinear = signals.floatLinear
  }
  return partial
}

/**
 * Merge a live-attach `device` overlay onto live probe signals.
 * Returns undefined when the caller did not request an overlay (Doctor probes itself).
 */
export function resolveAttachDevice(
  option: AttachDeviceOption | undefined,
  renderer?: { getExtension?: (name: string) => unknown; pixelRatio?: number },
): DeviceCapabilities | undefined {
  if (option === undefined) return undefined
  const overlay: Partial<DeviceProbeInput> = option === 'phone' ? { ...PHONE_CLASS_PROBE } : { ...option }
  const live = collectLiveProbe(renderer)
  const merged: Partial<DeviceProbeInput> = {
    ...live,
    ...overlay,
    webgl: overlay.webgl ?? live.webgl ?? true,
  }
  return probeDevice(merged)
}
