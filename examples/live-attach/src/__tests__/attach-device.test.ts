import { describe, it, expect } from 'vitest'
import { resolveAttachDevice, PHONE_CLASS_PROBE } from '../attach-device.js'

function glRenderer(maxTextureSize: number) {
  return {
    getExtension() {
      return null
    },
    getContext() {
      return {
        MAX_TEXTURE_SIZE: 0x0d33,
        getParameter(pname: number) {
          if (pname === 0x0d33) return maxTextureSize
          return 0
        },
        getExtension() {
          return null
        },
      }
    },
  }
}

describe('resolveAttachDevice maxTextureSize', () => {
  it('forwards GL MAX_TEXTURE_SIZE through a phone overlay instead of defaulting to 2048', () => {
    const caps = resolveAttachDevice('phone', glRenderer(16384))
    expect(caps?.maxTextureSize).toBe(16384)
    expect(caps?.maxTouchPoints).toBe(PHONE_CLASS_PROBE.maxTouchPoints)
  })

  it('lets an explicit overlay maxTextureSize win over the GL value', () => {
    const caps = resolveAttachDevice({ maxTextureSize: 4096 }, glRenderer(16384))
    expect(caps?.maxTextureSize).toBe(4096)
  })
})
