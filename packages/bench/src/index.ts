export const PACKAGE_NAME = '@threejs-doctor/bench' as const
import type { DoctorReport } from '@threejs-doctor/runtime'
import type { Profile } from '@threejs-doctor/core'

export async function runBenchSuite(_opts: {
  profile: Exclude<Profile, 'auto'>
  budget: 'low' | 'mid' | 'high'
}): Promise<DoctorReport> {
  return {
    profile: _opts.profile,
    mode: 'benchmark',
    score: 0,
    findings: [],
    baseline: {
      avgFps: 0, p95FrameTimeMs: 0, drawCalls: 0, triangles: 0,
      textureCount: 0, estimatedVramBytes: 0, geometryCount: 0,
      lightCount: 0, shadowCastingLightCount: 0,
    },
    appliedPasses: [],
    failedPasses: [],
    incomplete: true,
  }
}
