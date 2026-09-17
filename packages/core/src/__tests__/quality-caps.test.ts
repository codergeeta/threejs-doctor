import { describe, it, expect } from 'vitest'
import { ADAPTER_KNOBS } from '../quality-caps.js'

describe('ADAPTER_KNOBS', () => {
  it('omits meshLod and rtScale from potato (RT resize breaks WebGL)', () => {
    expect(ADAPTER_KNOBS.potato.meshLod).toBeUndefined()
    expect(ADAPTER_KNOBS.potato.rtScale).toBeUndefined()
    expect(ADAPTER_KNOBS.potato.spectrumEveryNFrames).toBe(4)
    expect(ADAPTER_KNOBS.potato.deferredHdr).toBe(true)
    expect(ADAPTER_KNOBS.potato.fftSize).toEqual([64, 0, 0])
  })

  it('keeps rtScale on non-potato tiers', () => {
    expect(ADAPTER_KNOBS.low.rtScale).toBe(0.5)
    expect(ADAPTER_KNOBS.mid.rtScale).toBe(0.7)
    expect(ADAPTER_KNOBS.high.rtScale).toBe(1.0)
  })
})
