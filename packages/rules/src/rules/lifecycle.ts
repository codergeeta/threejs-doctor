import type { Rule } from '../types.js'

export const lifecycleRule: Rule = {
  id: 'lifecycle',
  run(ctx) {
    if (!ctx.previousSnapshot) return []
    const geoGrowth = ctx.snapshot.geometryCount - ctx.previousSnapshot.geometryCount
    const texGrowth = ctx.snapshot.textureCount - ctx.previousSnapshot.textureCount
    if (geoGrowth <= 0 && texGrowth <= 0) return []
    return [
      {
        id: 'lifecycle/resource-growth',
        severity: 'warn',
        evidence: { geoGrowth, texGrowth },
        message: 'Geometry/texture counts climbed between measures (possible leak)',
        suggestedFix: 'Ensure dispose() on removed geometries, materials, and textures',
      },
    ]
  },
}
