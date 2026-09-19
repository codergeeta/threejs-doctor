#!/usr/bin/env node
/**
 * Fail if a published package that claims provenance has empty dist.attestations.
 *
 * Local / dry-run: do nothing unless --published is passed (so `pnpm publish:dry`
 * and unit tests never hit the registry).
 *
 * After a real npm publish (publish.yml): `node scripts/check-provenance.mjs --published`
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const PUBLISH_ORDER = [
  'packages/threejs-doctor',
  'packages/core',
  'packages/rules',
  'packages/runtime',
  'packages/bench',
  'packages/cli',
  'packages/r3f',
]

export function attestationsMissing(value) {
  if (value == null) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  if (typeof value === 'string') return value.trim().length === 0
  return false
}

export function shouldCheckPublishedRegistry(argv) {
  return argv.includes('--published') && !argv.includes('--dry-run')
}

function readPkg(dir) {
  return JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8'))
}

function npmViewAttestations(name, version) {
  const spec = `${name}@${version}`
  try {
    const out = execFileSync('npm', ['view', spec, 'dist.attestations', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const trimmed = out.trim()
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return undefined
    return JSON.parse(trimmed)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`npm view ${spec} dist.attestations failed: ${message}`)
  }
}

export function main(argv = process.argv.slice(2)) {
  if (!shouldCheckPublishedRegistry(argv)) {
    console.log('Skipping registry provenance check (pass --published after npm publish).')
    return 0
  }
  const failures = []
  for (const dir of PUBLISH_ORDER) {
    const pkg = readPkg(dir)
    if (pkg.publishConfig?.provenance !== true) continue
    const attestations = npmViewAttestations(pkg.name, pkg.version)
    if (attestationsMissing(attestations)) {
      failures.push(`${pkg.name}@${pkg.version}`)
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Provenance attestations missing for: ${failures.join(', ')}. ` +
        'Publish via .github/workflows/publish.yml after Trusted Publisher is attached; token publishes leave dist.attestations empty.',
    )
  }
  console.log('Provenance attestations present for all provenance-claiming packages.')
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main())
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}
