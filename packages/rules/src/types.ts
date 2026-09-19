import type {
  DeviceCapabilities,
  PassId,
  Profile,
  SceneSnapshot,
  Severity,
} from '@threejs-doctor/core'

export interface FindingLocation {
  file: string
  line: number
}

export interface Finding {
  id: string
  severity: Severity
  evidence: Record<string, number | string | boolean>
  message: string
  suggestedFix: string
  autoFix?: PassId
  /** Every source site for this finding (scan). Primary is also evidence.file/line. */
  locations?: FindingLocation[]
}

export interface RuleContext {
  snapshot: SceneSnapshot
  device: DeviceCapabilities
  profile: Profile
  previousSnapshot?: SceneSnapshot
}

export interface Rule {
  id: string
  run(ctx: RuleContext): Finding[]
}
