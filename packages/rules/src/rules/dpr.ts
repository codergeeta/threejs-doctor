import type { Rule } from '../types.js'
import { PROFILE_BUDGETS, resolveProfile } from '../profiles.js'

export const dprRule: Rule = {
  id: 'dpr',
  run(ctx) {
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    const maxDpr = Math.min(
      PROFILE_BUDGETS[profile].maxDpr,
      ctx.device.tier === 'low' ? 1.5 : PROFILE_BUDGETS[profile].maxDpr,
    )
    if (ctx.snapshot.rendererPixelRatio <= maxDpr) return []
    return [
      {
        id: 'renderer/uncapped-dpr',
        severity: ctx.device.tier === 'low' ? 'error' : 'warn',
        evidence: {
          rendererPixelRatio: ctx.snapshot.rendererPixelRatio,
          maxDpr,
          tier: ctx.device.tier,
        },
        message: `Renderer pixel ratio ${ctx.snapshot.rendererPixelRatio} exceeds cap ${maxDpr}`,
        suggestedFix: 'Cap setPixelRatio for the active device tier',
        autoFix: 'dpr-cap',
      },
    ]
  },
}
