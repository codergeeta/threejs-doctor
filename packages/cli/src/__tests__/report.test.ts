import { describe, it, expect } from 'vitest'
import { formatHumanReport } from '../report/human.js'
import { formatJsonReport } from '../report/json.js'
import { formatSarifReport } from '../report/sarif.js'
import { formatHtmlReport } from '../report/html.js'
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

  it('says no Three.js was found on a static incomplete scan', () => {
    const { after: _after, deltas: _deltas, ...rest } = report
    void _after
    void _deltas
    const text = formatHumanReport({
      ...rest,
      mode: 'diagnose',
      incomplete: true,
      findings: [
        {
          id: 'scan/no-threejs-detected',
          severity: 'warn',
          evidence: { files: 0 },
          message: 'No Three.js imports',
          suggestedFix: 'Point scan at a three project',
        },
      ],
    })
    expect(text).toContain('no Three.js patterns found')
    expect(text).not.toContain('after metrics unavailable')
  })

  it('lists failed passes', () => {
    const text = formatHumanReport({
      ...report,
      failedPasses: [{ id: 'shadow-budget', error: 'boom' }],
    })
    expect(text).toContain('Failed passes:')
    expect(text).toContain('shadow-budget: boom')
  })

  it('says applied passes were rolled back on a confirmed visual delta', () => {
    const text = formatHumanReport({
      ...report,
      visualDelta: true,
      rolledBackDueToVisual: true,
    })
    expect(text).toMatch(/visual delta/i)
    expect(text).toMatch(/rolled back/i)
    expect(text).toMatch(/fixed viewpoint/i)
  })

  it('labels a static scan score as not a runtime speed claim and prints file:line', () => {
    const text = formatHumanReport({
      ...report,
      mode: 'diagnose',
      staticScan: true,
      after: undefined,
      deltas: undefined,
      findings: [
        {
          id: 'lights/too-many',
          severity: 'warn',
          evidence: { lightCount: 9, file: 'src/lights.js', line: 42 },
          message: 'Active lights 9 exceed budget 3',
          suggestedFix: 'Bake lighting',
        },
      ],
    })
    expect(text).toMatch(/Static Doctor Score/i)
    expect(text).toMatch(/not a runtime speed/i)
    expect(text).toContain('src/lights.js:42')
  })

  it('lists every finding location in human output', () => {
    const text = formatHumanReport({
      ...report,
      mode: 'diagnose',
      staticScan: true,
      after: undefined,
      deltas: undefined,
      findings: [
        {
          id: 'culling/frustum-disabled',
          severity: 'warn',
          evidence: { frustumCulledDisabledCount: 2, file: 'src/game/Effects.js', line: 12 },
          message: '2 meshes have frustumCulled === false',
          suggestedFix: 'Enable frustumCulled on world meshes',
          locations: [
            { file: 'src/game/Effects.js', line: 12 },
            { file: 'src/game/Environment.js', line: 88 },
          ],
        },
      ],
    })
    expect(text).toContain('src/game/Effects.js:12')
    expect(text).toContain('src/game/Environment.js:88')
  })

  it('emits one SARIF result per site for per-site rules with generic rule metadata', () => {
    const sarif = JSON.parse(
      formatSarifReport({
        ...report,
        mode: 'diagnose',
        staticScan: true,
        findings: [
          {
            id: 'culling/frustum-disabled',
            severity: 'warn',
            evidence: { frustumCulledDisabledCount: 2, file: 'src/game/Effects.js', line: 12 },
            message: '2 meshes have frustumCulled === false',
            suggestedFix: 'Enable frustumCulled on world meshes',
            locations: [
              { file: 'src/game/Effects.js', line: 12 },
              { file: 'src/game/Environment.js', line: 88 },
            ],
          },
        ],
      }),
    ) as {
      runs: Array<{
        tool: { driver: { rules: Array<{ id: string; shortDescription?: { text: string }; help?: { text: string } }> } }
        results: Array<{
          ruleId: string
          message?: { text: string }
          locations?: Array<{ physicalLocation: { artifactLocation: { uri: string }; region?: { startLine?: number } } }>
          relatedLocations?: unknown
        }>
      }>
    }
    const run = sarif.runs[0]!
    expect(run.results).toHaveLength(2)
    expect(run.results[0]?.locations?.[0]?.physicalLocation.artifactLocation.uri).toBe('src/game/Effects.js')
    expect(run.results[0]?.locations?.[0]?.physicalLocation.region?.startLine).toBe(12)
    expect(run.results[1]?.locations?.[0]?.physicalLocation.artifactLocation.uri).toBe(
      'src/game/Environment.js',
    )
    expect(run.results.every((r) => r.relatedLocations === undefined)).toBe(true)
    expect(run.results[0]?.message?.text).toContain('src/game/Effects.js:12')
    const rule = run.tool.driver.rules.find((r) => r.id === 'culling/frustum-disabled')
    expect(rule?.shortDescription?.text).toBe('Mesh has frustumCulled disabled')
    expect(rule?.shortDescription?.text).not.toMatch(/2 meshes/)
    expect(rule?.help?.text).toMatch(/Enable frustumCulled/)
  })

  it('keeps aggregate rules as a single SARIF result', () => {
    const sarif = JSON.parse(
      formatSarifReport({
        ...report,
        mode: 'diagnose',
        staticScan: true,
        findings: [
          {
            id: 'lights/too-many',
            severity: 'warn',
            evidence: { lightCount: 9 },
            message: 'Active lights 9 exceed budget 3',
            suggestedFix: 'Bake lighting',
            locations: [
              { file: 'src/a.js', line: 1 },
              { file: 'src/b.js', line: 2 },
            ],
          },
        ],
      }),
    ) as {
      runs: Array<{
        tool: { driver: { rules: Array<{ id: string; shortDescription?: { text: string } }> } }
        results: Array<{
          ruleId: string
          relatedLocations?: unknown[]
        }>
      }>
    }
    const run = sarif.runs[0]!
    expect(run.results).toHaveLength(1)
    expect(run.results[0]?.relatedLocations?.length).toBe(1)
    const rule = run.tool.driver.rules.find((r) => r.id === 'lights/too-many')
    expect(rule?.shortDescription?.text).toBe('Active light count exceeds the profile budget')
    expect(rule?.shortDescription?.text).not.toMatch(/9/)
  })
})

