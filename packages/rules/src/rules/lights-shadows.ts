import type { Rule } from '../types.js'
import { PROFILE_BUDGETS, resolveProfile } from '../profiles.js'

export const lightsShadowsRule: Rule = {
  id: 'lights-shadows',
  run(ctx) {
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    const budgets = PROFILE_BUDGETS[profile]
    const findings = []
    if (ctx.snapshot.lightCount > budgets.maxLights) {
      findings.push({
        id: 'lights/too-many',
        severity: 'warn' as const,
        evidence: { lightCount: ctx.snapshot.lightCount, budget: budgets.maxLights },
        message: `Active lights ${ctx.snapshot.lightCount} exceed budget ${budgets.maxLights}`,
        suggestedFix: 'Bake lighting or reduce dynamic lights',
      })
    }
    if (ctx.snapshot.shadowCastingLightCount > budgets.maxShadowCasters) {
      findings.push({
        id: 'shadows/too-many-casters',
        severity: 'error' as const,
        evidence: {
          shadowCastingLightCount: ctx.snapshot.shadowCastingLightCount,
          budget: budgets.maxShadowCasters,
        },
        message: `Shadow-casting lights ${ctx.snapshot.shadowCastingLightCount} exceed budget ${budgets.maxShadowCasters}`,
        suggestedFix: 'Disable extra shadows or freeze shadow autoUpdate',
        autoFix: 'shadow-budget' as const,
      })
    }
    return findings
  },
}
