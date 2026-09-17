import type { Rule } from '../types.js'

export const materialsRule: Rule = {
  id: 'materials',
  run(ctx) {
    const { materialCount, meshCount } = ctx.snapshot
    if (!(materialCount > 20 && materialCount > meshCount * 0.8)) return []
    return [
      {
        id: 'materials/too-unique',
        severity: 'warn',
        evidence: { materialCount, meshCount },
        message: `High unique material count ${materialCount} relative to meshes ${meshCount}`,
        suggestedFix: 'Share materials across meshes or atlas textures',
      },
    ]
  },
}
