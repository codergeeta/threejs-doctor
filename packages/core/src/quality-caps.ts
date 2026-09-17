import type { QualityKnobSet, QualityTier } from './quality-types.js'

export const TIER_ORDER: readonly QualityTier[] = ['potato', 'low', 'mid', 'high']

export const HYSTERESIS = {
  emergencyP95Ms: 50,
  dropP95Ms: 33.4,
  climbP95Ms: 22,
  dropWindows: 2,
  climbWindows: 3,
  cooldownWindows: 2,
  windowFrames: 90,
  ttfiBudgetMs: 3000,
  targetFps: 30,
} as const

export interface GenericTierCaps {
  pixelRatio: number
  drawingBufferPixels?: number
  shadowCasters?: number
  postfxOff: boolean
  toneMapping?: 0 | 1
  anisotropy?: number
}

export const GENERIC_CAPS: Record<QualityTier, GenericTierCaps> = {
  potato: {
    pixelRatio: 1.0,
    drawingBufferPixels: 1.2e6,
    shadowCasters: 0,
    postfxOff: true,
    toneMapping: 0,
    anisotropy: 1,
  },
  low: {
    pixelRatio: 1.25,
    drawingBufferPixels: 2.0e6,
    shadowCasters: 1,
    postfxOff: true,
    toneMapping: 1,
    anisotropy: 1,
  },
  mid: {
    pixelRatio: 1.5,
    drawingBufferPixels: 2.7e6,
    postfxOff: false,
    anisotropy: 4,
  },
  high: {
    pixelRatio: 2,
    postfxOff: false,
  },
}

/** Extra generic caps applied once when potato still misses 30 FPS. */
export const POTATO_FLOOR_CAPS = {
  pixelRatio: 0.5,
  drawingBufferPixels: 6e5,
  shadowCasters: 0,
  postfxOff: true,
} as const

/**
 * One more generic-cap nudge when the potato floor still misses 30 FPS
 * but avgFps is already in the high 20s. Do not apply meshLod/rtScale here.
 */
export const POTATO_NEAR_MISS_CAPS = {
  pixelRatio: 0.4,
  drawingBufferPixels: 5e5,
  shadowCasters: 0,
  postfxOff: true,
} as const

/** Inclusive lower bound for the high-20s near-miss floor nudge. */
export const POTATO_NEAR_MISS_MIN_AVG_FPS = 24

export const ADAPTER_KNOBS: Record<QualityTier, QualityKnobSet> = {
  potato: {
    fftSize: [64, 0, 0],
    spectrumEveryNFrames: 4,
    deferredHdr: true,
  },
  low: {
    fftSize: [128, 128, 128],
    spectrumEveryNFrames: 1,
    rtScale: 0.5,
    meshLod: 1,
    deferredHdr: true,
  },
  mid: {
    fftSize: [128, 256, 128],
    spectrumEveryNFrames: 1,
    rtScale: 0.7,
    meshLod: 2,
    deferredHdr: false,
  },
  high: {
    fftSize: [128, 256, 128],
    spectrumEveryNFrames: 1,
    rtScale: 1.0,
    meshLod: 2,
    deferredHdr: false,
  },
}
