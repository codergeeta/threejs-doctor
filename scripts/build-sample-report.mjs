#!/usr/bin/env node
/**
 * Generate sample-report.html from docs/sample-report.json using the CLI.
 * Usage: node scripts/build-sample-report.mjs [outdir]
 * Default outdir is _site/ (Pages artifact). Requires `pnpm build` first.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.resolve(root, process.argv[2] ?? '_site')
const jsonPath = path.join(root, 'docs/sample-report.json')
const bin = path.join(root, 'packages/cli/bin/threejs-doctor.js')
const htmlPath = path.join(outDir, 'sample-report.html')

mkdirSync(outDir, { recursive: true })
const result = spawnSync(
  process.execPath,
  [bin, 'report', jsonPath, '-o', htmlPath, '--repo', 'https://github.com/codergeeta/threejs-doctor'],
  { cwd: root, encoding: 'utf8' },
)
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'report failed\n')
  process.exit(result.status ?? 1)
}
const html = readFileSync(htmlPath, 'utf8')
writeFileSync(path.join(outDir, 'index.html'), html)
copyFileSync(jsonPath, path.join(outDir, 'sample-report.json'))
console.log(`wrote ${htmlPath}`)
