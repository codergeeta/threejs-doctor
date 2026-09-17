import type { MetricsSample } from '@threejs-doctor/core'

export interface OverlayHandle {
  unmount(): void
  refresh?: () => void
}

export interface MountOverlayOptions {
  getScore: () => number
  getBaseline: () => MetricsSample | undefined
  getAfter?: () => MetricsSample | undefined
}

export function mountOverlay(_opts: MountOverlayOptions): OverlayHandle {
  return { unmount() {} }
}
