import { GENERIC_CAPS } from '@threejs-doctor/core'
import { readRendererPixelRatio } from '../renderer-read.js'
import type { DoctorRendererLike, OptimizePass } from './types.js'

/** Three.js `setDrawingBufferSize(width, height, pixelRatio)` takes CSS size, not device pixels. */
function cssFromDrawingBuffer(devicePixels: number, pixelRatio: number): number {
  return devicePixels / pixelRatio
}

function drawingBufferPixelsOf(renderer: DoctorRendererLike): number | undefined {
  const width = renderer.drawingBufferWidth
  const height = renderer.drawingBufferHeight
  if (width === undefined || height === undefined) return undefined
  return width * height
}

function restoreDrawingBuffer(
  renderer: DoctorRendererLike,
  cssW: number,
  cssH: number,
  prevRatio: number,
): void {
  try {
    if (renderer.setDrawingBufferSize) {
      renderer.setDrawingBufferSize(cssW, cssH, prevRatio)
    } else {
      renderer.setPixelRatio(prevRatio)
    }
  } catch {
    // best-effort
  }
}

export const pixelBudgetPass: OptimizePass = {
  id: 'pixel-budget',
  apply(ctx) {
    if (ctx.qualityTier === undefined) return { rollback() {} }
    const renderer = ctx.renderer
    const prevRatio = readRendererPixelRatio(renderer)
    if (prevRatio === undefined || !(prevRatio > 0)) return { rollback() {} }
    const prevW = renderer.drawingBufferWidth
    const prevH = renderer.drawingBufferHeight
    const capPixels = GENERIC_CAPS[ctx.qualityTier].drawingBufferPixels
    if (capPixels === undefined) {
      return { rollback() {} }
    }
    if (prevW === undefined || prevH === undefined) {
      return { rollback() {} }
    }
    const current = prevW * prevH
    if (current <= capPixels) {
      return { rollback() {} }
    }
    const scale = Math.sqrt(capPixels / current)
    const newRatio = Math.min(prevRatio, prevRatio * scale)
    if (!Number.isFinite(newRatio) || newRatio >= prevRatio) {
      return { rollback() {} }
    }
    const cssW = cssFromDrawingBuffer(prevW, prevRatio)
    const cssH = cssFromDrawingBuffer(prevH, prevRatio)
    const restore = () => restoreDrawingBuffer(renderer, cssW, cssH, prevRatio)
    try {
      if (renderer.setDrawingBufferSize) {
        renderer.setDrawingBufferSize(cssW, cssH, newRatio)
      } else {
        renderer.setPixelRatio(newRatio)
      }
    } catch (err) {
      restore()
      throw err
    }
    const nextPixels = drawingBufferPixelsOf(renderer)
    if (nextPixels !== undefined && nextPixels > current) {
      restore()
      return { rollback() {} }
    }
    return { rollback: restore }
  },
}
