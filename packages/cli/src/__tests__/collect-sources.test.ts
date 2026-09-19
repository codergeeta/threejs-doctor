import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { collectSources } from '../scan/collect-sources.js'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'doctor-scan-'))
  dirs.push(dir)
  return dir
}

describe('collectSources', () => {
  it('honours .gitignore via git when the scan root is a repo', async () => {
    const dir = await scratch()
    spawnSync('git', ['init'], { cwd: dir, stdio: 'ignore' })
    await writeFile(join(dir, '.gitignore'), 'secret.js\nvendor/\n')
    await writeFile(join(dir, 'app.js'), "import { Mesh } from 'three'\nnew Mesh()\n")
    await writeFile(join(dir, 'secret.js'), "import { Mesh } from 'three'\nnew Mesh()\n")
    await mkdir(join(dir, 'vendor'))
    await writeFile(join(dir, 'vendor/three.js'), "import { Mesh } from 'three'\nnew Mesh()\n")
    const files = await collectSources(dir)
    const names = files.map((f) => f.path.replace(/\\/g, '/'))
    expect(names.some((p) => p.endsWith('/app.js'))).toBe(true)
    expect(names.some((p) => p.endsWith('/secret.js'))).toBe(false)
    expect(names.some((p) => p.includes('/vendor/'))).toBe(false)
  })

  it('skips minified files with a very long first line', async () => {
    const dir = await scratch()
    await writeFile(join(dir, 'ok.js'), "import { Mesh } from 'three'\nnew Mesh()\n")
    await writeFile(join(dir, 'bundle.min.js'), `${'a'.repeat(800)};new Mesh();\n`)
    const files = await collectSources(dir)
    expect(files.some((f) => f.path.endsWith('ok.js'))).toBe(true)
    expect(files.some((f) => f.path.endsWith('bundle.min.js'))).toBe(false)
  })

  it('skips vendored three internals that carry a REVISION banner', async () => {
    const dir = await scratch()
    await writeFile(
      join(dir, 'three.module.js'),
      `/**\n * @license\n * Copyright 2010-2026 Three.js Authors\n */\nconst REVISION = '185';\nexport const Mesh = function() {}\n`,
    )
    await writeFile(join(dir, 'game.js'), "import { Mesh } from 'three'\nnew Mesh()\n")
    const files = await collectSources(dir)
    expect(files.some((f) => f.path.endsWith('game.js'))).toBe(true)
    expect(files.some((f) => f.path.endsWith('three.module.js'))).toBe(false)
  })

  it('batches git check-ignore instead of spawning once per file', async () => {
    const dir = await scratch()
    spawnSync('git', ['init'], { cwd: dir, stdio: 'ignore' })
    await writeFile(join(dir, '.gitignore'), 'skip-*.js\n')
    for (let i = 0; i < 12; i++) {
      await writeFile(join(dir, `app-${i}.js`), "import { Mesh } from 'three'\nnew Mesh()\n")
      await writeFile(join(dir, `skip-${i}.js`), "import { Mesh } from 'three'\nnew Mesh()\n")
    }
    const files = await collectSources(dir)
    expect(files.filter((f) => /app-\d+\.js$/.test(f.path))).toHaveLength(12)
    expect(files.some((f) => f.path.includes('skip-'))).toBe(false)
    const src = await readFile(join(dirname(fileURLToPath(import.meta.url)), '../scan/collect-sources.ts'), 'utf8')
    expect(src).toMatch(/check-ignore',\s*'--stdin',\s*'-z'/)
    expect(src).toMatch(/function gitIgnoredAbsPaths/)
    expect(src).not.toMatch(/for \(const file of files\)[\s\S]{0,200}check-ignore', '-q'/)
  })
})
