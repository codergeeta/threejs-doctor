import type { DoctorReport } from '@threejs-doctor/runtime'

function sarifLevel(severity: string): 'error' | 'warning' | 'note' {
  if (severity === 'error') return 'error'
  if (severity === 'info') return 'note'
  return 'warning'
}

/** GitHub-compatible SARIF 2.1.0 for `scan --format sarif`. */
export function formatSarifReport(report: DoctorReport): string {
  const results = report.findings.map((finding) => {
    const file = typeof finding.evidence.file === 'string' ? finding.evidence.file : undefined
    const line = typeof finding.evidence.line === 'number' ? finding.evidence.line : undefined
    const result: Record<string, unknown> = {
      ruleId: finding.id,
      level: sarifLevel(finding.severity),
      message: { text: finding.message },
    }
    if (file) {
      result.locations = [
        {
          physicalLocation: {
            artifactLocation: { uri: file.replace(/\\/g, '/') },
            ...(line !== undefined ? { region: { startLine: line } } : {}),
          },
        },
      ]
    }
    return result
  })

  return JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'threejs-doctor',
              informationUri: 'https://github.com/codergeeta/threejs-doctor',
              rules: [],
            },
          },
          properties: {
            staticScan: Boolean(report.staticScan),
            score: report.score,
            scoreKind: report.staticScan ? 'static' : 'runtime',
            profile: report.profile,
            note: report.staticScan
              ? 'Static Doctor Score from source patterns; 100 is not a runtime speed claim.'
              : undefined,
          },
          results,
        },
      ],
    },
    null,
    2,
  )
}
