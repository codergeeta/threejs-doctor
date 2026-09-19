import type { MetricsSample } from '@threejs-doctor/core'
import { computeDoctorScore, resolveProfile, runRules } from '@threejs-doctor/rules'
import type { Finding } from '@threejs-doctor/rules'
import type { DoctorReport } from '@threejs-doctor/runtime'
import type { CliArgs } from '../cli.js'
import { collectSources } from '../scan/collect-sources.js'
import { deviceFromBudget } from '../scan/device-from-budget.js'
import { extractStaticFacts, factsToSnapshot } from '../scan/extract-snapshot.js'

function staticBaseline(facts: {
  lightCount: number
  shadowCastingLightCount: number
  textureCount: number
  geometryCount: number
  meshCount: number
  materialCount: number
}): MetricsSample {
  return {
    lightCount: facts.lightCount,
    shadowCastingLightCount: facts.shadowCastingLightCount,
    textureCount: facts.textureCount,
    geometryCount: facts.geometryCount,
    meshCount: facts.meshCount,
    materialCount: facts.materialCount,
  } as unknown as MetricsSample
}

function noThreeFinding(fileCount: number): Finding {
  return {
    id: 'scan/no-threejs-detected',
    severity: 'warn',
    evidence: { files: fileCount },
    message: 'No Three.js imports or constructors found in scanned JS/TS/HTML',
    suggestedFix:
      'Point scan at a project or entry that imports three, or attach the runtime Doctor to a live scene',
  }
}

/** Static JS/TS/HTML scan. Runtime metrics are omitted; live attach is still the full Doctor. */
export async function runScan(args: CliArgs): Promise<DoctorReport> {
  const sources = await collectSources(args.path)
  const facts = extractStaticFacts(sources)
  const device = deviceFromBudget(args.budget)
  const snapshot = factsToSnapshot(facts, { assumedDevicePixelRatio: device.devicePixelRatio })
  const profile = resolveProfile(args.profile, snapshot)
  const baseline = staticBaseline(facts)

  if (!facts.sawThree) {
    const findings = [noThreeFinding(sources.length)]
    return {
      profile,
      mode: 'diagnose',
      score: computeDoctorScore(findings, snapshot, profile),
      findings,
      baseline,
      appliedPasses: [],
      failedPasses: [],
      incomplete: true,
    }
  }

  const findings = runRules({ snapshot, device, profile })
  return {
    profile,
    mode: 'diagnose',
    score: computeDoctorScore(findings, snapshot, profile),
    findings,
    baseline,
    appliedPasses: [],
    failedPasses: [],
    incomplete: false,
  }
}
