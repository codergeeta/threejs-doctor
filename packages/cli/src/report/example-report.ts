/**
 * Fully-populated sample JSON for `threejs-doctor report --example`.
 *
 * Numbers are copied from existing unit fixtures and the README arcade-racer
 * case study. This is not a live capture. Real reports omit unmeasured fields.
 */

/** 1×1 PNG placeholder (not a scene screenshot). */
export const EXAMPLE_PLACEHOLDER_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export const EXAMPLE_REPORT = {
  example: true,
  profile: 'game',
  mode: 'optimize',
  score: 80,
  staticScan: false,
  incomplete: false,
  repository: 'https://github.com/codergeeta/threejs-doctor',
  findings: [
    {
      id: 'lights/zero-intensity',
      severity: 'warn',
      message: '1 visible light(s) have intensity 0 but still participate in lighting',
      suggestedFix: 'Keep visible light count fixed and move/reassign a small pool.',
      evidence: { zeroIntensityLightCount: 1, file: 'src/Vehicle.js', line: 189 },
      locations: [{ file: 'src/Vehicle.js', line: 189 }],
    },
  ],
  baseline: {
    avgFps: 30,
    p95FrameTimeMs: 40,
    drawCalls: 140,
    triangles: 100_000,
    textureCount: 6,
    geometryCount: 20,
    lightCount: 2,
    shadowCastingLightCount: 1,
  },
  after: {
    avgFps: 45,
    p95FrameTimeMs: 24,
    drawCalls: 70,
    triangles: 21_000,
    textureCount: 6,
    geometryCount: 20,
    lightCount: 2,
    shadowCastingLightCount: 1,
  },
  deltas: { triangles: -79_000, drawCalls: -70, avgFps: 15, p95FrameTimeMs: -16 },
  claimed: { triangles: 'win', drawCalls: 'win', avgFps: 'win' },
  noiseBand: {
    triangles: { abs: 100, rel: 0.01 },
    drawCalls: { abs: 2, rel: 0.02 },
    avgFps: { abs: 1, rel: 0.02 },
  },
  expensiveMeshes: [{ name: 'chunked-trees', triangles: 21_000 }],
  gpuPassTimes: [{ pass: 'shadow', gpuFrameTimeMs: 2.5 }],
  /** Sample fixture times consistent with baseline p95FrameTimeMs 40 / ~30 fps — not a live capture. */
  frameTimesMs: [31, 31, 32, 32, 32, 32, 33, 33, 33, 33, 33, 34, 34, 34, 35, 35, 36, 37, 39, 40],
  captures: [
    { label: 'before (1×1 placeholder, not a scene capture)', dataUrl: EXAMPLE_PLACEHOLDER_PNG },
    { label: 'after (1×1 placeholder, not a scene capture)', dataUrl: EXAMPLE_PLACEHOLDER_PNG },
  ],
  history: [
    { commit: 'pre-fix', score: 66 },
    { commit: 'post-fix', score: 74 },
  ],
  appliedPasses: ['dpr-cap'],
  failedPasses: [] as Array<{ id: string; error: string }>,
} as const

export function formatExampleReportJson(): string {
  return `${JSON.stringify(EXAMPLE_REPORT, null, 2)}\n`
}
