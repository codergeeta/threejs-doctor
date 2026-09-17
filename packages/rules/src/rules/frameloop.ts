import type { Rule } from '../types.js'
import { resolveProfile } from '../profiles.js'

export const frameloopRule: Rule = {
  id: 'frameloop',
  run(ctx) {
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    if (!ctx.snapshot.continuousFrameloop) return []
    if (profile !== 'marketing' && profile !== 'product') return []
    return [
      {
        id: 'frameloop/continuous-static',
        severity: 'warn',
        evidence: { continuousFrameloop: true, profile },
        message: 'Continuous frameloop on a mostly static scene profile',
        suggestedFix: 'Switch to demand/invalidation rendering',
        autoFix: 'frameloop-demand',
      },
    ]
  },
}
