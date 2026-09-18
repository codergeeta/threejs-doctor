import type { Rule } from '../types.js'
import { PROFILE_BUDGETS, resolveProfile } from '../profiles.js'

export const trianglesRule: Rule = {
  id: 'triangles',
  run(ctx) {
    const count = ctx.snapshot.geometryTriangleCount
    if (typeof count !== 'number' || !Number.isFinite(count)) return []
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    const budget = PROFILE_BUDGETS[profile].maxTriangles
    if (count <= budget) return []
    const share = ctx.snapshot.topContributorShare
    const summary = ctx.snapshot.triangleContributorSummary
    const percent =
      typeof share === 'number' && Number.isFinite(share) ? Math.round(share * 100) : undefined
    const evidence: Record<string, number | string | boolean> = {
      geometryTriangleCount: count,
      budget,
      profile,
    }
    if (typeof summary === 'string') evidence.topContributor = summary
    if (typeof share === 'number') evidence.topContributorShare = share
    const shareNote = percent !== undefined && summary ? ` (${summary} is ${percent}%)` : ''
    return [
      {
        id: 'triangles/too-many',
        severity: count > budget * 1.5 ? 'error' : 'warn',
        evidence,
        message: `Scene triangles ${count} exceed ${profile} budget ${budget}${shareNote}`,
        suggestedFix: 'Chunk or simplify the heaviest InstancedMesh/Mesh (instance count × index count / 3)',
      },
    ]
  },
}
