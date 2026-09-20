/** Display names for report metrics. Unknown keys fall back to the raw key. */

export const METRIC_LABELS: Record<string, string> = {
  gpuFrameTimeMs: 'GPU frame time (ms)',
  p95FrameTimeMs: 'p95 frame time (ms)',
  avgFps: 'Average FPS',
  drawCalls: 'Draw calls',
  triangles: 'Triangles',
  lightCount: 'Lights',
  shadowCastingLightCount: 'Shadow-casting lights',
  drawingBufferPixels: 'Drawing buffer (pixels)',
  textureCount: 'Textures',
  geometryCount: 'Geometries',
  estimatedVramBytes: 'Estimated VRAM (bytes)',
  compileMs: 'Compile time (ms)',
  simPassCount: 'Sim passes',
  bytesLoaded: 'Bytes loaded',
}

/** Short names used in the verdict strip. */
export const METRIC_SHORT_LABELS: Record<string, string> = {
  gpuFrameTimeMs: 'GPU',
  p95FrameTimeMs: 'p95',
  avgFps: 'FPS',
  drawCalls: 'draw calls',
  triangles: 'triangles',
  lightCount: 'lights',
  shadowCastingLightCount: 'shadow lights',
  drawingBufferPixels: 'pixels',
  textureCount: 'textures',
  geometryCount: 'geometries',
}

export function metricLabel(key: string): string {
  return METRIC_LABELS[key] ?? key
}

export function metricShortLabel(key: string): string {
  return METRIC_SHORT_LABELS[key] ?? metricLabel(key)
}
