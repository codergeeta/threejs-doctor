import { describe, it, expect } from 'vitest'
import { ADAPTER_KNOBS } from '../quality-caps.js'

describe('ADAPTER_KNOBS', () => {
  it('omits meshLod from potato until a safe geometry rebuild exists', () => {
    expect(ADAPTER_KNOBS.potato.meshLod).toBeUndefined()
    expect(ADAPTER_KNOBS.potato.spectrumEveryNFrames).toBe(2)
    expect(ADAPTER_KNOBS.potato.deferredHdr).toBe(true)
    expect(ADAPTER_KNOBS.potato.rtScale).toBe(0.35)
  })
})
