import { describe, it, expect } from 'vitest'
import { parseArgs, main } from '../cli.js'
import { runScan } from '../commands/scan.js'
import { runBench } from '../commands/bench.js'
import type { DoctorReport } from '@threejs-doctor/runtime'
import type { CliArgs } from '../cli.js'

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
    expect(chunks.join('')).toContain('npx threejs-doctor scan')
  })

  it('runScan returns a diagnose report for the resolved profile', async () => {
    const report = await runScan({ ...defaultArgs, profile: 'product' })
    expect(report.mode).toBe('diagnose')
    expect(report.profile).toBe('product')
    expect(report.incomplete).toBe(false)
    expect(report.appliedPasses).toEqual([])
  })

  it('runBench returns a benchmark report from the harness stub', async () => {
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
