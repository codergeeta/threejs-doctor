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
    const shadowTris = ctx.snapshot.shadowTriangleCount
    if (typeof shadowTris === 'number' && shadowTris > budgets.maxShadowTriangles) {
      findings.push({
        id: 'shadows/expensive-pass',
        severity: shadowTris > budgets.maxShadowTriangles * 1.5 ? ('error' as const) : ('warn' as const),
        evidence: { shadowTriangleCount: shadowTris, budget: budgets.maxShadowTriangles },
        message: `Shadow-pass triangles ${shadowTris} exceed budget ${budgets.maxShadowTriangles}`,
        suggestedFix: 'Disable castShadow on heavy InstancedMeshes or tighten the shadow camera',
      })
    }
    const outside = ctx.snapshot.shadowCastersOutsideFrustum
    if (typeof outside === 'number' && outside > 0) {
      findings.push({
        id: 'shadows/casters-outside-frustum',
        severity: 'info' as const,
        evidence: { shadowCastersOutsideFrustum: outside },
        message: `${outside} shadow caster(s) sit outside every detectable shadow camera`,
        suggestedFix: 'Disable castShadow on objects that never intersect the shadow camera',
      })
    }
    const zero = ctx.snapshot.zeroIntensityLightCount
    if (typeof zero === 'number' && zero > 0) {
      findings.push({
        id: 'lights/zero-intensity',
        severity: 'warn' as const,
        evidence: { zeroIntensityLightCount: zero },
        message: `${zero} visible light(s) have intensity 0 but still participate in lighting`,
        suggestedFix: 'Remove or disable lights instead of leaving intensity at 0',
      })
    }
    return findings
  },
}
