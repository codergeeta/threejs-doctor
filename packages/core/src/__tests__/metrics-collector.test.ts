import { describe, it, expect } from 'vitest'
import { MetricsCollector } from '../metrics-collector.js'

describe('MetricsCollector', () => {
  it('computes avg FPS and p95 frame time from frame marks', () => {
    const collector = new MetricsCollector({
      getRendererInfo: () => ({
        render: { calls: 25, triangles: 8000 },
        memory: { geometries: 3, textures: 4 },
      }),
      getSceneStats: () => ({
        textureCount: 4,
        estimatedVramBytes: 16_000_000,
        geometryCount: 3,
        lightCount: 2,
        shadowCastingLightCount: 1,
      }),
    })
    const times = [0, 16, 33, 50, 70, 86, 100, 120, 135, 150]
    for (let i = 0; i < times.length - 1; i++) {
      collector.beginFrame(times[i]!)
      collector.endFrame(times[i + 1]!)
    }
    const sample = collector.sample()
    expect(sample.drawCalls).toBe(25)
    expect(sample.triangles).toBe(8000)
    expect(sample.avgFps).toBeGreaterThan(50)
    expect(sample.p95FrameTimeMs).toBeGreaterThan(0)
    expect(sample.textureCount).toBe(4)
    expect(sample.geometryCount).toBe(3)
    expect(sample.lightCount).toBe(2)
    expect(sample.shadowCastingLightCount).toBe(1)
  })
})
