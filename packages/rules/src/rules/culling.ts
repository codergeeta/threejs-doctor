import type { Rule } from '../types.js'

export const cullingRule: Rule = {
  id: 'culling',
  run(ctx) {
    const findings = []
    const disabled = ctx.snapshot.frustumCulledDisabledCount
    if (typeof disabled === 'number' && disabled > 0) {
      findings.push({
        id: 'culling/frustum-disabled',
        severity: 'warn' as const,
        evidence: { frustumCulledDisabledCount: disabled },
        message: `${disabled} mesh(es) have frustumCulled === false and always draw`,
        suggestedFix: 'Enable frustumCulled when safe, or chunk large world meshes so they can cull',
      })
    }
    const oversized = ctx.snapshot.oversizedBoundCount
    if (typeof oversized === 'number' && oversized > 0) {
      findings.push({
        id: 'culling/oversized-bounds',
        severity: 'warn' as const,
        evidence: { oversizedBoundCount: oversized },
        message: `${oversized} mesh(es) have world bounds larger than the camera far plane (never frustum-rejected)`,
        suggestedFix: 'Split oversized geometry into chunks with tighter bounds; keep frustumCulled enabled',
      })
    }
    return findings
  },
}
