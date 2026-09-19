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

/** Per-site rules emit one SARIF result per location (GitHub annotates only the primary). */
export const PER_SITE_SARIF_RULES = new Set([
  'culling/frustum-disabled',
  'culling/frustum-disabled-fx',
  'culling/oversized-bounds',
  'lights/zero-intensity',
  'shadows/too-many-casters',
  'shadows/casters-outside-frustum',
  'renderer/composer-pixel-ratio-drift',
  'renderer/uncapped-dpr',
  'renderer/antialias-postfx-risk',
  'frameloop/continuous-static',
])

const RULE_META: Record<string, { short: string; help: string }> = {
  'culling/frustum-disabled': {
    short: 'Mesh has frustumCulled disabled',
    help: 'Enable frustumCulled when safe, or chunk large world meshes so they can cull',
  },
  'culling/frustum-disabled-fx': {
    short: 'Points/Line/Sprite has frustumCulled disabled (FX)',
    help: 'Leave FX uncullable if intentional; enable frustumCulled on world meshes',
  },
  'culling/oversized-bounds': {
    short: 'Mesh world bounds exceed the camera far plane',
    help: 'Split oversized geometry into chunks with tighter bounds; keep frustumCulled enabled',
  },
  'lights/zero-intensity': {
    short: 'Visible light has intensity 0',
    help: 'Keep visible light count fixed and move/reassign a small pool, or hide unused lights',
  },
  'lights/too-many': {
    short: 'Active light count exceeds the profile budget',
    help: 'Bake lighting or reduce dynamic lights',
  },
  'shadows/too-many-casters': {
    short: 'Shadow-casting light exceeds the profile budget',
    help: 'Disable extra shadows or freeze shadow autoUpdate',
  },
  'shadows/casters-outside-frustum': {
    short: 'Shadow caster sits outside every detectable shadow camera',
    help: 'Disable castShadow on objects that never intersect the shadow camera',
  },
  'shadows/expensive-pass': {
    short: 'Shadow-pass triangle count exceeds the profile budget',
    help: 'Disable castShadow on heavy InstancedMeshes or tighten the shadow camera',
  },
  'renderer/composer-pixel-ratio-drift': {
    short: 'EffectComposer pixel ratio is not synced to the renderer',
    help: 'For three.js EffectComposer, call composer.setPixelRatio when the renderer DPR changes',
  },
  'renderer/uncapped-dpr': {
    short: 'Renderer pixel ratio is uncapped for the device tier',
    help: 'Cap setPixelRatio for the active device tier',
  },
  'renderer/antialias-postfx-risk': {
    short: 'Renderer antialias is enabled with a post-processing composer',
    help: 'Disable renderer antialias when using EffectComposer; MSAA the composer instead',
  },
  'frameloop/continuous-static': {
    short: 'Continuous animation loop on a static/marketing scene',
    help: 'Use frameloop demand for static scenes; keep the host loop for games',
  },
  'draw-calls/too-many': {
    short: 'Draw calls exceed the profile budget',
    help: 'Instance or merge meshes to reduce draw calls',
  },
  'triangles/too-many': {
    short: 'Drawn triangles exceed the profile budget',
    help: 'Chunk, LOD, or instance heavy geometry',
  },
  'scan/no-threejs-detected': {
    short: 'No Three.js imports or constructors found',
    help: 'Point scan at a project that imports three, or attach the runtime Doctor',
  },
}

function ruleMeta(finding: Finding): { short: string; help: string } {
  const known = RULE_META[finding.id]
  if (known) return known
  return { short: finding.id, help: finding.suggestedFix }
}

function siteLabel(site: { file: string; line?: number }): string {
  return site.line === undefined ? site.file : `${site.file}:${site.line}`
}

/** GitHub-compatible SARIF 2.1.0 for `scan --format sarif`. */
export function formatSarifReport(report: DoctorReport): string {
  const rulesById = new Map<string, Record<string, unknown>>()
  const results: Array<Record<string, unknown>> = []

  for (const finding of report.findings) {
    if (!rulesById.has(finding.id)) {
      const meta = ruleMeta(finding)
      rulesById.set(finding.id, {
        id: finding.id,
        shortDescription: { text: meta.short },
        help: { text: finding.suggestedFix || meta.help },
        defaultConfiguration: { level: sarifLevel(finding.severity) },
      })
    }
    const sites = findingSites(finding)
    const perSite = PER_SITE_SARIF_RULES.has(finding.id) && sites.length > 0
    if (perSite) {
      for (const site of sites) {
        results.push({
          ruleId: finding.id,
          level: sarifLevel(finding.severity),
          message: { text: `${finding.message} [${siteLabel(site)}]` },
          locations: [physicalLocation(site.file, site.line)],
        })
      }
      continue
    }
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
    results.push(result)
  }

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
