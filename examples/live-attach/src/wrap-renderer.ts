import { readRendererAntialias, readRendererPixelRatio } from '@threejs-doctor/runtime'
import type { DoctorRendererLike } from '@threejs-doctor/runtime'

interface RawRenderer {
  info: DoctorRendererLike['info']
  pixelRatio?: number
  antialias?: boolean
  toneMapping?: number
  shadowMap?: { enabled: boolean }
  drawingBufferWidth?: number
  drawingBufferHeight?: number
  domElement?: { width?: number; height?: number; clientWidth?: number; clientHeight?: number }
  extensions?: { get?: (name: string) => unknown }
  setPixelRatio(value: number): void
  getPixelRatio?: () => number
  getExtension?: (name: string) => unknown
  getContext?: () => {
    drawingBufferWidth: number
    drawingBufferHeight: number
    getExtension?: (name: string) => unknown
    getContextAttributes?: () => { antialias?: boolean } | null
  }
  setDrawingBufferSize?: (width: number, height: number, pixelRatio: number) => void
  setSize?: (width: number, height: number, updateStyle?: boolean) => void
}

function readPixelRatio(raw: RawRenderer): number | undefined {
  return readRendererPixelRatio(raw)
}

function readDrawingBufferWidth(raw: RawRenderer): number | undefined {
  if (typeof raw.drawingBufferWidth === 'number') return raw.drawingBufferWidth
  const gl = typeof raw.getContext === 'function' ? raw.getContext() : undefined
  if (gl && typeof gl.drawingBufferWidth === 'number') return gl.drawingBufferWidth
  if (typeof raw.domElement?.width === 'number') return raw.domElement.width
  return undefined
}

function readDrawingBufferHeight(raw: RawRenderer): number | undefined {
  if (typeof raw.drawingBufferHeight === 'number') return raw.drawingBufferHeight
  const gl = typeof raw.getContext === 'function' ? raw.getContext() : undefined
  if (gl && typeof gl.drawingBufferHeight === 'number') return gl.drawingBufferHeight
  if (typeof raw.domElement?.height === 'number') return raw.domElement.height
  return undefined
}

function defineOptional(
  target: DoctorRendererLike,
  key: string,
  descriptor: PropertyDescriptor,
): void {
  Object.defineProperty(target, key, { configurable: true, enumerable: true, ...descriptor })
}

/** Adapt a live THREE.WebGLRenderer (or duck-typed stand-in) to DoctorRendererLike. */
export function wrapRenderer(raw: object): DoctorRendererLike {
  const r = raw as RawRenderer
  const wrapped: DoctorRendererLike = {
    get info() {
      return r.info
    },
    get pixelRatio(): number | undefined {
      return readPixelRatio(r)
    },
    set pixelRatio(value: number | undefined) {
      if (typeof value === 'number' && Number.isFinite(value)) r.setPixelRatio(value)
    },
    getPixelRatio() {
      return readPixelRatio(r)
    },
    setPixelRatio(value: number) {
      r.setPixelRatio(value)
    },
    setDrawingBufferSize(width: number, height: number, pixelRatio: number) {
      if (typeof r.setDrawingBufferSize === 'function') {
        r.setDrawingBufferSize(width, height, pixelRatio)
        return
      }
      r.setPixelRatio(pixelRatio)
      if (typeof r.setSize === 'function') {
        const cssW = r.domElement?.clientWidth ?? width
        const cssH = r.domElement?.clientHeight ?? height
        r.setSize(cssW, cssH, false)
      }
    },
    getExtension(name: string) {
      if (typeof r.getExtension === 'function') return r.getExtension(name)
      const gl = typeof r.getContext === 'function' ? r.getContext() : undefined
      if (gl && typeof gl.getExtension === 'function') return gl.getExtension(name)
      return r.extensions?.get?.(name)
    },
  }

  defineOptional(wrapped, 'antialias', {
    get: () => readRendererAntialias(r),
  })
  defineOptional(wrapped, 'toneMapping', {
    get: () => r.toneMapping,
    set: (value: number) => {
      r.toneMapping = value
    },
  })
  defineOptional(wrapped, 'shadowMap', {
    get: () => r.shadowMap,
  })
  defineOptional(wrapped, 'drawingBufferWidth', {
    get: () => readDrawingBufferWidth(r),
  })
  defineOptional(wrapped, 'drawingBufferHeight', {
    get: () => readDrawingBufferHeight(r),
  })

  return wrapped
}
