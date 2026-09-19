import { formatHumanReport } from './report/human.js'
import { formatJsonReport } from './report/json.js'
import type { DoctorReport } from '@threejs-doctor/runtime'
import type { Profile } from '@threejs-doctor/core'

export interface CliArgs {
  command: 'scan' | 'bench' | 'ci' | 'help'
  path: string
  format: 'human' | 'json'
  profile: Profile
  budget: 'low' | 'mid' | 'high'
  minScore: number
}

export interface CliDeps {
  runScan: (args: CliArgs) => Promise<DoctorReport>
  runBench: (args: CliArgs) => Promise<DoctorReport>
  write: (text: string) => void
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
  if (cmd === 'scan' || cmd === 'bench' || cmd === 'ci' || cmd === 'help') {
    args.command = cmd
  }
  if ((cmd === 'scan' || cmd === 'ci') && argv[1] && !argv[1].startsWith('-')) {
    args.path = argv[1]!
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--format') args.format = argv[++i] === 'json' ? 'json' : 'human'
    if (a === '--profile') args.profile = argv[++i] as Profile
    if (a === '--budget') args.budget = (argv[++i] as CliArgs['budget']) ?? 'low'
    if (a === '--min-score') args.minScore = Number(argv[++i])
  }
  return args
}

export async function main(
  argv: string[] = process.argv.slice(2),
  deps?: CliDeps,
): Promise<number> {
  const args = parseArgs(argv)
  const write = deps?.write ?? ((t: string) => console.log(t))
  if (args.command === 'help') {
    write(`Usage:
  npx threejs-doctor scan [path] [--format human|json] [--profile auto|marketing|product|game|cad] [--budget low|mid|high]
  npx threejs-doctor bench --profile <profile> --budget low [--format human|json]
  npx threejs-doctor ci [path] [--min-score 70] [--format human|json] [--profile auto|marketing|product|game|cad] [--budget low|mid|high]
  npx @threejs-doctor/cli scan [path]`)
    return 0
  }

  if (args.command === 'ci' && !Number.isFinite(args.minScore)) {
    write('error: --min-score must be a finite number')
    return 1
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

  write(args.format === 'json' ? formatJsonReport(report) : formatHumanReport(report))

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
