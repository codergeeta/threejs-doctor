import type { DoctorReport } from '@threejs-doctor/runtime'

export function formatHumanReport(report: DoctorReport): string {
  const lines: string[] = []
  lines.push(`threejs-doctor — profile=${report.profile} mode=${report.mode}`)
  lines.push(`Doctor Score: ${report.score}`)
  lines.push('')
  lines.push('Findings:')
  if (report.findings.length === 0) lines.push('  (none)')
  for (const f of report.findings) {
    lines.push(`  [${f.severity}] ${f.id}: ${f.message}`)
    lines.push(`    fix: ${f.suggestedFix}`)
  }
  lines.push('')
  lines.push('Baseline → After (deltas):')
  const keys = Object.keys(report.baseline) as Array<keyof typeof report.baseline>
  for (const key of keys) {
    const base = report.baseline[key]
    const after = report.after?.[key]
    const delta = report.deltas?.[key]
    lines.push(
      `  ${String(key)}: ${base}${after === undefined ? '' : ` → ${after}`}${
        delta === undefined ? '' : ` (${delta >= 0 ? '+' : ''}${delta})`
      }`,
    )
  }
  lines.push('')
  lines.push(`Applied passes: ${report.appliedPasses.join(', ') || '(none)'}`)
  if (report.failedPasses.length) {
    lines.push('Failed passes:')
    for (const p of report.failedPasses) lines.push(`  ${p.id}: ${p.error}`)
  }
  if (report.incomplete) {
    lines.push('Run incomplete: after metrics unavailable; baseline retained.')
  }
  if (report.visualDelta) {
    lines.push(
      report.rolledBackDueToVisual
        ? 'Visual delta vs control (confirmed); applied passes were rolled back. Capture must use a fixed viewpoint.'
        : 'Visual delta vs control; do not treat apply: [safe] as visually safe.',
    )
  }
  return lines.join('\n')
}
