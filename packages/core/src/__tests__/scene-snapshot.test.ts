import { describe, it, expect } from 'vitest'
import { snapshotScene } from '../scene-snapshot.js'

describe('snapshotScene', () => {
  it('aggregates mesh, light, texture, and draw stats', () => {
    const snap = snapshotScene({
      objectCount: 10,
      meshCount: 4,
      geometries: [{ uuid: 'g1' }, { uuid: 'g2' }],
      materials: [{ uuid: 'm1' }, { uuid: 'm2' }, { uuid: 'm1' }],
      textures: [
        { uuid: 't1', width: 1024, height: 1024, bytesPerPixel: 4 },
        { uuid: 't2', width: 512, height: 512, bytesPerPixel: 4 },
      ],
      lights: [
        { castShadow: true },
        { castShadow: false },
        { castShadow: true },
      ],
      drawCalls: 40,
      triangles: 12000,
      continuousFrameloop: true,
      matrixAutoUpdateCount: 3,
      rendererPixelRatio: 2,
      antialias: true,
    })
    expect(snap.geometryCount).toBe(2)
    expect(snap.materialCount).toBe(2)
    expect(snap.textureCount).toBe(2)
    expect(snap.lightCount).toBe(3)
    expect(snap.shadowCastingLightCount).toBe(2)
    expect(snap.estimatedVramBytes).toBe(1024 * 1024 * 4 + 512 * 512 * 4)
    expect(snap.maxTextureDimension).toBe(1024)
  })
})
