#!/usr/bin/env node
/**
 * Fail if a published package that claims provenance has empty dist.attestations.
 *
 * Local / dry-run: do nothing unless --published is passed (so `pnpm publish:dry`
 * and unit tests never hit the registry).
 *
 * After a real npm publish (publish.yml): `node scripts/check-provenance.mjs --published`
 * Retries `npm view … dist.attestations` with backoff (~2–3 min) when the version is
 * not indexed yet (E404) or attestations are still empty, then fails hard.
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

/** Sleeps between attempts: 5s + 10s + 20s + 40s + 60s = 135s (~2–3 min budget). */
export const PROVENANCE_RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 40_000, 60_000]

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

export function shouldUseLatestPublishedVersion(argv) {
  return argv.includes('--latest')
}

export function resolvePublishedVersion(localVersion, argv, latestVersion) {
  return shouldUseLatestPublishedVersion(argv) ? latestVersion : localVersion
}

export function isRetryableProvenanceLookupFailure(err) {
  const message = err instanceof Error ? err.message : String(err)
  if (/\bE401\b|\bE403\b|\bEPERM\b/i.test(message)) return false
  return (
    /\bE404\b/.test(message) ||
    /\bnpm error 404\b/i.test(message) ||
    /No match found for version/i.test(message) ||
    /is not in this registry/i.test(message)
  )
}

function readPkg(dir) {
  return JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8'))
}

function npmViewVersion(name) {
  const out = execFileSync('npm', ['view', name, 'version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return out.trim()
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

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function collectPublishedAttestationFailures({
  packages,
  viewAttestations,
  delaysMs = PROVENANCE_RETRY_DELAYS_MS,
  sleep = defaultSleep,
  log = (msg) => console.error(msg),
}) {
  const attempts = delaysMs.length + 1
  let lastFailures = []
  for (let attempt = 0; attempt < attempts; attempt++) {
    const failures = []
    for (const pkg of packages) {
      const spec = `${pkg.name}@${pkg.version}`
      try {
        const attestations = await viewAttestations(pkg.name, pkg.version)
        if (attestationsMissing(attestations)) {
          failures.push({ spec, reason: 'empty' })
        }
      } catch (err) {
        if (!isRetryableProvenanceLookupFailure(err)) throw err
        failures.push({ spec, reason: 'missing' })
      }
    }
    if (failures.length === 0) return []
    lastFailures = failures
    if (attempt >= delaysMs.length) break
    const delay = delaysMs[attempt]
    const names = failures.map((f) => f.spec).join(', ')
    log(
      `Provenance not visible yet for ${names}; retrying in ${delay / 1000}s ` +
        `(attempt ${attempt + 1}/${attempts}).`,
    )
    await sleep(delay)
  }
  return lastFailures
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  if (!shouldCheckPublishedRegistry(argv)) {
    console.log('Skipping registry provenance check (pass --published after npm publish).')
    return 0
  }
  const viewAttestations = deps.viewAttestations ?? npmViewAttestations
  const viewVersion = deps.viewVersion ?? npmViewVersion
  const sleep = deps.sleep ?? defaultSleep
  const log = deps.log ?? ((msg) => console.error(msg))
  const delaysMs = deps.delaysMs ?? PROVENANCE_RETRY_DELAYS_MS
  const readPkgFn = deps.readPkg ?? readPkg
  const dirs = deps.dirs ?? PUBLISH_ORDER

  const packages = []
  for (const dir of dirs) {
    const pkg = readPkgFn(dir)
    if (pkg.publishConfig?.provenance !== true) continue
    const version = resolvePublishedVersion(
      pkg.version,
      argv,
      shouldUseLatestPublishedVersion(argv) ? viewVersion(pkg.name) : pkg.version,
    )
    packages.push({ name: pkg.name, version })
  }
  const failures = await collectPublishedAttestationFailures({
    packages,
    viewAttestations,
    delaysMs,
    sleep,
    log,
  })
  if (failures.length > 0) {
    throw new Error(
      `Provenance attestations missing for: ${failures.map((f) => f.spec).join(', ')}. ` +
        'Publish via .github/workflows/publish.yml (`npm publish --provenance` with id-token: write). ' +
        'Provenance attestations can be produced with NPM_TOKEN; Trusted Publisher lets you delete the token later.',
    )
  }
  console.log('Provenance attestations present for all provenance-claiming packages.')
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    })
}
