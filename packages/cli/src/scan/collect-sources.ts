import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

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
  'test',
  'tests',
  'spec',
])

const MAX_FILE_BYTES = 1_000_000

export interface SourceFile {
  path: string
  source: string
}

function gitTopLevel(dir: string): string | undefined {
  try {
    const r = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    if (r.status !== 0) return undefined
    const top = r.stdout.trim()
    return top || undefined
  } catch {
    return undefined
  }
}

function gitIsIgnored(cwd: string, file: string): boolean | undefined {
  try {
    const r = spawnSync('git', ['-C', cwd, 'check-ignore', '-q', '--no-index', file], {
      stdio: 'ignore',
    })
    if (r.status === 0) return true
    if (r.status === 1) return false
    return undefined
  } catch {
    return undefined
  }
}

function parseGitignore(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

function globToRegExp(pattern: string): RegExp {
  let p = pattern
  const anchored = p.startsWith('/')
  if (anchored) p = p.slice(1)
  if (p.endsWith('/')) p = p.slice(0, -1)
  const body = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DS::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DS::/g, '.*')
  return anchored ? new RegExp(`^${body}(?:/|$)`) : new RegExp(`(?:^|/)${body}(?:/|$)`)
}

function matchesGitignore(relPosix: string, patterns: string[]): boolean {
  let ignored = false
  for (const raw of patterns) {
    const negated = raw.startsWith('!')
    const pattern = negated ? raw.slice(1) : raw
    if (!pattern) continue
    if (globToRegExp(pattern).test(relPosix)) ignored = !negated
  }
  return ignored
}

async function loadGitignorePatterns(dir: string): Promise<string[]> {
  try {
    return parseGitignore(await readFile(join(dir, '.gitignore'), 'utf8'))
  } catch {
    return []
  }
}

function isMinified(source: string): boolean {
  const newline = source.indexOf('\n')
  const first = newline === -1 ? source : source.slice(0, newline)
  if (first.length >= 500) return true
  const lines = source.split('\n')
  if (lines.length === 0) return true
  const avg = source.length / lines.length
  return avg > 250 && lines.length < 40
}

function isVendoredThree(filePath: string, source: string): boolean {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? ''
  const head = source.slice(0, 4000)
  if (/^three(?:\.module|\.core|\.min)?\.js$/i.test(base) && /\bREVISION\s*=/.test(head)) return true
  if (/Three\.js Authors/i.test(head) && /\bREVISION\s*=\s*['"]\d+/.test(head)) return true
  if (/\bTHREE\.REVISION\b/.test(head) && /three/i.test(head) && /@license/i.test(head)) return true
  return false
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

async function shouldSkipFile(
  file: string,
  scanRoot: string,
  gitRoot: string | undefined,
  fallbackIgnore: string[],
): Promise<boolean> {
  if (gitRoot) {
    const ignored = gitIsIgnored(gitRoot, file)
    if (ignored === true) return true
    if (ignored === false) return false
  }
  if (fallbackIgnore.length === 0) return false
  const rel = relative(scanRoot, file).replace(/\\/g, '/')
  return matchesGitignore(rel, fallbackIgnore)
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

  const scanRoot = info.isDirectory() ? abs : resolve(abs, '..')
  const gitRoot = gitTopLevel(scanRoot)
  const fallbackIgnore = await loadGitignorePatterns(scanRoot)

  const out: SourceFile[] = []
  for (const file of files) {
    if (!SOURCE_EXT.has(extname(file).toLowerCase())) continue
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) continue
    if (/\.d\.ts$/.test(file)) continue
    if (await shouldSkipFile(file, scanRoot, gitRoot, fallbackIgnore)) continue
    const size = (await stat(file)).size
    if (size > MAX_FILE_BYTES) continue
    const source = await readFile(file, 'utf8')
    if (isMinified(source)) continue
    if (isVendoredThree(file, source)) continue
    out.push({ path: file, source })
  }
  return out
}
