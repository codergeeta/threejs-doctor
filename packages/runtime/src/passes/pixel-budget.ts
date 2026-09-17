import { GENERIC_CAPS } from '@threejs-doctor/core'
import type { OptimizePass } from './types.js'

export const pixelBudgetPass: OptimizePass = {
  id: 'pixel-budget',
  apply(ctx) {
    if (ctx.qualityTier === undefined) return { rollback() {} }
    const renderer = ctx.renderer
    const prevRatio = renderer.pixelRatio
    const prevW = renderer.drawingBufferWidth
    const prevH = renderer.drawingBufferHeight
    const capPixels = GENERIC_CAPS[ctx.qualityTier].drawingBufferPixels
    const restore = () => {
      try {
        if (renderer.setDrawingBufferSize && prevW !== undefined && prevH !== undefined) {
          renderer.setDrawingBufferSize(prevW, prevH, prevRatio)
        } else {
          renderer.setPixelRatio(prevRatio)
        }
      } catch {
        // best-effort
      }
    }
    if (capPixels === undefined) {
      return { rollback() {} }
    }
    const width = renderer.drawingBufferWidth
    const height = renderer.drawingBufferHeight
    if (width === undefined || height === undefined) {
      return { rollback() {} }
    }
    const current = width * height
    if (current <= capPixels) {
      return { rollback() {} }
    }
    const scale = Math.sqrt(capPixels / current)
    const newRatio = Math.min(prevRatio, prevRatio * scale)
    try {
      if (renderer.setDrawingBufferSize) {
        const newW = Math.max(1, Math.floor(width * scale))
        const newH = Math.max(1, Math.floor(height * scale))
        renderer.setDrawingBufferSize(newW, newH, prevRatio)
      } else {
        renderer.setPixelRatio(newRatio)
      }
    } catch (err) {
      restore()
      throw err
    }
    return { rollback: restore }
  },
}
