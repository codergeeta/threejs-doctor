import type { Rule } from '../types.js'
import { resolveProfile } from '../profiles.js'

export const transformsRule: Rule = {
  id: 'transforms',
  run(ctx) {
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    if (profile === 'game') return []
    if (ctx.snapshot.matrixAutoUpdateCount <= 10) return []
    return [
      {
        id: 'transforms/matrix-autoupdate',
        severity: 'info',
        evidence: { matrixAutoUpdateCount: ctx.snapshot.matrixAutoUpdateCount, profile },
        message: `${ctx.snapshot.matrixAutoUpdateCount} objects still use matrixAutoUpdate on a mostly static profile`,
        suggestedFix: 'Set matrixAutoUpdate=false and updateMatrix() once for static meshes',
      },
    ]
  },
}
