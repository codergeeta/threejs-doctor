import type { ConcreteProfile, Finding } from '@threejs-doctor/rules'
import type { DeviceCapabilities, MetricsSample, Profile } from '@threejs-doctor/core'
import { computeDoctorScore, runRules } from '@threejs-doctor/rules'
import type { DoctorReport } from '@threejs-doctor/runtime'
import type { CliArgs } from '../cli.js'
import { collectSources, gitTopLevel } from '../scan/collect-sources.js'
import { deviceFromBudget } from '../scan/device-from-budget.js'
import {
  extractStaticFacts,
  factsToSnapshot,
  type SourceLocation,
  type StaticFacts,
  type StaticLocations,
} from '../scan/extract-snapshot.js'
import { relative, resolve, sep, dirname } from 'node:path'

const STATIC_DROP_IDS = new Set(['materials/too-unique'])

const FINDING_LOCATION_KEY: Partial<Record<string, keyof StaticLocations>> = {
  'lights/too-many': 'lights',
  'shadows/too-many-casters': 'shadowCasters',
  'lights/zero-intensity': 'zeroIntensity',
  'culling/frustum-disabled': 'frustumDisabled',
  'culling/frustum-disabled-fx': 'frustumDisabledFx',
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

function displayPath(file: string, scanRoot: string, gitRoot?: string): string {
  const abs = resolve(file)
  const base = gitRoot ? resolve(gitRoot) : resolve(scanRoot)
  if (abs === base) return (abs.split(sep).pop() ?? abs).replace(/\\/g, '/')
  if (abs.startsWith(base + sep)) return relative(base, abs).replace(/\\/g, '/')
  const root = resolve(scanRoot)
  if (abs.startsWith(root + sep)) return relative(root, abs).replace(/\\/g, '/')
  return file.replace(/\\/g, '/')
}

function attachLocations(
  finding: Finding,
  locs: SourceLocation[],
  scanRoot: string,
  gitRoot: string | undefined,
): Finding {
  if (locs.length === 0) return finding
  const displayed = locs.map((loc) => ({
    file: displayPath(loc.file, scanRoot, gitRoot),
    line: loc.line,
  }))
  const primary = displayed[0]!
  return {
    ...finding,
    evidence: {
      ...finding.evidence,
      file: primary.file,
      line: primary.line,
    },
    locations: displayed,
  }
}

function locsFor(facts: StaticFacts, key: keyof StaticLocations | undefined): SourceLocation[] {
  if (!key) return []
  return facts.locations[key]
}

function annotateFindings(
  findings: Finding[],
  facts: StaticFacts,
  scanRoot: string,
  profileWasAuto: boolean,
  gitRoot: string | undefined,
): Finding[] {
  const out: Finding[] = []
  for (const finding of findings) {
    if (STATIC_DROP_IDS.has(finding.id)) continue
    if (profileWasAuto && finding.id === 'frameloop/continuous-static') continue
    const key = FINDING_LOCATION_KEY[finding.id]
    let locs = locsFor(facts, key)
    if (locs.length === 0 && finding.id === 'renderer/uncapped-dpr') {
      locs = locsFor(facts, 'setPixelRatio')
    }
    out.push(attachLocations(finding, locs, scanRoot, gitRoot))
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
      'EffectComposer is constructed and the renderer calls setPixelRatio, but composer.setPixelRatio is missing (three.js setSize does not pick up renderer DPR)',
    suggestedFix:
      'For three.js EffectComposer, call composer.setPixelRatio when the renderer DPR changes; setSize alone reuses the construction pixel ratio. pmndrs postprocessing may use setSize only.',
  }
}

function fxFrustumFinding(count: number): Finding {
  return {
    id: 'culling/frustum-disabled-fx',
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
  const absScan = resolve(scanRoot)
  const gitRoot = gitTopLevel(absScan) ?? gitTopLevel(dirname(absScan))

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
  findings = annotateFindings(findings, facts, scanRoot, profileWasAuto, gitRoot)

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
