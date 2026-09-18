import type { MetricsSample, RendererInfoLike } from './types.js'

export interface SceneStatsLike {
  textureCount: number
  estimatedVramBytes?: number | undefined
  geometryCount: number
  lightCount: number
  shadowCastingLightCount: number
}

export interface MetricsCollectorOptions {
  getRendererInfo: () => RendererInfoLike
  getSceneStats: () => SceneStatsLike
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]!
}

export class MetricsCollector {
  private frameTimesMs: number[] = []
  private openStart: number | null = null

  constructor(private readonly opts: MetricsCollectorOptions) {}

  beginFrame(nowMs: number): void {
    this.openStart = nowMs
  }

  endFrame(nowMs: number): void {
    if (this.openStart === null) return
    this.frameTimesMs.push(Math.max(0, nowMs - this.openStart))
    this.openStart = null
  }

  sample(): MetricsSample {
    const times = [...this.frameTimesMs].sort((a, b) => a - b)
    const avgFrame =
      times.length === 0 ? 0 : times.reduce((a, b) => a + b, 0) / times.length
    const info = this.opts.getRendererInfo()
    const scene = this.opts.getSceneStats()
    const sample: MetricsSample = {
      avgFps: avgFrame <= 0 ? 0 : 1000 / avgFrame,
      p95FrameTimeMs: percentile(times, 95),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      textureCount: scene.textureCount,
      geometryCount: scene.geometryCount,
      lightCount: scene.lightCount,
      shadowCastingLightCount: scene.shadowCastingLightCount,
    }
    if (scene.estimatedVramBytes !== undefined) {
      sample.estimatedVramBytes = scene.estimatedVramBytes
    }
    return sample
  }
}
