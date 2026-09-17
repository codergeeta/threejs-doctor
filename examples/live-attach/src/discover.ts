export interface DiscoveredHandles {
  scene: unknown
  camera: unknown
  renderer: unknown
  source: 'explicit' | 'pelagic' | 'walk'
}

export interface ExplicitHandles {
  scene?: unknown
  camera?: unknown
  renderer?: unknown
}

const SKIP_KEYS = new Set([
  'document',
  'location',
  'navigation',
  'window',
  'self',
  'frames',
  'parent',
  'top',
  'navigator',
  'performance',
  'console',
  'localStorage',
  'sessionStorage',
  'history',
  'screen',
  'visualViewport',
  'crypto',
  'indexedDB',
  'chrome',
  'external',
  'css',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRenderer(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.isWebGLRenderer === true) return true
  return typeof value.setPixelRatio === 'function' && isRecord(value.info)
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

function pelagicDebug(root: unknown): Record<string, unknown> | undefined {
  if (!isRecord(root)) return undefined
  const pelagic = root.pelagic
  if (!isRecord(pelagic)) return undefined
  return isRecord(pelagic.debug) ? pelagic.debug : undefined
}

function findCameraInScene(scene: unknown): unknown {
  if (!isRecord(scene) || typeof scene.traverse !== 'function') return undefined
  let camera: unknown
  scene.traverse((obj: unknown) => {
    if (!camera && isCamera(obj)) camera = obj
  })
  return camera
}

function fromPelagic(root: unknown): DiscoveredHandles | undefined {
  const debug = pelagicDebug(root)
  if (!debug || debug.scene == null || debug.renderer == null) return undefined
  const camera = debug.camera ?? findCameraInScene(debug.scene) ?? {}
  return { scene: debug.scene, camera, renderer: debug.renderer, source: 'pelagic' }
}

function walk(root: unknown): DiscoveredHandles | undefined {
  if (!isRecord(root)) return undefined
  const seen = new Set<unknown>()
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  let scene: unknown
  let camera: unknown
  let renderer: unknown
  let visits = 0

  while (queue.length > 0 && visits < 400) {
    const next = queue.shift()
    if (!next) break
    const { value, depth } = next
    if (!isRecord(value) || seen.has(value) || depth > 4) continue
    if (typeof (value as { nodeType?: unknown }).nodeType === 'number') continue
    seen.add(value)
    visits += 1

    if (!renderer && isRenderer(value)) renderer = value
    if (!scene && isScene(value)) scene = value
    if (!camera && isCamera(value)) camera = value
    if (scene && renderer && camera) break

    for (const key of Object.keys(value)) {
      if (SKIP_KEYS.has(key)) continue
      const child = value[key]
      if (!isRecord(child) || seen.has(child)) continue
      queue.push({ value: child, depth: depth + 1 })
    }
  }

  if (!scene || !renderer) return undefined
  return { scene, camera: camera ?? {}, renderer, source: 'walk' }
}

export function discoverThreeHandles(
  root: unknown = globalThis,
  explicit: ExplicitHandles = {},
): DiscoveredHandles | undefined {
  if (explicit.scene != null && explicit.camera != null && explicit.renderer != null) {
    return {
      scene: explicit.scene,
      camera: explicit.camera,
      renderer: explicit.renderer,
      source: 'explicit',
    }
  }

  const found = fromPelagic(root) ?? walk(root)
  const scene = explicit.scene ?? found?.scene
  const renderer = explicit.renderer ?? found?.renderer
  const camera = explicit.camera ?? found?.camera ?? {}
  if (scene == null || renderer == null) return undefined
  return {
    scene,
    camera,
    renderer,
    source: found?.source ?? 'explicit',
  }
}
