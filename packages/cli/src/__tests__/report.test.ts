import { describe, it, expect } from 'vitest'
import { formatHumanReport } from '../report/human.js'
import { formatJsonReport } from '../report/json.js'
import type { DoctorReport } from '@threejs-doctor/runtime'

const report: DoctorReport = {
  profile: 'product',
  mode: 'optimize',
  score: 76,
  findings: [
    {
      id: 'draw-calls/too-many',
      severity: 'warn',
      evidence: { drawCalls: 140 },
      message: 'Draw calls high',
      suggestedFix: 'Instance meshes',
    },
  ],
  baseline: {
    avgFps: 30, p95FrameTimeMs: 40, drawCalls: 140, triangles: 20_000,
    textureCount: 6, estimatedVramBytes: 20_000_000, geometryCount: 20,
    lightCount: 2, shadowCastingLightCount: 1,
  },
  after: {
    avgFps: 45, p95FrameTimeMs: 24, drawCalls: 70, triangles: 20_000,
    textureCount: 6, estimatedVramBytes: 20_000_000, geometryCount: 20,
    lightCount: 2, shadowCastingLightCount: 1,
  },
  deltas: { avgFps: 15, p95FrameTimeMs: -16, drawCalls: -70 },
  appliedPasses: ['dpr-cap', 'shadow-budget'],
  failedPasses: [],
  incomplete: false,
}

describe('reports', () => {
  it('formats human report with score and deltas', () => {
    const text = formatHumanReport(report)
    expect(text).toContain('Doctor Score: 76')
    expect(text).toContain('drawCalls')
    expect(text).toContain('dpr-cap')
  })

  it('formats JSON report parseably', () => {
    const parsed = JSON.parse(formatJsonReport(report))
    expect(parsed.score).toBe(76)
    expect(parsed.appliedPasses).toEqual(['dpr-cap', 'shadow-budget'])
    expect(parsed.baseline.drawCalls).toBe(140)
    expect(parsed.after.drawCalls).toBe(70)
  })

  it('notes incomplete runs without inventing after metrics', () => {
    const { after: _after, deltas: _deltas, ...rest } = report
    void _after
    void _deltas
    const text = formatHumanReport({ ...rest, incomplete: true })
    expect(text).toContain('Run incomplete: after metrics unavailable; baseline retained.')
    expect(text).toContain('drawCalls: 140')
    expect(text).not.toContain('drawCalls: 140 →')
    expect(text).not.toContain('avgFps: 30 →')
  })

  it('lists failed passes', () => {
    const text = formatHumanReport({
      ...report,
      failedPasses: [{ id: 'shadow-budget', error: 'boom' }],
    })
    expect(text).toContain('Failed passes:')
    expect(text).toContain('shadow-budget: boom')
  })
})
