import type { OptimizePass } from './types.js'

function restorePixelRatio(
  setPixelRatio: (value: number) => void,
  prev: number,
): void {
  try {
    setPixelRatio(prev)
  } catch {
    // Preserve the original apply error; rollback is best-effort.
  }
}

export const dprCapPass: OptimizePass = {
  id: 'dpr-cap',
  apply(ctx) {
    const prev = ctx.renderer.pixelRatio
    const cap = ctx.qualityTier
      ? ctx.qualityTier === 'potato'
        ? 1.0
        : ctx.qualityTier === 'low'
          ? 1.25
          : ctx.qualityTier === 'mid'
            ? 1.5
            : 2
      : ctx.device.tier === 'low'
        ? 1.5
        : ctx.device.tier === 'mid'
          ? 2
          : Math.min(prev, 2)
    try {
      ctx.renderer.setPixelRatio(Math.min(prev, cap))
    } catch (err) {
      restorePixelRatio(ctx.renderer.setPixelRatio.bind(ctx.renderer), prev)
      throw err
    }
    return {
      rollback() {
        ctx.renderer.setPixelRatio(prev)
      },
    }
  },
}
