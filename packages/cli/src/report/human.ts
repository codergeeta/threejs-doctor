import type { DoctorReport } from '@threejs-doctor/runtime'

function locationSuffix(evidence: { file?: unknown; line?: unknown }): string {
  if (typeof evidence.file === 'string' && typeof evidence.line === 'number') {
    return ` (${evidence.file}:${evidence.line})`
  }
  return ''
}

export function formatHumanReport(report: DoctorReport): string {
  const lines: string[] = []
  lines.push(`threejs-doctor — profile=${report.profile} mode=${report.mode}`)
  if (report.staticScan) {
    lines.push(
      `Static Doctor Score: ${report.score} (source patterns only; not a runtime speed / FPS score)`,
    )
  } else {
    lines.push(`Doctor Score: ${report.score}`)
  }
  lines.push('')
  lines.push('Findings:')
  if (report.findings.length === 0) lines.push('  (none)')
  for (const f of report.findings) {
    lines.push(`  [${f.severity}] ${f.id}: ${f.message}${locationSuffix(f.evidence)}`)
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
    const noThree = report.findings.some((f) => f.id === 'scan/no-threejs-detected')
    lines.push(
      noThree
        ? 'Run incomplete: no Three.js patterns found in scanned files.'
        : 'Run incomplete: after metrics unavailable; baseline retained.',
    )
  }
  if (report.staticScan || (!report.after && report.mode === 'diagnose')) {
    lines.push('')
    lines.push(
      report.staticScan
        ? 'Static source scan. Runtime metrics (FPS, draw calls, drawn triangles, VRAM, GPU) were omitted. A score of 100 is not a “fast” claim.'
        : 'Static source scan. Runtime metrics (FPS, draw calls, drawn triangles, VRAM, GPU) were omitted.',
    )
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
