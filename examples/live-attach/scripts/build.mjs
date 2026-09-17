import * as esbuild from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

await esbuild.build({
  absWorkingDir: pkg,
  entryPoints: ['src/browser.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/attach.iife.js',
  legalComments: 'none',
  banner: {
    js: '/* @threejs-doctor/live-attach-example unpublished. Paste into DevTools. Do not invent metrics. */',
  },
  alias: {
    '@threejs-doctor/runtime': path.resolve(pkg, '../../packages/runtime/src/index.ts'),
    '@threejs-doctor/core': path.resolve(pkg, '../../packages/core/src/index.ts'),
    '@threejs-doctor/rules': path.resolve(pkg, '../../packages/rules/src/index.ts'),
    '@threejs-doctor/ocean-adapter-example': path.resolve(pkg, '../ocean-adapter/src/index.ts'),
  },
})

console.log('wrote dist/attach.iife.js')
