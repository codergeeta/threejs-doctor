import type { Rule } from '../types.js'

export const lifecycleRule: Rule = {
  id: 'lifecycle',
  run(ctx) {
    if (!ctx.previousSnapshot) return []
    const findings = []
    const geoGrowth = ctx.snapshot.geometryCount - ctx.previousSnapshot.geometryCount
    const texGrowth = ctx.snapshot.textureCount - ctx.previousSnapshot.textureCount
    if (geoGrowth > 0 || texGrowth > 0) {
      findings.push({
        id: 'lifecycle/resource-growth',
        severity: 'warn' as const,
        evidence: { geoGrowth, texGrowth },
        message: 'Geometry/texture counts climbed between measures (possible leak)',
        suggestedFix: 'Ensure dispose() on removed geometries, materials, and textures',
      })
    }
    const prevBytes = ctx.previousSnapshot.instancedBufferBytes
    const bytes = ctx.snapshot.instancedBufferBytes
    if (typeof prevBytes === 'number' && typeof bytes === 'number' && bytes > prevBytes) {
      findings.push({
        id: 'lifecycle/instance-buffer-growth',
        severity: 'warn' as const,
        evidence: { prevBytes, bytes },
        message: 'InstancedMesh instance buffers grew between measures (possible leak)',
        suggestedFix: 'Call InstancedMesh.dispose() (instanceMatrix / instanceColor) when replacing or restarting instances',
      })
    }
    return findings
  },
}
