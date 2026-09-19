import { describe, it, expect } from 'vitest'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { main } from '../cli.js'
import { runScan } from '../commands/scan.js'
import type { CliArgs } from '../cli.js'

const here = dirname(fileURLToPath(import.meta.url))

const baseArgs: CliArgs = {
  command: 'scan',
  path: '.',
  format: 'json',
  profile: 'marketing',
  budget: 'low',
  minScore: 70,
}

describe('runScan static analysis', () => {
  it('scores a heavy marketing scene below a healthy one using real rule IDs', async () => {
    const heavy = await runScan({
      ...baseArgs,
      path: resolve(here, 'fixtures/heavy-static'),
    })
    const healthy = await runScan({
      ...baseArgs,
      path: resolve(here, 'fixtures/healthy-static'),
    })

    expect(heavy.mode).toBe('diagnose')
    expect(heavy.incomplete).toBe(false)
    expect(heavy.findings.map((f) => f.id)).toEqual(
      expect.arrayContaining([
        'lights/too-many',
        'shadows/too-many-casters',
        'frameloop/continuous-static',
        'renderer/uncapped-dpr',
        'renderer/antialias-postfx-risk',
        'culling/frustum-disabled',
      ]),
    )
    expect(heavy.findings.some((f) => f.id === 'draw-calls/too-many')).toBe(false)
    expect(heavy.findings.some((f) => f.id === 'triangles/too-many')).toBe(false)
    expect(heavy.score).toBeLessThan(70)
    expect(healthy.score).toBeGreaterThan(heavy.score)
    expect(healthy.score).toBeGreaterThanOrEqual(90)
    expect(healthy.findings.some((f) => f.severity === 'error')).toBe(false)
    expect(healthy.baseline.lightCount).toBe(2)
    expect('avgFps' in healthy.baseline).toBe(false)
    expect('p95FrameTimeMs' in healthy.baseline).toBe(false)
    expect(healthy.after).toBeUndefined()
  })

  it('marks a project with no Three.js patterns incomplete', async () => {
    const report = await runScan({
      ...baseArgs,
      path: resolve(here, 'fixtures/empty-project'),
    })
    expect(report.incomplete).toBe(true)
    expect(report.findings.some((f) => f.id === 'scan/no-threejs-detected')).toBe(true)
  })

  it('does not classify a small static scene as product just because draw calls are unknown', async () => {
    const report = await runScan({
      ...baseArgs,
      profile: 'auto',
      path: resolve(here, 'fixtures/heavy-static'),
    })
    expect(report.profile).toBe('game')
    expect(report.findings.some((f) => f.id === 'shadows/too-many-casters')).toBe(true)
    expect(report.findings.some((f) => f.id === 'frameloop/continuous-static')).toBe(false)
    expect(report.findings.some((f) => f.autoFix === 'frameloop-demand')).toBe(false)
    expect(report.score).toBeLessThan(70)
  })

  it('flags uncapped devicePixelRatio on product/mid instead of treating assumed DPR 2 as in-budget', async () => {
    const report = await runScan({
      ...baseArgs,
      profile: 'product',
      budget: 'mid',
      path: resolve(here, 'fixtures/html-three'),
    })
    expect(report.findings.some((f) => f.id === 'renderer/uncapped-dpr')).toBe(true)
  })

  it('scans a single HTML entry', async () => {
    const report = await runScan({
      ...baseArgs,
      path: resolve(here, 'fixtures/html-three/index.html'),
    })
    expect(report.incomplete).toBe(false)
    expect(report.findings.map((f) => f.id)).toEqual(
      expect.arrayContaining(['shadows/too-many-casters', 'frameloop/continuous-static']),
    )
  })

  it('classifies auto as game for any continuous rAF/render loop even with few mesh constructors', async () => {
    const report = await runScan({
      ...baseArgs,
      profile: 'auto',
      path: resolve(here, 'fixtures/html-three/index.html'),
    })
    expect(report.profile).toBe('game')
    expect(report.findings.some((f) => f.id === 'frameloop/continuous-static')).toBe(false)
  })

  it('drops materials/too-unique from static scans', async () => {
    const report = await runScan({
      ...baseArgs,
      profile: 'marketing',
      path: resolve(here, 'fixtures/unique-materials'),
    })
    expect(report.findings.some((f) => f.id === 'materials/too-unique')).toBe(false)
  })

  it('attaches file:line to findings and labels the score as static', async () => {
    const report = await runScan({
      ...baseArgs,
      path: resolve(here, 'fixtures/heavy-static'),
    })
    expect(report.staticScan).toBe(true)
    const caster = report.findings.find((f) => f.id === 'shadows/too-many-casters')
    expect(typeof caster?.evidence.file).toBe('string')
    expect(typeof caster?.evidence.line).toBe('number')
    expect(String(caster?.evidence.file)).toMatch(/scene\.js$/)
    expect(Number(caster?.evidence.line)).toBeGreaterThan(0)
    const frustum = report.findings.find((f) => f.id === 'culling/frustum-disabled')
    expect(frustum?.evidence.line).toBeDefined()
  })

  it('emits composer pixel-ratio drift with a location', async () => {
    const report = await runScan({
      ...baseArgs,
      profile: 'game',
      path: resolve(here, 'fixtures/composer-drift'),
    })
    const hit = report.findings.find((f) => f.id === 'renderer/composer-pixel-ratio-drift')
    expect(hit).toBeDefined()
    expect(hit?.evidence.file).toMatch(/composer\.js$/)
    expect(typeof hit?.evidence.line).toBe('number')
    expect(hit?.suggestedFix).toMatch(/setPixelRatio/)
    expect(hit?.suggestedFix).not.toMatch(/setPixelRatio or composer\.setSize/)
  })

  it('flags vanilla EffectComposer setSize-only as composer pixel-ratio drift', async () => {
    const report = await runScan({
      ...baseArgs,
      profile: 'game',
      path: resolve(here, 'fixtures/composer-setsize-only'),
    })
    expect(report.findings.some((f) => f.id === 'renderer/composer-pixel-ratio-drift')).toBe(true)
  })

  it('does not flag vanilla EffectComposer when setPixelRatio is synced', async () => {
    const report = await runScan({
      ...baseArgs,
      profile: 'game',
      path: resolve(here, 'fixtures/composer-setpixelratio'),
    })
    expect(report.findings.some((f) => f.id === 'renderer/composer-pixel-ratio-drift')).toBe(false)
  })

  it('does not flag pmndrs postprocessing setSize-only as drift', async () => {
    const report = await runScan({
      ...baseArgs,
      profile: 'game',
      path: resolve(here, 'fixtures/composer-pmndrs-setsize'),
    })
    expect(report.findings.some((f) => f.id === 'renderer/composer-pixel-ratio-drift')).toBe(false)
  })

  it('exposes every frustum-disabled location, not only the first file', async () => {
    const report = await runScan({
      ...baseArgs,
      profile: 'game',
      path: resolve(here, 'fixtures/frustum-multi'),
    })
    const hit = report.findings.find((f) => f.id === 'culling/frustum-disabled')
    expect(hit).toBeDefined()
    const files = (hit?.locations ?? []).map((l) => String(l.file).replace(/\\/g, '/'))
    expect(files.some((p) => p.endsWith('Effects.js'))).toBe(true)
    expect(files.some((p) => p.endsWith('Environment.js'))).toBe(true)
    expect(hit?.locations?.length).toBeGreaterThanOrEqual(3)
  })

  it('downgrades Points/Line/Sprite frustumCulled=false to info', async () => {
    const report = await runScan({
      ...baseArgs,
      profile: 'game',
      path: resolve(here, 'fixtures/fx-culling'),
    })
    const meshHit = report.findings.find(
      (f) => f.id === 'culling/frustum-disabled' && f.severity === 'warn',
    )
    expect(meshHit).toBeUndefined()
    const fx = report.findings.filter((f) => f.id === 'culling/frustum-disabled')
    expect(fx.length).toBeGreaterThan(0)
    expect(fx.every((f) => f.severity === 'info')).toBe(true)
    expect(fx[0]?.evidence.file).toBeDefined()
  })

  it('reports finding paths relative to the git root, not only the scan subdirectory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'doctor-gitpath-'))
    try {
      spawnSync('git', ['init'], { cwd: dir, stdio: 'ignore' })
      await mkdir(join(dir, 'src', 'game'), { recursive: true })
      await writeFile(
        join(dir, 'src', 'game', 'Environment.js'),
        "import { Mesh } from 'three'\nconst forest = new Mesh()\nforest.frustumCulled = false\n",
      )
      const report = await runScan({
        ...baseArgs,
        profile: 'game',
        path: join(dir, 'src', 'game'),
      })
      const hit = report.findings.find((f) => f.id === 'culling/frustum-disabled')
      expect(String(hit?.evidence.file).replace(/\\/g, '/')).toBe('src/game/Environment.js')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('ci gate uses the same scan path', () => {
  it('exits 1 with a clear message when score is below --min-score', async () => {
    const chunks: string[] = []
    const code = await main(
      ['ci', resolve(here, 'fixtures/heavy-static'), '--min-score', '90', '--profile', 'marketing', '--budget', 'low'],
      {
        runScan,
        runBench: async () => {
          throw new Error('ci must not call bench')
        },
        write: (text) => {
          chunks.push(text)
        },
      },
    )
    const out = chunks.join('\n')
    expect(code).toBe(1)
    expect(out.toLowerCase()).not.toContain('not implemented')
    expect(out).toMatch(/score \d+ < --min-score 90/)
    expect(out).toContain('Doctor Score:')
  })

  it('exits 0 when a healthy scan meets --min-score', async () => {
    const chunks: string[] = []
    const code = await main(
      ['ci', resolve(here, 'fixtures/healthy-static'), '--min-score', '70', '--profile', 'marketing', '--budget', 'low'],
      {
        runScan,
        runBench: async () => {
          throw new Error('ci must not call bench')
        },
        write: (text) => {
          chunks.push(text)
        },
      },
    )
    expect(code).toBe(0)
    expect(chunks.join('\n').toLowerCase()).not.toContain('not implemented')
  })

  it('exits 1 when no Three.js is found even at --min-score 0', async () => {
    const chunks: string[] = []
    const code = await main(
      ['ci', resolve(here, 'fixtures/empty-project'), '--min-score', '0'],
      {
        runScan,
        runBench: async () => {
          throw new Error('ci must not call bench')
        },
        write: (text) => {
          chunks.push(text)
        },
      },
    )
    expect(code).toBe(1)
    expect(chunks.join('\n')).toMatch(/incomplete/i)
  })
})
