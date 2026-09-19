import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { formatHtmlReport } from '../report/html.js'
import { parseArgs, main } from '../cli.js'
import type { DoctorReport } from '@threejs-doctor/runtime'

const staticReport: DoctorReport = {
  profile: 'game',
  mode: 'diagnose',
  score: 74,
  staticScan: true,
  findings: [
    {
      id: 'lights/zero-intensity',
      severity: 'warn',
      evidence: { zeroIntensityLightCount: 1, file: 'src/Vehicle.js', line: 189 },
      message: '1 visible light(s) have intensity 0 but still participate in lighting',
      suggestedFix: 'Keep visible light count fixed and move/reassign a small pool.',
      locations: [{ file: 'src/Vehicle.js', line: 189 }],
    },
  ],
  baseline: {
    lightCount: 4,
    shadowCastingLightCount: 1,
    textureCount: 2,
    geometryCount: 8,
    drawCalls: 0,
    triangles: 0,
    avgFps: 0,
    p95FrameTimeMs: 0,
  },
  appliedPasses: [],
  failedPasses: [],
  incomplete: false,
}

const runtimeReport = {
  profile: 'game',
  mode: 'optimize',
  score: 80,
  findings: [],
  baseline: {
    avgFps: 30,
    p95FrameTimeMs: 40,
    drawCalls: 140,
    triangles: 100_000,
    textureCount: 6,
    geometryCount: 20,
    lightCount: 2,
    shadowCastingLightCount: 1,
    triangleContributorSummary: 'chunked-trees:21000',
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
  deltas: { triangles: -79_000, drawCalls: -70, avgFps: 15 },
  claimed: { triangles: 'win', drawCalls: 'win', avgFps: 'win' },
  noiseBand: { triangles: { abs: 100, rel: 0.01 }, drawCalls: { abs: 2, rel: 0.02 }, avgFps: { abs: 1, rel: 0.02 } },
  appliedPasses: ['dpr-cap'],
  failedPasses: [],
  incomplete: false,
}

describe('HTML report', () => {
  it('labels a static scan score as static (source patterns)', () => {
    const html = formatHtmlReport(staticReport)
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('74')
    expect(html).toContain('static (source patterns)')
    expect(html).not.toContain('<script src=')
    expect(html).toContain('<style>')
    expect(html).toContain('src/Vehicle.js:189')
    expect(html).toContain('Keep visible light count fixed')
    expect(html).toContain('not measured on this device')
    expect(html).not.toContain('Score trend')
    expect(html).not.toContain('<figure>')
  })

  it('labels runtime score and shows noise-band verdicts without inventing GPU ms', () => {
    const html = formatHtmlReport(runtimeReport)
    expect(html).toContain('runtime (measured)')
    expect(html).toContain('win')
    expect(html).toContain('chunked-trees')
    expect(html).toContain('21000')
    expect(html).toContain('not measured on this device')
    expect(html).not.toMatch(/gpuFrameTimeMs/)
  })

  it('omits trend unless multi-commit history is provided and renders it when present', () => {
    expect(formatHtmlReport(runtimeReport)).not.toContain('Score trend')
    const html = formatHtmlReport({
      ...runtimeReport,
      history: [
        { commit: 'aaa', score: 66 },
        { commit: 'bbb', score: 74 },
      ],
    })
    expect(html).toContain('Score trend')
    expect(html).toContain('<polyline')
  })

  it('links file:line to GitHub when a repo URL is known', () => {
    const html = formatHtmlReport(staticReport, {
      repoUrl: 'https://github.com/codergeeta/threejs-doctor',
    })
    expect(html).toContain(
      'https://github.com/codergeeta/threejs-doctor/blob/main/src/Vehicle.js#L189',
    )
  })

  it('renders GPU pass times only when present', () => {
    const html = formatHtmlReport({
      ...runtimeReport,
      gpuPassTimes: [{ pass: 'shadow', gpuFrameTimeMs: 2.5 }],
    })
    expect(html).toContain('GPU time per pass')
    expect(html).toContain('shadow')
    expect(html).toContain('2.5')
    expect(html).not.toContain('not measured on this device')
  })

  it('scan --format html and report subcommand produce a single offline file', async () => {
    expect(parseArgs(['scan', './demo', '--format', 'html']).format).toBe('html')
    expect(parseArgs(['report', 'out.json', '--output', 'out.html', '--repo', 'https://github.com/a/b'])).toEqual(
      expect.objectContaining({
        command: 'report',
        path: 'out.json',
        output: 'out.html',
        repo: 'https://github.com/a/b',
      }),
    )
    const dir = mkdtempSync(join(tmpdir(), 'doctor-html-'))
    const jsonPath = join(dir, 'report.json')
    const htmlPath = join(dir, 'report.html')
    writeFileSync(jsonPath, JSON.stringify(staticReport))
    const chunks: string[] = []
    const code = await main(['report', jsonPath, '-o', htmlPath], {
      runScan: async () => staticReport,
      runBench: async () => staticReport,
      write: (text) => chunks.push(text),
    })
    expect(code).toBe(0)
    const html = readFileSync(htmlPath, 'utf8')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('static (source patterns)')
    expect(chunks.join('')).toContain('wrote')
  })
})
