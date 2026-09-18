import { DOCTOR_HOST_KEY, findRendererDeep, isDeepWalkEnabled } from './discover.js'

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
  for (const key of ['THREE', 'three', '__THREE__'] as const) {
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

function hookRenderMethod(
  root: unknown,
  target: { render: (...args: unknown[]) => unknown },
): RendererRenderCapture {
  const hadOwn = Object.prototype.hasOwnProperty.call(target, 'render')
  const original = target.render
  if (typeof original !== 'function') return idleCapture

  let captured: CapturedHost | undefined
  let active = true

  const restore = () => {
    if (!active) return
    active = false
    if (hadOwn) {
      target.render = original
      return
    }
    try {
      delete (target as { render?: unknown }).render
    } catch {
      target.render = original
    }
  }

  target.render = function (this: unknown, scene: unknown, camera: unknown, ...rest: unknown[]) {
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

/**
 * Hook `WebGLRenderer.prototype.render` **once**, or a discovered instance's
 * `render` if the constructor is not on the page. The first call that looks
 * like `render(scene, camera)` writes `root.__THREEJS_DOCTOR_HOST__` and restores
 * the original method. For bundled games (tanks / catapult) paste this before the
 * live-attach IIFE when THREE is missing and `__THREE__` is not the library.
 */
export interface InstallRendererRenderCaptureOptions {
  /** Already-found renderer; skip a second graph walk. */
  instance?: unknown
  /** Discovery already ran `findRendererDeep`; only look up a constructor on the root. */
  skipDeepWalk?: boolean
  /** Opt into the bounded deep instance walk. Default off. */
  deepWalk?: boolean
}

export function installRendererRenderCapture(
  root: unknown = globalThis,
  options: InstallRendererRenderCaptureOptions = {},
): RendererRenderCapture {
  const ctor = findThreeWebGLRendererCtor(root)
  if (ctor) return hookRenderMethod(root, ctor.prototype)

  const instance = isRecord(options.instance)
    ? options.instance
    : options.skipDeepWalk || !isDeepWalkEnabled(root, options.deepWalk)
      ? undefined
      : findRendererDeep(root)
  if (!isRecord(instance)) return idleCapture

  const fromInstance = instance.constructor
  if (isRendererCtor(fromInstance)) return hookRenderMethod(root, fromInstance.prototype)

  if (typeof instance.render === 'function') {
    return hookRenderMethod(root, instance as { render: (...args: unknown[]) => unknown })
  }
  return idleCapture
}
