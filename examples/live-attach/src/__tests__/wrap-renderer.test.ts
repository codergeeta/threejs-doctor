import { describe, it, expect } from 'vitest'
import { wrapRenderer } from '../wrap-renderer.js'

describe('wrapRenderer', () => {
  it('forwards getContext so Doctor can read MAX_TEXTURE_SIZE', () => {
    const gl = {
      MAX_TEXTURE_SIZE: 0x0d33,
      drawingBufferWidth: 800,
      drawingBufferHeight: 600,
      getParameter(pname: number) {
        if (pname === 0x0d33) return 16384
        return 0
      },
    }
    const wrapped = wrapRenderer({
      info: { render: { calls: 1, triangles: 1 }, memory: { geometries: 0, textures: 0 } },
      setPixelRatio() {},
      getContext() {
        return gl
      },
    })
    expect(wrapped.getContext?.()).toBe(gl)
    expect(wrapped.getContext?.()?.getParameter?.(0x0d33)).toBe(16384)
  })

  it('forwards renderer.extensions.get for GPU timer discovery', () => {
    const ext = { TIME_ELAPSED_EXT: 0x88bf }
    const wrapped = wrapRenderer({
      info: { render: { calls: 1, triangles: 1 }, memory: { geometries: 0, textures: 0 } },
      setPixelRatio() {},
      getContext() {
        return { getExtension() { return null } }
      },
      extensions: {
        get(name: string) {
          return name === 'EXT_disjoint_timer_query_webgl2' ? ext : null
        },
      },
    })
    expect(wrapped.extensions?.get?.('EXT_disjoint_timer_query_webgl2')).toBe(ext)
    expect(wrapped.getExtension?.('EXT_disjoint_timer_query_webgl2')).toBe(ext)
  })

  it('forwards render to the host renderer', () => {
    let calls = 0
    const wrapped = wrapRenderer({
      info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } },
      setPixelRatio() {},
      render() {
        calls += 1
      },
    })
    wrapped.render?.({}, {})
    expect(calls).toBe(1)
  })
})
