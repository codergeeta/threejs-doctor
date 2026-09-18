import { readRendererPixelRatio } from '../renderer-read.js'
import { notifyPixelRatioChange } from '../composer.js'
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

function capFor(ctx: Parameters<OptimizePass['apply']>[0], prev: number): number {
  if (ctx.qualityTier) {
    return ctx.qualityTier === 'potato'
      ? 1.0
      : ctx.qualityTier === 'low'
        ? 1.25
        : ctx.qualityTier === 'mid'
          ? 1.5
          : 2
  }
  return ctx.device.tier === 'low' ? 1.5 : ctx.device.tier === 'mid' ? 2 : Math.min(prev, 2)
}

export const dprCapPass: OptimizePass = {
  id: 'dpr-cap',
  apply(ctx) {
    const prev = readRendererPixelRatio(ctx.renderer)
    if (prev === undefined) return { rollback() {} }
    const cap = capFor(ctx, prev)
    const next = Math.min(prev, cap)
    if (!Number.isFinite(next)) return { rollback() {} }
    try {
      ctx.renderer.setPixelRatio(next)
      notifyPixelRatioChange(ctx, next)
    } catch (err) {
      restorePixelRatio(ctx.renderer.setPixelRatio.bind(ctx.renderer), prev)
      throw err
    }
    return {
      rollback() {
        ctx.renderer.setPixelRatio(prev)
        notifyPixelRatioChange(ctx, prev)
      },
    }
  },
}
