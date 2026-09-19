import type { ConcreteProfile, Finding } from '@threejs-doctor/rules'
import type { DeviceCapabilities, MetricsSample, Profile } from '@threejs-doctor/core'
import { computeDoctorScore, runRules } from '@threejs-doctor/rules'
import type { DoctorReport } from '@threejs-doctor/runtime'
import type { CliArgs } from '../cli.js'
import { collectSources } from '../scan/collect-sources.js'
import { deviceFromBudget } from '../scan/device-from-budget.js'
import {
  extractStaticFacts,
  factsToSnapshot,
  type SourceLocation,
  type StaticFacts,
  type StaticLocations,
} from '../scan/extract-snapshot.js'
import { relative, resolve, sep } from 'node:path'

const STATIC_DROP_IDS = new Set(['materials/too-unique'])

const FINDING_LOCATION_KEY: Partial<Record<string, keyof StaticLocations>> = {
  'lights/too-many': 'lights',
  'shadows/too-many-casters': 'shadowCasters',
  'lights/zero-intensity': 'zeroIntensity',
  'culling/frustum-disabled': 'frustumDisabled',
  'renderer/uncapped-dpr': 'uncappedDpr',
  'frameloop/continuous-static': 'continuousFrameloop',
  'renderer/antialias-postfx-risk': 'antialiasTrue',
  'renderer/composer-pixel-ratio-drift': 'effectComposer',
}

/** Classify without treating omitted drawCalls/triangles as a small product scene. */
export function resolveStaticProfile(profile: Profile, facts: StaticFacts): ConcreteProfile {
  if (profile !== 'auto') return profile
  // Constructor-site meshCount is not instance count. A continuous loop is a game.
  if (facts.continuousFrameloop) return 'game'
  if (facts.lightCount >= 4 && facts.meshCount > 50) return 'game'
  if (!facts.continuousFrameloop && facts.lightCount < 4 && facts.meshCount > 200) return 'cad'
  return 'marketing'
}

function displayPath(file: string, scanRoot: string): string {
  const root = resolve(scanRoot)
  const abs = resolve(file)
  if (abs === root) return abs.split(sep).pop() ?? abs
  if (abs.startsWith(root + sep)) return relative(root, abs)
  return file
}

function attachLocation(finding: Finding, loc: SourceLocation | undefined, scanRoot: string): Finding {
  if (!loc) return finding
  return {
    ...finding,
    evidence: {
      ...finding.evidence,
      file: displayPath(loc.file, scanRoot),
      line: loc.line,
    },
  }
}

function firstLoc(facts: StaticFacts, key: keyof StaticLocations | undefined): SourceLocation | undefined {
  if (!key) return undefined
  return facts.locations[key][0]
}

function annotateFindings(findings: Finding[], facts: StaticFacts, scanRoot: string, profileWasAuto: boolean): Finding[] {
  const out: Finding[] = []
  for (const finding of findings) {
    if (STATIC_DROP_IDS.has(finding.id)) continue
    if (profileWasAuto && finding.id === 'frameloop/continuous-static') continue
    const key = FINDING_LOCATION_KEY[finding.id]
    const loc =
      firstLoc(facts, key) ??
      (finding.id === 'renderer/uncapped-dpr' ? firstLoc(facts, 'setPixelRatio') : undefined)
    out.push(attachLocation(finding, loc, scanRoot))
  }
  return out
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

function composerDriftFinding(): Finding {
  return {
    id: 'renderer/composer-pixel-ratio-drift',
    severity: 'warn',
    evidence: { sourcePattern: 'EffectComposer+setPixelRatio' },
    message:
      'EffectComposer is constructed and the renderer calls setPixelRatio, but composer.setPixelRatio / composer.setSize is missing',
    suggestedFix: 'Call composer.setPixelRatio or composer.setSize whenever the renderer DPR or size changes',
  }
}

function fxFrustumFinding(count: number): Finding {
  return {
    id: 'culling/frustum-disabled',
    severity: 'info',
    evidence: { frustumCulledDisabledFxCount: count },
    message: `${count} Points/Line/Sprite object(s) have frustumCulled === false (particle/line FX; not a mesh culling error)`,
    suggestedFix: 'Leave FX uncullable if intentional; enable frustumCulled on world meshes',
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

function staticReport(partial: Omit<DoctorReport, 'staticScan'>): DoctorReport {
  return { ...partial, staticScan: true }
}

/** Static JS/TS/HTML scan. Runtime metrics are omitted; live attach is still the full Doctor. */
export async function runScan(args: CliArgs): Promise<DoctorReport> {
  const sources = await collectSources(args.path)
  const facts = extractStaticFacts(sources)
  const device = deviceFromBudget(args.budget)
  const snapshot = factsToSnapshot(facts)
  const profileWasAuto = args.profile === 'auto'
  const profile = resolveStaticProfile(args.profile, facts)
  const baseline = staticBaseline(facts)
  const scanRoot = args.path

  if (!facts.sawThree) {
    const findings = [noThreeFinding(sources.length)]
    return staticReport({
      profile,
      mode: 'diagnose',
      score: computeDoctorScore(findings, snapshot, profile),
      findings,
      baseline,
      appliedPasses: [],
      failedPasses: [],
      incomplete: true,
    })
  }

  let findings = runRules({ snapshot, device, profile })
  if (facts.uncappedDevicePixelRatio && !findings.some((f) => f.id === 'renderer/uncapped-dpr')) {
    findings.push(uncappedDprFinding(device))
  }
  if (facts.composerCtorCount > 0 && facts.hasNonComposerSetPixelRatio && !facts.composerPixelRatioSynced) {
    findings.push(composerDriftFinding())
  }
  if (facts.frustumCulledDisabledFxCount > 0) {
    findings.push(fxFrustumFinding(facts.frustumCulledDisabledFxCount))
  }
  findings = annotateFindings(findings, facts, scanRoot, profileWasAuto)
  if (facts.frustumCulledDisabledFxCount > 0) {
    const fx = findings.find((f) => f.id === 'culling/frustum-disabled' && f.severity === 'info')
    if (fx && !fx.evidence.file) {
      const loc = facts.locations.frustumDisabledFx[0]
      const idx = findings.indexOf(fx)
      if (idx >= 0) findings[idx] = attachLocation(fx, loc, scanRoot)
    }
  }

  return staticReport({
    profile,
    mode: 'diagnose',
    score: computeDoctorScore(findings, snapshot, profile),
    findings,
    baseline,
    appliedPasses: [],
    failedPasses: [],
    incomplete: false,
  })
}
