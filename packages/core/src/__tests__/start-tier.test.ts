import { describe, it, expect } from 'vitest'
import { probeDevice, readWebglQualitySignals } from '../device-probe.js'
import { resolveStartTier, isMobileSignal } from '../start-tier.js'

describe('resolveStartTier', () => {
  it('keeps v1 desktop high → startTier high, maxTier high', () => {
    const caps = probeDevice({
      devicePixelRatio: 1,
      hardwareConcurrency: 16,
      maxTextureSize: 16384,
      webgl: true,
      webgpu: true,
    })
    expect(caps.tier).toBe('high')
    const r = resolveStartTier(caps)
    expect(r.startTier).toBe('high')
    expect(r.maxTier).toBe('high')
    expect(r.mobile).toBe(false)
  })

  it('maps desktop v1 mid → start mid, max high', () => {
    const caps = probeDevice({
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
      maxTextureSize: 8192,
      webgl: true,
      webgpu: false,
    })
    expect(caps.tier).toBe('mid')
    const r = resolveStartTier(caps)
    expect(r.startTier).toBe('mid')
    expect(r.maxTier).toBe('high')
  })

  it('maps desktop v1 low → start low, max high', () => {
    const caps = probeDevice({
      devicePixelRatio: 3,
      hardwareConcurrency: 4,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
    })
    expect(caps.tier).toBe('low')
    const r = resolveStartTier(caps)
    expect(r.startTier).toBe('low')
    expect(r.maxTier).toBe('high')
    expect(r.mobile).toBe(false)
  })

  it('starts potato on mobile with deviceMemory <= 4, maxTier mid', () => {
    const caps = probeDevice({
      devicePixelRatio: 3,
      hardwareConcurrency: 8,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      deviceMemory: 4,
      maxTouchPoints: 5,
      coarsePointer: true,
    })
    const r = resolveStartTier(caps)
    expect(r.mobile).toBe(true)
    expect(r.startTier).toBe('potato')
    expect(r.maxTier).toBe('mid')
  })

  it('starts potato on mobile with cores <= 4', () => {
    const caps = probeDevice({
      devicePixelRatio: 2,
      hardwareConcurrency: 4,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      maxTouchPoints: 1,
    })
    const r = resolveStartTier(caps)
    expect(r.startTier).toBe('potato')
    expect(r.maxTier).toBe('mid')
  })

  it('starts potato on mobile when OES_texture_float_linear is false', () => {
    const caps = probeDevice({
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      maxTouchPoints: 5,
      deviceMemory: 6,
      floatLinear: false,
      colorBufferFloat: true,
    })
    const r = resolveStartTier(caps)
    expect(r.startTier).toBe('potato')
    expect(r.maxTier).toBe('mid')
  })

  it('starts low on other mobile, maxTier mid', () => {
    const caps = probeDevice({
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      maxTouchPoints: 5,
      deviceMemory: 6,
      floatLinear: true,
      colorBufferFloat: true,
    })
    const r = resolveStartTier(caps)
    expect(r.mobile).toBe(true)
    expect(r.startTier).toBe('low')
    expect(r.maxTier).toBe('mid')
  })

  it('treats unknown mobile deviceMemory as potato-class (conservative)', () => {
    const caps = probeDevice({
      devicePixelRatio: 3,
      hardwareConcurrency: 8,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      maxTouchPoints: 5,
      coarsePointer: true,
    })
    const r = resolveStartTier(caps)
    expect(r.mobile).toBe(true)
    expect(r.startTier).toBe('potato')
    expect(r.maxTier).toBe('mid')
  })

  it('forces potato + maxTier potato when colorBufferFloat is false', () => {
    const caps = probeDevice({
      devicePixelRatio: 1,
      hardwareConcurrency: 16,
      maxTextureSize: 16384,
      webgl: true,
      webgpu: true,
      colorBufferFloat: false,
    })
    const r = resolveStartTier(caps)
    expect(r.startTier).toBe('potato')
    expect(r.maxTier).toBe('potato')
    expect(r.noFloatRt).toBe(true)
  })

  it('throws when webgl is false', () => {
    const caps = probeDevice({ webgl: false, webgpu: false })
    expect(() => resolveStartTier(caps)).toThrow(/webgl/i)
  })

  it('does not treat missing colorBufferFloat as false', () => {
    const caps = probeDevice({
      devicePixelRatio: 1,
      hardwareConcurrency: 16,
      maxTextureSize: 16384,
      webgl: true,
      webgpu: true,
    })
    const r = resolveStartTier(caps)
    expect(r.noFloatRt).toBe(false)
    expect(r.startTier).toBe('high')
  })
})

describe('isMobileSignal', () => {
  it('is true when maxTouchPoints >= 1', () => {
    expect(
      isMobileSignal({
        maxTouchPoints: 1,
        devicePixelRatio: 1,
        hardwareConcurrency: 16,
      }),
    ).toBe(true)
  })

  it('is true when coarsePointer is true', () => {
    expect(
      isMobileSignal({
        coarsePointer: true,
        devicePixelRatio: 1,
        hardwareConcurrency: 16,
      }),
    ).toBe(true)
  })

  it('is true when deviceMemory <= 8 with dpr >= 2 and cores <= 8', () => {
    expect(
      isMobileSignal({
        deviceMemory: 8,
        devicePixelRatio: 2,
        hardwareConcurrency: 8,
      }),
    ).toBe(true)
  })
})

describe('readWebglQualitySignals', () => {
  it('never requests WEBGL_debug_renderer_info or unmasked vendor/renderer', () => {
    const requested: string[] = []
    readWebglQualitySignals({
      getExtension(name: string) {
        requested.push(name)
        return {}
      },
    })
    expect(requested).toContain('EXT_color_buffer_float')
    expect(requested).toContain('OES_texture_float_linear')
    expect(requested).not.toContain('WEBGL_debug_renderer_info')
    expect(requested).not.toContain('UNMASKED_RENDERER_WEBGL')
    expect(requested).not.toContain('UNMASKED_VENDOR_WEBGL')
  })

  it('returns empty object when gl is missing (fields omitted, not false)', () => {
    expect(readWebglQualitySignals(undefined)).toEqual({})
  })
})
