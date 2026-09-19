#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let cli
try {
  cli = require.resolve('@threejs-doctor/cli/bin/threejs-doctor.js')
} catch {
  console.error(`threejs-doctor reserves the unscoped npm name and forwards to @threejs-doctor/cli.

Install:
  npm i @threejs-doctor/runtime
  npm i -D @threejs-doctor/cli

  npx threejs-doctor bench --profile product --budget low
  npx @threejs-doctor/cli bench --profile product --budget low`)
  process.exit(1)
}

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
