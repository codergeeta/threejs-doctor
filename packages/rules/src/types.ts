import type {
  DeviceCapabilities,
  PassId,
  Profile,
  SceneSnapshot,
  Severity,
} from '@threejs-doctor/core'

export interface Finding {
  id: string
  severity: Severity
  evidence: Record<string, number | string | boolean>
  message: string
  suggestedFix: string
  autoFix?: PassId
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
