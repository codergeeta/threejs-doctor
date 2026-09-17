import type { OptimizePass } from './types.js'

export const frameloopDemandPass: OptimizePass = {
  id: 'frameloop-demand',
  apply(ctx) {
    const prev = ctx.frameloop
    const restore = () => {
      try {
        ctx.setFrameloop(prev)
      } catch {
        // Best-effort restore when the host setter also throws.
      }
    }
    if (ctx.profile === 'marketing' || ctx.profile === 'product') {
      try {
        ctx.setFrameloop('demand')
      } catch (err) {
        restore()
        throw err
      }
    }
    return {
      rollback() {
        ctx.setFrameloop(prev)
      },
    }
  },
}
