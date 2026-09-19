import { readFileSync } from 'node:fs'
import type { CliArgs } from '../cli.js'
import { formatHtmlReport } from '../report/html.js'

export function runReport(args: CliArgs): string {
  const raw = readFileSync(args.path, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`report input is not JSON: ${args.path}`)
  }
  return formatHtmlReport(parsed, args.repo ? { repoUrl: args.repo } : {})
}
