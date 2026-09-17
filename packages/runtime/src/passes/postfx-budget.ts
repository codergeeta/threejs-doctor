import type { OptimizePass } from './types.js'

export const postfxBudgetPass: OptimizePass = {
  id: 'postfx-budget',
  apply(ctx) {
    const prev = ctx.postfxEnabled
    const restore = () => {
      ctx.postfxEnabled = prev
      try {
        ctx.setPostfxEnabled?.(prev)
      } catch {
        // Best-effort restore when the host setter also throws.
      }
    }
    if (ctx.device.tier === 'low' && ctx.postfxEnabled) {
      try {
        ctx.setPostfxEnabled?.(false)
        ctx.postfxEnabled = false
      } catch (err) {
        restore()
        throw err
      }
    }
    return {
      rollback() {
        restore()
      },
    }
  },
}
