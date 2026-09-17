import { describe, it, expect } from 'vitest'
import { probeDevice } from '../device-probe.js'

describe('probeDevice', () => {
  it('classifies low tier when dpr is high and cores are few', () => {
    const caps = probeDevice({
      devicePixelRatio: 3,
      hardwareConcurrency: 4,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
    })
    expect(caps.tier).toBe('low')
    expect(caps.webgl).toBe(true)
    expect(caps.webgpu).toBe(false)
  })

  it('classifies high tier for strong desktop-like signals', () => {
    const caps = probeDevice({
      devicePixelRatio: 1,
      hardwareConcurrency: 16,
      maxTextureSize: 16384,
      webgl: true,
      webgpu: true,
    })
    expect(caps.tier).toBe('high')
  })

  it('forwards optional v2 probe fields without changing classifyTier', () => {
    const caps = probeDevice({
      devicePixelRatio: 3,
      hardwareConcurrency: 4,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      deviceMemory: 4,
      maxTouchPoints: 5,
      coarsePointer: true,
      colorBufferFloat: true,
      floatLinear: false,
    })
    expect(caps.tier).toBe('low')
    expect(caps.deviceMemory).toBe(4)
    expect(caps.maxTouchPoints).toBe(5)
    expect(caps.coarsePointer).toBe(true)
    expect(caps.colorBufferFloat).toBe(true)
    expect(caps.floatLinear).toBe(false)
  })
})

