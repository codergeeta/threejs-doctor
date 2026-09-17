import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const acceptanceDir = resolve(process.cwd(), '../../docs/superpowers/acceptance')

describe('live acceptance artifacts', () => {
  it('checks in a JSON schema and forbids capture JSON with invented numbers', () => {
    const files = readdirSync(acceptanceDir)
    expect(files).toContain('quality-ladder-report.schema.json')
    expect(files).toContain('live-ocean-capture.md')
    for (const f of files) {
      if (f.endsWith('.json') && f !== 'quality-ladder-report.schema.json') {
        throw new Error(`do not check in capture JSON (${f}); store schema only`)
      }
    }
    const schema = JSON.parse(
      readFileSync(resolve(acceptanceDir, 'quality-ladder-report.schema.json'), 'utf8'),
    ) as {
      required: string[]
      properties: Record<string, unknown>
    }
    expect(schema.required).toEqual(
      expect.arrayContaining([
        'qualityMode',
        'phase',
        'tier',
        'score',
        'baseline',
        'incomplete',
      ]),
    )
    expect(schema.required).not.toContain('ttfiMs')
    expect(schema.required).not.toContain('simPassCount')
    expect(schema.required).not.toContain('after')
    const schemaText = JSON.stringify(schema)
    expect(schemaText).not.toContain('62.5')
    expect(schemaText).not.toMatch(/"avgFps":\s*3[0-9]/)
  })

  it('CI workflow stays headless (no gpu / playwright live job)', () => {
    const yml = readFileSync(resolve(process.cwd(), '../../.github/workflows/ci.yml'), 'utf8')
    expect(yml).toContain('node-version: 22')
    expect(yml).not.toMatch(/playwright/i)
    expect(yml).not.toMatch(/ocean-simulation/)
  })
})
