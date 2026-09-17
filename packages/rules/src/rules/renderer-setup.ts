import type { Rule } from '../types.js'
import { resolveProfile } from '../profiles.js'

export const rendererSetupRule: Rule = {
  id: 'renderer-setup',
  run(ctx) {
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    if (!ctx.snapshot.antialias) return []
    if (ctx.device.tier !== 'low') return []
    if (profile !== 'marketing' && profile !== 'product') return []
    return [
      {
        id: 'renderer/antialias-postfx-risk',
        severity: 'warn',
        evidence: { antialias: true, tier: ctx.device.tier, profile },
        message: 'Antialias on low-tier marketing/product scenes risks costly post stacks',
        suggestedFix: 'Disable MSAA on low tier or reduce postfx via postfx-budget',
        autoFix: 'postfx-budget',
      },
    ]
  },
}
