import type { Rule } from '../types.js'
import { PROFILE_BUDGETS, resolveProfile } from '../profiles.js'

export const drawCallsRule: Rule = {
  id: 'draw-calls',
  run(ctx) {
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    const budget = PROFILE_BUDGETS[profile].maxDrawCalls
    if (ctx.snapshot.drawCalls <= budget) return []
    const severity = ctx.snapshot.drawCalls > budget * 1.5 ? 'error' : 'warn'
    return [
      {
        id: 'draw-calls/too-many',
        severity,
        evidence: { drawCalls: ctx.snapshot.drawCalls, budget, profile },
        message: `Draw calls ${ctx.snapshot.drawCalls} exceed ${profile} budget ${budget}`,
        suggestedFix: 'Use InstancedMesh, BatchedMesh, or merge static geometries',
      },
    ]
  },
}
