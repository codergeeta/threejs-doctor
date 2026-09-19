import type { ConcreteProfile, Finding } from '@threejs-doctor/rules'
import type { DeviceCapabilities, MetricsSample, Profile } from '@threejs-doctor/core'
import { computeDoctorScore, runRules } from '@threejs-doctor/rules'
import type { DoctorReport } from '@threejs-doctor/runtime'
import type { CliArgs } from '../cli.js'
import { collectSources } from '../scan/collect-sources.js'
import { deviceFromBudget } from '../scan/device-from-budget.js'
import { extractStaticFacts, factsToSnapshot, type StaticFacts } from '../scan/extract-snapshot.js'

/** Classify without treating omitted drawCalls/triangles as a small product scene. */
export function resolveStaticProfile(profile: Profile, facts: StaticFacts): ConcreteProfile {
  if (profile !== 'auto') return profile
  if (facts.continuousFrameloop && facts.meshCount >= 50) return 'game'
  if (facts.lightCount >= 4 && facts.meshCount > 50) return 'game'
  if (!facts.continuousFrameloop && facts.lightCount < 4 && facts.meshCount > 200) return 'cad'
  return 'marketing'
}

function uncappedDprFinding(device: DeviceCapabilities): Finding {
  return {
    id: 'renderer/uncapped-dpr',
    severity: device.tier === 'low' ? 'error' : 'warn',
    evidence: { sourcePattern: 'devicePixelRatio', capped: false, tier: device.tier },
    message: 'setPixelRatio uses devicePixelRatio without a numeric cap',
    suggestedFix: 'Cap setPixelRatio for the active device tier',
    autoFix: 'dpr-cap',
  }
}

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
  const snapshot = factsToSnapshot(facts)
  const profile = resolveStaticProfile(args.profile, facts)
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
  if (facts.uncappedDevicePixelRatio && !findings.some((f) => f.id === 'renderer/uncapped-dpr')) {
    findings.push(uncappedDprFinding(device))
  }
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
