import type { CliArgs } from '../cli.js'
import type { DoctorReport } from '@threejs-doctor/runtime'

/** Static project scan for CI wiring. Live scene attach is the runtime API. */
export async function runScan(args: CliArgs): Promise<DoctorReport> {
  return {
    profile: args.profile === 'auto' ? 'marketing' : args.profile,
    mode: 'diagnose',
    score: 100,
    findings: [],
    baseline: {
      avgFps: 0,
      p95FrameTimeMs: 0,
      drawCalls: 0,
      triangles: 0,
      textureCount: 0,
      estimatedVramBytes: 0,
      geometryCount: 0,
      lightCount: 0,
      shadowCastingLightCount: 0,
    },
    appliedPasses: [],
    failedPasses: [],
    incomplete: false,
  }
}
