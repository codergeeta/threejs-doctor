import { DOCTOR_HOST_KEY } from './discover.js'

export interface CapturedHost {
  scene: unknown
  camera: unknown
  renderer: unknown
}

export interface RendererRenderCapture {
  installed: boolean
  uninstall(): void
  getCaptured(): CapturedHost | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isScene(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.isScene === true) return true
  return typeof value.traverse === 'function' && Array.isArray(value.children)
}

function isCamera(value: unknown): boolean {
  if (!isRecord(value)) return false
  return value.isCamera === true || value.isPerspectiveCamera === true || value.isOrthographicCamera === true
}

function isRendererCtor(value: unknown): value is { prototype: { render: (...args: unknown[]) => unknown } } {
  if (typeof value !== 'function') return false
  const proto = (value as { prototype?: { render?: unknown } }).prototype
  return !!proto && typeof proto.render === 'function'
}

function readKey(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined
  try {
    return obj[key]
  } catch {
    return undefined
  }
}

/** Locate THREE.WebGLRenderer (namespace or constructor) on a root without walking the whole graph. */
export function findThreeWebGLRendererCtor(root: unknown): {
  prototype: { render: (...args: unknown[]) => unknown }
} | undefined {
  const direct = readKey(root, 'WebGLRenderer')
  if (isRendererCtor(direct)) return direct
  for (const key of ['THREE', 'three'] as const) {
    const ns = readKey(root, key)
    const ctor = readKey(ns, 'WebGLRenderer')
    if (isRendererCtor(ctor)) return ctor
    if (isRendererCtor(ns)) return ns
  }
  return undefined
}

function writeHost(root: unknown, host: CapturedHost): void {
  const assign = (target: object | undefined | null) => {
    if (!target || typeof target !== 'object') return
    try {
      ;(target as Record<string, unknown>)[DOCTOR_HOST_KEY] = host
    } catch {
      // frozen / revoked
    }
  }
  if (isRecord(root)) assign(root)
  assign(globalThis)
  const win = (globalThis as { window?: object }).window
  if (win) assign(win)
}

const idleCapture: RendererRenderCapture = {
  installed: false,
  uninstall() {},
  getCaptured() {
    return undefined
  },
}

/**
 * Hook `THREE.WebGLRenderer.prototype.render` **once**. The first call that looks
 * like `render(scene, camera)` writes `root.__THREEJS_DOCTOR_HOST__` and restores
 * the original method. For bundled games (tanks / catapult) paste this before the
 * live-attach IIFE if THREE is on the page.
 */
export function installRendererRenderCapture(root: unknown = globalThis): RendererRenderCapture {
  const ctor = findThreeWebGLRendererCtor(root)
  if (!ctor) return idleCapture

  const proto = ctor.prototype as { render: (...args: unknown[]) => unknown }
  const hadOwn = Object.prototype.hasOwnProperty.call(proto, 'render')
  const original = proto.render
  if (typeof original !== 'function') return idleCapture

  let captured: CapturedHost | undefined
  let active = true

  const restore = () => {
    if (!active) return
    active = false
    if (hadOwn) {
      proto.render = original
      return
    }
    try {
      delete (proto as { render?: unknown }).render
    } catch {
      proto.render = original
    }
  }

  proto.render = function (this: unknown, scene: unknown, camera: unknown, ...rest: unknown[]) {
    if (active && isScene(scene)) {
      captured = {
        scene,
        camera: isCamera(camera) ? camera : camera ?? {},
        renderer: this,
      }
      writeHost(root, captured)
      restore()
    }
    return original.apply(this, [scene, camera, ...rest])
  }

  return {
    installed: true,
    uninstall: restore,
    getCaptured() {
      return captured
    },
  }
}
