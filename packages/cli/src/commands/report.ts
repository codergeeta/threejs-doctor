import { readFileSync } from 'node:fs'
import type { CliArgs } from '../cli.js'
import { formatHtmlReport } from '../report/html.js'
import {
  collectUnrecognisedTopLevelKeys,
  formatUnrecognisedKeysWarning,
} from '../report/known-keys.js'

export function runReport(args: CliArgs, warn: (message: string) => void = console.warn): string {
  const raw = readFileSync(args.path, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`report input is not JSON: ${args.path}`)
  }
  const unknown = collectUnrecognisedTopLevelKeys(parsed)
  if (unknown.length > 0) warn(formatUnrecognisedKeysWarning(unknown))
  return formatHtmlReport(parsed, args.repo ? { repoUrl: args.repo } : {})
}
