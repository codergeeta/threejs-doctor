import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatHtmlReport } from '../report/html.js'
import { EXAMPLE_REPORT, formatExampleReportJson } from '../report/example-report.js'
import {
  HTML_REPORT_TOP_LEVEL_KEYS,
  collectUnrecognisedTopLevelKeys,
  formatUnrecognisedKeysWarning,
} from '../report/known-keys.js'
import { parseArgs, main } from '../cli.js'
import type { DoctorReport } from '@threejs-doctor/runtime'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('report --example and unknown keys', () => {
  it('parses report --example', () => {
    expect(parseArgs(['report', '--example'])).toEqual(
      expect.objectContaining({ command: 'report', example: true }),
    )
  })

  it('prints fully-populated sample JSON that fills every HTML section', async () => {
    const chunks: string[] = []
    const code = await main(['report', '--example'], {
      runScan: async () => ({}) as DoctorReport,
      runBench: async () => ({}) as DoctorReport,
      write: (text) => chunks.push(text),
    })
    expect(code).toBe(0)
    const parsed = JSON.parse(chunks.join('')) as typeof EXAMPLE_REPORT
    expect(parsed).toEqual(JSON.parse(formatExampleReportJson()))
    expect(parsed.example).toBe(true)

    const html = formatHtmlReport(parsed)
    expect(html).toContain('Sample fixture')
    expect(html).toContain('Before / after')
    expect(html).toContain('Findings')
    expect(html).toContain('src/Vehicle.js:189')
    expect(html).toContain('Expensive meshes')
    expect(html).toContain('chunked-trees')
    expect(html).toContain('GPU time per pass')
    expect(html).toContain('shadow')
    expect(html).toContain('2.5')
    expect(html).not.toContain('not measured on this device')
    expect(html).toContain('Visuals')
    expect(html).toContain('<figure>')
    expect(html).toContain('data:image/png;base64,')
    expect(html).toContain('Score trend')
    expect(html).toContain('<polyline')
    expect(html).not.toContain('<script src=')
  })

  it('warns on unrecognised top-level keys and still writes HTML', async () => {
    const warnings: string[] = []
    const chunks: string[] = []
    const input = { ...EXAMPLE_REPORT, historry: [{ score: 1 }], gpuPassTime: [] }
    const dirJson = JSON.stringify(input)
    const { writeFileSync, mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'doctor-unknown-'))
    const jsonPath = join(dir, 'bad.json')
    writeFileSync(jsonPath, dirJson)

    const code = await main(['report', jsonPath], {
      runScan: async () => ({}) as DoctorReport,
      runBench: async () => ({}) as DoctorReport,
      write: (text) => chunks.push(text),
      warn: (text) => warnings.push(text),
    })
    expect(code).toBe(0)
    expect(chunks.join('')).toContain('<!DOCTYPE html>')
    expect(warnings.join('')).toMatch(/unrecognised top-level key/)
    expect(warnings.join('')).toContain('historry')
    expect(warnings.join('')).toContain('gpuPassTime')
    expect(collectUnrecognisedTopLevelKeys(input)).toEqual(['gpuPassTime', 'historry'])
  })

  it('does not warn on known Doctor / HTML / alias keys', () => {
    expect(collectUnrecognisedTopLevelKeys(EXAMPLE_REPORT)).toEqual([])
    expect(
      collectUnrecognisedTopLevelKeys({
        topMeshes: [],
        passGpuMs: [],
        visuals: [],
        screenshots: [],
        qualityMode: 'advise',
        appliedPasses: [],
        expectedTradeoffs: undefined,
      }),
    ).toEqual(['expectedTradeoffs'])
    expect(formatUnrecognisedKeysWarning(['historry'])).toContain('historry')
  })

  it('keeps docs/sample-report.json in sync with --example', () => {
    const committed = JSON.parse(
      readFileSync(resolve(repoRoot, 'docs/sample-report.json'), 'utf8'),
    ) as unknown
    expect(committed).toEqual(JSON.parse(formatExampleReportJson()))
  })

  it('documents every key formatHtmlReport reads', () => {
    const doc = readFileSync(resolve(repoRoot, 'docs/report-json.md'), 'utf8')
    for (const key of HTML_REPORT_TOP_LEVEL_KEYS) {
      expect(doc, `docs/report-json.md must mention ${key}`).toContain(key)
    }
    expect(doc).toContain('expectedTradeoffs')
  })
})
