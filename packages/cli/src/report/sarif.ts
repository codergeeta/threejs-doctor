import type { DoctorReport } from '@threejs-doctor/runtime'
import type { Finding } from '@threejs-doctor/rules'

function sarifLevel(severity: string): 'error' | 'warning' | 'note' {
  if (severity === 'error') return 'error'
  if (severity === 'info') return 'note'
  return 'warning'
}

function findingSites(finding: Finding): Array<{ file: string; line?: number }> {
  if (finding.locations && finding.locations.length > 0) {
    return finding.locations.map((loc) => ({ file: loc.file, line: loc.line }))
  }
  const file = typeof finding.evidence.file === 'string' ? finding.evidence.file : undefined
  const line = typeof finding.evidence.line === 'number' ? finding.evidence.line : undefined
  if (!file) return []
  return line === undefined ? [{ file }] : [{ file, line }]
}

function physicalLocation(file: string, line?: number): Record<string, unknown> {
  return {
    physicalLocation: {
      artifactLocation: { uri: file.replace(/\\/g, '/') },
      ...(line !== undefined ? { region: { startLine: line } } : {}),
    },
  }
}

/** GitHub-compatible SARIF 2.1.0 for `scan --format sarif`. */
export function formatSarifReport(report: DoctorReport): string {
  const rulesById = new Map<string, Record<string, unknown>>()
  const results = report.findings.map((finding) => {
    if (!rulesById.has(finding.id)) {
      rulesById.set(finding.id, {
        id: finding.id,
        shortDescription: { text: finding.message },
        help: { text: finding.suggestedFix },
        defaultConfiguration: { level: sarifLevel(finding.severity) },
      })
    }
    const sites = findingSites(finding)
    const result: Record<string, unknown> = {
      ruleId: finding.id,
      level: sarifLevel(finding.severity),
      message: { text: finding.message },
    }
    if (sites.length > 0) {
      const [primary, ...related] = sites
      result.locations = [physicalLocation(primary!.file, primary!.line)]
      if (related.length > 0) {
        result.relatedLocations = related.map((site, i) => ({
          id: i + 1,
          ...physicalLocation(site.file, site.line),
        }))
      }
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
              rules: [...rulesById.values()],
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
