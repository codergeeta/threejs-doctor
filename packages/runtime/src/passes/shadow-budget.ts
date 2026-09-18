import type { DoctorObjectLike, OptimizePass } from './types.js'

export const shadowBudgetPass: OptimizePass = {
  id: 'shadow-budget',
  apply(ctx) {
    const maxCasters =
      ctx.qualityTier === 'potato'
        ? 0
        : ctx.qualityTier === 'low'
          ? 1
          : ctx.qualityTier === 'mid'
            ? 2
            : ctx.profile === 'marketing'
              ? 1
              : 2
    const touched: Array<{ obj: DoctorObjectLike; prev: boolean }> = []
    const shadowMap = ctx.qualityTier === 'potato' ? ctx.renderer.shadowMap : undefined
    const prevShadowMapEnabled = shadowMap?.enabled
    let kept = 0
    const rollbackTouched = () => {
      for (const t of touched) t.obj.castShadow = t.prev
      if (shadowMap !== undefined && prevShadowMapEnabled !== undefined) {
        shadowMap.enabled = prevShadowMapEnabled
      }
    }
    try {
      ctx.scene.traverse((obj) => {
        if (!obj.castShadow) return
        if (obj.isMesh && !obj.isLight) return
        if (kept < maxCasters) {
          kept += 1
          return
        }
        touched.push({ obj, prev: true })
        obj.castShadow = false
      })
      if (shadowMap !== undefined) {
        shadowMap.enabled = false
      }
    } catch (err) {
      rollbackTouched()
      throw err
    }
    return {
      rollback() {
        rollbackTouched()
      },
    }
  },
}
