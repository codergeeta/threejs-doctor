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
    const dpr = ctx.snapshot.rendererPixelRatio
    if (typeof dpr !== 'number' || !Number.isFinite(dpr)) return []
    if (dpr <= maxDpr) return []
    return [
      {
        id: 'renderer/uncapped-dpr',
        severity: ctx.device.tier === 'low' ? 'error' : 'warn',
        evidence: {
          rendererPixelRatio: dpr,
          maxDpr,
          tier: ctx.device.tier,
        },
        message: `Renderer pixel ratio ${dpr} exceeds cap ${maxDpr}`,
        suggestedFix: 'Cap setPixelRatio for the active device tier',
        autoFix: 'dpr-cap',
      },
    ]
  },
}
