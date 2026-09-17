import type { CliArgs } from '../cli.js'
import type { DoctorReport } from '@threejs-doctor/runtime'

export async function runBench(args: CliArgs): Promise<DoctorReport> {
  const { runBenchSuite } = await import('@threejs-doctor/bench')
  return runBenchSuite({
    profile: args.profile === 'auto' ? 'marketing' : args.profile,
    budget: args.budget,
  })
}
