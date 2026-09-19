import { writeFileSync } from 'node:fs'
import { formatHumanReport } from './report/human.js'
import { formatJsonReport } from './report/json.js'
import { formatSarifReport } from './report/sarif.js'
import { formatHtmlReport } from './report/html.js'
import type { DoctorReport } from '@threejs-doctor/runtime'
import type { Profile } from '@threejs-doctor/core'

export interface CliArgs {
  command: 'scan' | 'bench' | 'ci' | 'help' | 'report'
  path: string
  format: 'human' | 'json' | 'sarif' | 'html'
  profile: Profile
  budget: 'low' | 'mid' | 'high'
  minScore: number
  output?: string
  repo?: string
}

export interface CliDeps {
  runScan: (args: CliArgs) => Promise<DoctorReport>
  runBench: (args: CliArgs) => Promise<DoctorReport>
  write: (text: string) => void
}

function parseFormat(value: string | undefined): CliArgs['format'] {
  if (value === 'json' || value === 'sarif' || value === 'html') return value
  return 'human'
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: 'help',
    path: '.',
    format: 'human',
    profile: 'auto',
    budget: 'low',
    minScore: 70,
  }
  if (argv.length === 0) return args
  const cmd = argv[0]
  if (cmd === 'scan' || cmd === 'bench' || cmd === 'ci' || cmd === 'help' || cmd === 'report') {
    args.command = cmd
  }
  if ((cmd === 'scan' || cmd === 'ci' || cmd === 'report') && argv[1] && !argv[1].startsWith('-')) {
    args.path = argv[1]!
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--format') {
      args.format = parseFormat(argv[++i])
    }
    if (a === '--profile') args.profile = argv[++i] as Profile
    if (a === '--budget') args.budget = (argv[++i] as CliArgs['budget']) ?? 'low'
    if (a === '--min-score') args.minScore = Number(argv[++i])
    if (a === '--output' || a === '-o') {
      const value = argv[++i]
      if (value) args.output = value
    }
    if (a === '--repo') {
      const value = argv[++i]
      if (value) args.repo = value
    }
  }
  return args
}

function emit(text: string, args: CliArgs, write: (text: string) => void): void {
  if (args.output) {
    writeFileSync(args.output, text)
    write(`wrote ${args.output}`)
    return
  }
  write(text)
}

export async function main(
  argv: string[] = process.argv.slice(2),
  deps?: CliDeps,
): Promise<number> {
  const args = parseArgs(argv)
  const write = deps?.write ?? ((t: string) => console.log(t))
  if (args.command === 'help') {
    write(`Usage:
  npx threejs-doctor scan [path] [--format human|json|sarif|html] [--profile auto|marketing|product|game|cad] [--budget low|mid|high] [--output file]
  npx threejs-doctor report <report.json> [--output report.html] [--repo https://github.com/org/repo]
  npx threejs-doctor bench --profile <profile> --budget low [--format human|json]
  npx threejs-doctor ci [path] [--min-score 70] [--format human|json|html] [--profile auto|marketing|product|game|cad] [--budget low|mid|high]
  npx @threejs-doctor/cli scan [path]`)
    return 0
  }

  if (args.command === 'ci' && !Number.isFinite(args.minScore)) {
    write('error: --min-score must be a finite number')
    return 1
  }

  if (args.command === 'report') {
    try {
      const { runReport } = await import('./commands/report.js')
      emit(runReport(args), args, write)
      return 0
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      write(`error: ${message}`)
      return 1
    }
  }

  const runScan = deps?.runScan ?? (await import('./commands/scan.js')).runScan
  const runBench = deps?.runBench ?? (await import('./commands/bench.js')).runBench

  let report: DoctorReport
  try {
    report = args.command === 'bench' ? await runBench(args) : await runScan(args)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const code =
      err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined
    if (code === 'SCAN_NOT_IMPLEMENTED' || message.toLowerCase().includes('not implemented')) {
      write(message)
      return 1
    }
    if (/^scan path (not found|is not a file)/i.test(message)) {
      write(`error: ${message}`)
      return 1
    }
    throw err
  }

  const text =
    args.format === 'json'
      ? formatJsonReport(report)
      : args.format === 'sarif'
        ? formatSarifReport(report)
        : args.format === 'html'
          ? formatHtmlReport(report, args.repo ? { repoUrl: args.repo } : {})
          : formatHumanReport(report)
  emit(text, args, write)

  if (args.command === 'ci') {
    const hasError = report.findings.some((f) => f.severity === 'error')
    if (report.score < args.minScore || hasError || report.incomplete) {
      const reasons: string[] = []
      if (report.score < args.minScore) {
        reasons.push(`score ${report.score} < --min-score ${args.minScore}`)
      }
      if (hasError) reasons.push('error-severity finding(s)')
      if (report.incomplete) reasons.push('report incomplete')
      write(`CI gate failed: ${reasons.join('; ')}`)
      return 1
    }
  }
  return 0
}
