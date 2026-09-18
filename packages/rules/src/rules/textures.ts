import type { Rule } from '../types.js'
import { PROFILE_BUDGETS, resolveProfile } from '../profiles.js'

export const texturesRule: Rule = {
  id: 'textures',
  run(ctx) {
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    const findings = []
    const vramBudget = PROFILE_BUDGETS[profile].maxEstimatedVramBytes
    if (
      typeof ctx.snapshot.estimatedVramBytes === 'number' &&
      ctx.snapshot.estimatedVramBytes > vramBudget
    ) {
      findings.push({
        id: 'textures/high-vram',
        severity: 'error' as const,
        evidence: { estimatedVramBytes: ctx.snapshot.estimatedVramBytes, budget: vramBudget },
        message: `Estimated VRAM ${ctx.snapshot.estimatedVramBytes} exceeds budget ${vramBudget}`,
        suggestedFix: 'Downscale textures, use compression, or reduce texture count',
      })
    }
    if (ctx.device.tier === 'low' && ctx.snapshot.maxTextureDimension > 2048) {
      findings.push({
        id: 'textures/oversized',
        severity: 'warn' as const,
        evidence: { maxTextureDimension: ctx.snapshot.maxTextureDimension },
        message: `Max texture dimension ${ctx.snapshot.maxTextureDimension} is oversized for low-tier devices`,
        suggestedFix: 'Cap texture sizes at 1024–2048 on mobile',
      })
    }
    return findings
  },
}
