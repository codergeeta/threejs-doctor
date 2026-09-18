export interface PixelRatioSource {
  getPixelRatio?: () => number | undefined
  pixelRatio?: number | undefined
}

export interface AntialiasSource {
  antialias?: boolean | undefined
  getContext?: () =>
    | {
        getContextAttributes?: () => { antialias?: boolean } | null
      }
    | null
    | undefined
}

/** Read a finite pixel ratio from WebGLRenderer (`getPixelRatio`) or a duck-typed field. */
export function readRendererPixelRatio(renderer: PixelRatioSource): number | undefined {
  if (typeof renderer.getPixelRatio === 'function') {
    try {
      const value = renderer.getPixelRatio()
      if (Number.isFinite(value)) return value
    } catch {
      // fall through to the optional field
    }
  }
  if (typeof renderer.pixelRatio === 'number' && Number.isFinite(renderer.pixelRatio)) {
    return renderer.pixelRatio
  }
  return undefined
}

/** Read antialias from the GL context attributes; `renderer.antialias` is not a Three.js field. */
export function readRendererAntialias(renderer: AntialiasSource): boolean | undefined {
  if (typeof renderer.getContext === 'function') {
    try {
      const attrs = renderer.getContext()?.getContextAttributes?.()
      if (attrs && typeof attrs.antialias === 'boolean') return attrs.antialias
    } catch {
      // fall through
    }
  }
  if (typeof renderer.antialias === 'boolean') return renderer.antialias
  return undefined
}
