import { GENERIC_CAPS } from '@threejs-doctor/core'
import type { OptimizePass } from './types.js'

export const toneMapLitePass: OptimizePass = {
  id: 'tone-map-lite',
  apply(ctx) {
    if (ctx.renderer.toneMapping === undefined) return { rollback() {} }
    const target =
      ctx.qualityTier !== undefined
        ? GENERIC_CAPS[ctx.qualityTier].toneMapping
        : GENERIC_CAPS.low.toneMapping
    if (target === undefined) return { rollback() {} }
    const prev = ctx.renderer.toneMapping
    try {
      ctx.renderer.toneMapping = target
    } catch (err) {
      ctx.renderer.toneMapping = prev
      throw err
    }
    return {
      rollback() {
        ctx.renderer.toneMapping = prev
      },
    }
  },
}
