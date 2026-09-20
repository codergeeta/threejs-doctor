import { describe, it, expect } from 'vitest'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, main } from '../cli.js'
import { runScan } from '../commands/scan.js'
import { runBench } from '../commands/bench.js'
import type { DoctorReport } from '@threejs-doctor/runtime'
import type { CliArgs } from '../cli.js'

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/healthy-static')

const fakeReport: DoctorReport = {
  profile: 'marketing',
  mode: 'benchmark',
  score: 88,
  findings: [],
  baseline: {
    avgFps: 40, p95FrameTimeMs: 28, drawCalls: 60, triangles: 8_000,
    textureCount: 3, estimatedVramBytes: 8_000_000, geometryCount: 8,
    lightCount: 1, shadowCastingLightCount: 0,
  },
  after: {
    avgFps: 55, p95FrameTimeMs: 18, drawCalls: 40, triangles: 8_000,
    textureCount: 3, estimatedVramBytes: 8_000_000, geometryCount: 8,
    lightCount: 1, shadowCastingLightCount: 0,
  },
  deltas: { avgFps: 15, drawCalls: -20, p95FrameTimeMs: -10 },
  appliedPasses: ['dpr-cap'],
  failedPasses: [],
  incomplete: false,
}

const defaultArgs: CliArgs = {
  command: 'scan',
  path: '.',
  format: 'human',
  profile: 'auto',
  budget: 'low',
  minScore: 70,
}

describe('cli', () => {
  it('parses scan and format flags', () => {
    expect(parseArgs(['scan', './demo', '--format', 'json'])).toEqual({
      command: 'scan',
      path: './demo',
      format: 'json',
      profile: 'auto',
      budget: 'low',
      minScore: 70,
    })
  })

  it('parses --format html and the report subcommand', () => {
    expect(parseArgs(['scan', './demo', '--format', 'html']).format).toBe('html')
    expect(parseArgs(['report', 'a.json']).command).toBe('report')
    expect(parseArgs(['report', 'a.json']).path).toBe('a.json')
  })

  it('writes SARIF when --format sarif is set', async () => {
    const chunks: string[] = []
    await main(['scan', '--format', 'sarif'], {
      runScan: async () => fakeReport,
      runBench: async () => fakeReport,
      write: (text) => {
        chunks.push(text)
      },
    })
    const parsed = JSON.parse(chunks.join('')) as { version: string; runs: unknown[] }
    expect(parsed.version).toBe('2.1.0')
    expect(parsed.runs).toHaveLength(1)
  })

  it('parses ci path and min-score', () => {
    expect(parseArgs(['ci', './demo', '--min-score', '85'])).toEqual({
      command: 'ci',
      path: './demo',
      format: 'human',
      profile: 'auto',
      budget: 'low',
      minScore: 85,
    })
  })

  it('parses bench profile and budget flags', () => {
    expect(parseArgs(['bench', '--profile', 'product', '--budget', 'mid'])).toEqual({
      command: 'bench',
      path: '.',
      format: 'human',
      profile: 'product',
      budget: 'mid',
      minScore: 70,
    })
  })

  it('ci exits 1 when score below gate', async () => {
    const code = await main(['ci', '--min-score', '95'], {
      runScan: async () => fakeReport,
      runBench: async () => fakeReport,
      write: () => {},
    })
    expect(code).toBe(1)
  })

  it('ci exits 0 when score meets gate', async () => {
    const code = await main(['ci', '--min-score', '80'], {
      runScan: async () => fakeReport,
      runBench: async () => fakeReport,
      write: () => {},
    })
    expect(code).toBe(0)
  })

  it('ci exits 1 when findings include errors', async () => {
    const code = await main(['ci', '--min-score', '70'], {
      runScan: async () => ({
        ...fakeReport,
        findings: [
          {
            id: 'draw-calls/too-many',
            severity: 'error',
            evidence: { drawCalls: 200 },
            message: 'Draw calls too high',
            suggestedFix: 'Instance meshes',
          },
        ],
      }),
      runBench: async () => fakeReport,
      write: () => {},
    })
    expect(code).toBe(1)
  })

  it('ci exits 1 when --min-score is not a number', async () => {
    const code = await main(['ci', '--min-score', 'abc'], {
      runScan: async () => fakeReport,
      runBench: async () => fakeReport,
      write: () => {},
    })
    expect(code).toBe(1)
  })

  it('ci exits 1 when the report is incomplete', async () => {
    const code = await main(['ci'], {
      runScan: async () => ({ ...fakeReport, incomplete: true }),
      runBench: async () => fakeReport,
      write: () => {},
    })
    expect(code).toBe(1)
  })

  it('writes JSON when --format json is set', async () => {
    const chunks: string[] = []
    await main(['scan', '--format', 'json'], {
      runScan: async () => fakeReport,
      runBench: async () => fakeReport,
      write: (text) => {
        chunks.push(text)
      },
    })
    const parsed = JSON.parse(chunks.join('')) as DoctorReport
    expect(parsed.score).toBe(88)
    expect(parsed.appliedPasses).toEqual(['dpr-cap'])
  })

  it('bench command calls runBench not runScan', async () => {
    const calls: string[] = []
    await main(['bench', '--profile', 'game'], {
      runScan: async () => {
        calls.push('scan')
        return fakeReport
      },
      runBench: async () => {
        calls.push('bench')
        return fakeReport
      },
      write: () => {},
    })
    expect(calls).toEqual(['bench'])
  })

  it('help exits 0 and prints usage', async () => {
    const chunks: string[] = []
    const code = await main(['help'], {
      runScan: async () => fakeReport,
      runBench: async () => fakeReport,
      write: (text) => {
        chunks.push(text)
      },
    })
    expect(code).toBe(0)
    expect(chunks.join('')).toContain('scan [path]')
    expect(chunks.join('')).toContain('report --example')
    expect(chunks.join('')).toContain('ci [path]')
    expect(chunks.join('').toLowerCase()).not.toContain('not implemented')
  })

  it('runScan returns a diagnose report instead of throwing not-implemented', async () => {
    const report = await runScan({ ...defaultArgs, profile: 'product', path: fixtures })
    expect(report.mode).toBe('diagnose')
    expect(report.incomplete).toBe(false)
    expect(report.score).toBeGreaterThanOrEqual(0)
    expect(report.score).toBeLessThanOrEqual(100)
  })

  it('default scan exits 0 after printing a real report', async () => {
    const chunks: string[] = []
    const code = await main(['scan', fixtures], {
      runScan,
      runBench: async () => fakeReport,
      write: (text) => {
        chunks.push(text)
      },
    })
    expect(code).toBe(0)
    expect(chunks.join('')).toContain('Doctor Score:')
    expect(chunks.join('').toLowerCase()).not.toContain('not implemented')
  })

  it('runBench returns a benchmark report from the harness', async () => {
    const report = await runBench({
      ...defaultArgs,
      command: 'bench',
      profile: 'game',
      budget: 'high',
    })
    expect(report.mode).toBe('benchmark')
    expect(report.profile).toBe('game')
  })
})
