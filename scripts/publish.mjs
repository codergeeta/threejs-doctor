#!/usr/bin/env node
/**
 * Publish order (checklist): unscoped threejs-doctor FIRST, then scoped packages
 * in dependency order. Never publishes example packages.
 *
 *   node scripts/publish.mjs           # dry-run (OK locally)
 *   node scripts/publish.mjs --go      # actually publish — GitHub Actions only
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const go = process.argv.includes('--go')

/** Unscoped name reservation first, then scoped (dep order). */
export const PUBLISH_ORDER = [
  'packages/threejs-doctor',
  'packages/core',
  'packages/rules',
  'packages/runtime',
  'packages/bench',
  'packages/cli',
  'packages/r3f',
]

export function assertPublishGoAllowed(doGo, env = process.env) {
  if (!doGo) return
  if (env.GITHUB_ACTIONS === 'true') return
  throw new Error(
    'Refusing to publish from outside GitHub Actions.\n' +
      'The next publish must be the "publish" workflow in .github/workflows/publish.yml ' +
      '(workflow_dispatch — type "publish" to confirm).\n' +
      'Local dry-run is OK: pnpm publish:dry\n' +
      'Do not run pnpm publish:npm --go on a laptop or cloud agent VM.',
  )
}

function readPkg(dir) {
  return JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8'))
}

function main() {
  assertPublishGoAllowed(go)
  const names = []
  for (const dir of PUBLISH_ORDER) {
    const pkg = readPkg(dir)
    if (pkg.private === true) {
      throw new Error(`${dir} (${pkg.name}) is private; refuse to publish`)
    }
    if (!pkg.publishConfig || pkg.publishConfig.access !== 'public') {
      throw new Error(`${dir} (${pkg.name}) must set publishConfig.access=public`)
    }
    names.push(pkg.name)
    const args = ['publish', '--access', 'public', '--no-git-checks']
    if (!go) args.push('--dry-run')
    console.log(`${go ? 'PUBLISH' : 'DRY-RUN'} ${pkg.name} from ${dir}`)
    execFileSync('pnpm', args, {
      cwd: path.join(root, dir),
      stdio: 'inherit',
      env: {
        ...process.env,
        NPM_CONFIG_PROVENANCE: process.env.NPM_CONFIG_PROVENANCE ?? 'true',
      },
    })
  }
  if (names[0] !== 'threejs-doctor') {
    throw new Error('unscoped threejs-doctor must be first')
  }
  console.log(go ? 'Published:' : 'Dry-run ok:', names.join(', '))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
