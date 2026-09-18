import { describe, it, expect } from 'vitest'
import {
  ADAPTER_KNOBS,
  POTATO_FLOOR_CAPS,
  POTATO_HOPELESS_CAPS,
  POTATO_HOPELESS_MAX_AVG_FPS,
  POTATO_NEAR_MISS_CAPS,
  POTATO_OCEAN_FREEZE_EFFECT_QUALITY,
  POTATO_OCEAN_FREEZE_FFT_SIZE,
  POTATO_OCEAN_FREEZE_MAX_AVG_FPS,
} from '../quality-caps.js'

describe('ADAPTER_KNOBS', () => {
  it('omits meshLod and rtScale from potato (RT resize breaks WebGL)', () => {
    expect(ADAPTER_KNOBS.potato.meshLod).toBeUndefined()
    expect(ADAPTER_KNOBS.potato.rtScale).toBeUndefined()
    expect(ADAPTER_KNOBS.potato.spectrumEveryNFrames).toBe(8)
    expect(ADAPTER_KNOBS.potato.deferredHdr).toBe(true)
    expect(ADAPTER_KNOBS.potato.fftSize).toEqual([64, 0, 0])
  })

  it('keeps rtScale on non-potato tiers', () => {
    expect(ADAPTER_KNOBS.low.rtScale).toBe(0.5)
    expect(ADAPTER_KNOBS.mid.rtScale).toBe(0.7)
    expect(ADAPTER_KNOBS.high.rtScale).toBe(1.0)
  })
})

describe('potato floor caps', () => {
  it('nudges pixelRatio and drawing-buffer only for a high-20s near miss', () => {
    expect(POTATO_NEAR_MISS_CAPS.pixelRatio).toBeLessThanOrEqual(0.4)
    expect(POTATO_NEAR_MISS_CAPS.pixelRatio).toBeLessThan(POTATO_FLOOR_CAPS.pixelRatio)
    expect(POTATO_NEAR_MISS_CAPS.drawingBufferPixels).toBeLessThanOrEqual(5e5)
    expect(POTATO_NEAR_MISS_CAPS.drawingBufferPixels).toBeLessThan(
      POTATO_FLOOR_CAPS.drawingBufferPixels,
    )
  })

  it('uses pixelRatio 0.35 for a hopeless floor below 10 FPS', () => {
    expect(POTATO_HOPELESS_CAPS.pixelRatio).toBeLessThanOrEqual(0.35)
    expect(POTATO_HOPELESS_CAPS.pixelRatio).toBeLessThan(POTATO_NEAR_MISS_CAPS.pixelRatio)
    expect(POTATO_HOPELESS_MAX_AVG_FPS).toBe(10)
  })

  it('freezes ocean work when avgFps stays below 5 after the second-stage floor', () => {
    expect(POTATO_OCEAN_FREEZE_MAX_AVG_FPS).toBe(5)
    expect(POTATO_OCEAN_FREEZE_MAX_AVG_FPS).toBeLessThan(POTATO_HOPELESS_MAX_AVG_FPS)
    expect(POTATO_OCEAN_FREEZE_FFT_SIZE).toEqual([0, 0, 0])
    expect(POTATO_OCEAN_FREEZE_EFFECT_QUALITY).toBe(0)
  })
})
