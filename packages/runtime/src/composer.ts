import type { DoctorRendererLike } from './passes/types.js'

export function isComposerLike(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const rec = value as Record<string, unknown>
  if (rec.isEffectComposer === true) return true
  const hasPasses = Array.isArray(rec.passes)
  const hasClassicTarget = rec.renderTarget1 !== undefined || rec.writeBuffer !== undefined
  const hasPmndrsTarget = rec.inputBuffer !== undefined || rec.outputBuffer !== undefined
  return hasPasses && (hasClassicTarget || hasPmndrsTarget)
}

function finiteSize(width: unknown, height: unknown): { width: number; height: number } | undefined {
  if (typeof width !== 'number' || typeof height !== 'number') return undefined
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined
  return { width, height }
}

export function readComposerSize(composer: Record<string, unknown>): {
  width?: number
  height?: number
  pixelRatio?: number
} {
  const rt =
    (composer.renderTarget1 as { width?: unknown; height?: unknown } | undefined) ??
    (composer.writeBuffer as { width?: unknown; height?: unknown } | undefined) ??
    (composer.inputBuffer as { width?: unknown; height?: unknown } | undefined) ??
    (composer.outputBuffer as { width?: unknown; height?: unknown } | undefined)
  const size = rt ? finiteSize(rt.width, rt.height) : undefined
  const pr = composer.pixelRatio ?? composer._pixelRatio
  const out: { width?: number; height?: number; pixelRatio?: number } = {}
  if (size) {
    out.width = size.width
    out.height = size.height
  }
  if (typeof pr === 'number' && Number.isFinite(pr) && pr > 0) out.pixelRatio = pr
  return out
}

export function rememberComposer(target: { current?: Record<string, unknown> }, value: unknown): void {
  if (target.current || !isComposerLike(value)) return
  target.current = value
}

function scanForComposer(target: { current?: Record<string, unknown> }, value: unknown): void {
  rememberComposer(target, value)
  if (target.current || !value || typeof value !== 'object') return
  for (const nested of Object.values(value as Record<string, unknown>)) {
    rememberComposer(target, nested)
    if (target.current) return
  }
}

/**
 * Discover an EffectComposer-like object. Explicit `DoctorOptions.composer` wins.
 * Also walks scene.userData and renderer properties. Supports three.js
 * (renderTarget1/writeBuffer) and pmndrs postprocessing (inputBuffer/outputBuffer).
 */
export function findComposer(
  scene: unknown,
  renderer: unknown,
  explicit?: unknown,
  extraRoots: unknown[] = [],
): Record<string, unknown> | undefined {
  const ref: { current?: Record<string, unknown> } = {}
  rememberComposer(ref, explicit)
  if (ref.current) return ref.current
  scanForComposer(ref, scene)
  if (scene && typeof scene === 'object') {
    scanForComposer(ref, (scene as { userData?: unknown }).userData)
  }
  scanForComposer(ref, renderer)
  for (const root of extraRoots) scanForComposer(ref, root)
  return ref.current
}

export interface ComposerLike {
  setPixelRatio?: (value: number) => void
  setSize?: (width: number, height: number) => void
  _width?: number
  _height?: number
}

function cssSizeOf(renderer: DoctorRendererLike): { width: number; height: number } | undefined {
  if (typeof renderer.getSize === 'function') {
    try {
      const target = {
        x: 0,
        y: 0,
        set(x: number, y: number) {
          this.x = x
          this.y = y
          return this
        },
      }
      const size = renderer.getSize(target)
      const width = size?.x ?? size?.width ?? target.x
      const height = size?.y ?? size?.height ?? target.y
      if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
        return { width, height }
      }
    } catch {
      // fall through
    }
  }
  const pr =
    typeof renderer.getPixelRatio === 'function' ? renderer.getPixelRatio() : undefined
  const width = renderer.drawingBufferWidth
  const height = renderer.drawingBufferHeight
  if (
    typeof width === 'number' &&
    typeof height === 'number' &&
    typeof pr === 'number' &&
    pr > 0
  ) {
    return { width: width / pr, height: height / pr }
  }
  return undefined
}

/** Keep a post chain in lockstep with a renderer DPR change. */
export function syncComposerPixelRatio(
  composer: unknown,
  renderer: DoctorRendererLike,
  pixelRatio: number,
): void {
  if (!composer || typeof composer !== 'object') return
  const c = composer as ComposerLike
  if (typeof c.setPixelRatio === 'function') {
    c.setPixelRatio(pixelRatio)
    return
  }
  if (typeof c.setSize !== 'function') return
  const size = cssSizeOf(renderer)
  if (!size) return
  c.setSize(size.width, size.height)
}

export function notifyPixelRatioChange(
  ctx: {
    renderer: DoctorRendererLike
    composer?: unknown
    onPixelRatioChange?: (ratio: number) => void
  },
  pixelRatio: number,
): void {
  syncComposerPixelRatio(ctx.composer, ctx.renderer, pixelRatio)
  ctx.onPixelRatioChange?.(pixelRatio)
}
