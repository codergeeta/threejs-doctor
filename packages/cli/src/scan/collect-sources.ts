import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

const SOURCE_EXT = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.html',
  '.htm',
  '.vue',
])

const SKIP_DIR = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.next',
  '.turbo',
  'out',
  'vendor',
  '__tests__',
  '__mocks__',
])

const MAX_FILE_BYTES = 1_000_000

export interface SourceFile {
  path: string
  source: string
}

async function walk(dir: string, files: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(entry.name) || entry.name.startsWith('.')) continue
      await walk(full, files)
      continue
    }
    if (!entry.isFile()) continue
    files.push(full)
  }
}

export async function collectSources(root: string): Promise<SourceFile[]> {
  const abs = resolve(root)
  let info
  try {
    info = await stat(abs)
  } catch {
    throw new Error(`scan path not found: ${root}`)
  }

  const files: string[] = []
  if (info.isFile()) files.push(abs)
  else if (info.isDirectory()) await walk(abs, files)
  else throw new Error(`scan path is not a file or directory: ${root}`)

  const out: SourceFile[] = []
  for (const file of files) {
    if (!SOURCE_EXT.has(extname(file).toLowerCase())) continue
    if (/\.test\.[cm]?[jt]sx?$/.test(file)) continue
    if (/\.d\.ts$/.test(file)) continue
    const source = await readFile(file, 'utf8')
    if (source.length > MAX_FILE_BYTES) continue
    out.push({ path: file, source })
  }
  return out
}
