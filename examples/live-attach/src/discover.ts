export interface DiscoveredHandles {
  scene: unknown
  camera: unknown
  renderer: unknown
  composer?: unknown
  source: 'explicit' | 'host' | 'pelagic' | 'walk' | 'canvas'
}

export const DOCTOR_HOST_KEY = '__THREEJS_DOCTOR_HOST__' as const

export interface ExplicitHandles {
  scene?: unknown
  camera?: unknown
  renderer?: unknown
  composer?: unknown
}

export interface DiscoveryOptions {
  /** Opt into the bounded window/document/canvas BFS. Default off so paste cannot freeze. */
  deepWalk?: boolean
}

export interface DeepWalkOptions {
  maxNodes?: number
  maxDepth?: number
  maxMs?: number
  now?: () => number
}

/** Hard caps for the optional deep renderer walk. Paste-in default does not run this walk. */
export const DEEP_WALK_MAX_NODES = 5000
export const DEEP_WALK_MAX_DEPTH = 8
export const DEEP_WALK_MAX_MS = 80

export interface DiscoveryProbe {
  canvasCount: number
  webglContextCount: number
  foundRenderer: boolean
  foundScene: boolean
  foundCamera: boolean
  bundleRootsPresent: string[]
  tried: string[]
}

export interface DiscoveryAttempt {
  scene?: unknown
  camera?: unknown
  renderer?: unknown
  composer?: unknown
  source?: DiscoveredHandles['source']
  probe: DiscoveryProbe
}

/** Cap canvas inspection so a HUD-heavy page (dozens of canvases) cannot freeze paste. */
export const MAX_INSPECT_CANVASES = 8

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

const CANVAS_SKIP_KEYS = new Set([
  ...SKIP_KEYS,
  'parentNode',
  'parentElement',
  'offsetParent',
  'ownerDocument',
  'style',
  'classList',
  'dataset',
  'attributes',
  'childNodes',
  'children',
  'firstChild',
  'lastChild',
  'nextSibling',
  'previousSibling',
  'nextElementSibling',
  'previousElementSibling',
])

const BUNDLE_ROOT_KEYS = [
  'app',
  'game',
  'Game',
  '__ccGame',
  'engine',
  'Engine',
  'THREE',
  '__THREE__',
  'three',
  '__three__',
  'viewer',
  'world',
  'main',
  'Main',
  'experience',
  'application',
  'Application',
  'instance',
  'singleton',
  'scene',
  'camera',
  'renderer',
  'composer',
  'effectComposer',
  '__game',
  'threeApp',
  'gameApp',
  '__app',
] as const

const CANVAS_HANDLE_KEYS = [
  '__THREE__',
  '__r3f',
  'userData',
  '__renderer',
  '_renderer',
  'renderer',
  '__webglRenderer',
] as const

const RENDERER_SCENE_KEYS = ['scene', '_scene', 'currentScene', '_currentScene'] as const
const RENDERER_CAMERA_KEYS = ['camera', '_camera', 'currentCamera', '_currentCamera'] as const
const RENDERER_COMPOSER_KEYS = ['composer', '_composer', 'effectComposer'] as const
const GL_CONTEXT_IDS = ['webgl2', 'webgl', 'experimental-webgl'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function constructorNameOf(value: object): string | undefined {
  try {
    const name = (value as { constructor?: { name?: unknown } }).constructor?.name
    return typeof name === 'string' ? name : undefined
  } catch {
    return undefined
  }
}

function isNamedWebGLRenderer(value: Record<string, unknown>): boolean {
  return constructorNameOf(value) === 'WebGLRenderer' && typeof value.render === 'function'
}

function isDuckRenderer(value: Record<string, unknown>): boolean {
  return typeof value.setPixelRatio === 'function' && isRecord(value.info)
}

function isRenderer(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.isWebGLRenderer === true) return true
  if (isNamedWebGLRenderer(value)) return true
  return isDuckRenderer(value)
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

function isComposerLike(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.isEffectComposer === true) return true
  const hasPasses = Array.isArray(value.passes)
  const hasClassicTarget = value.renderTarget1 !== undefined || value.writeBuffer !== undefined
  const hasPmndrsTarget = value.inputBuffer !== undefined || value.outputBuffer !== undefined
  return hasPasses && (hasClassicTarget || hasPmndrsTarget)
}

function pickComposer(from: unknown): unknown {
  if (isComposerLike(from)) return from
  if (!isRecord(from)) return undefined
  for (const key of RENDERER_COMPOSER_KEYS) {
    const value = readKey(from, key)
    if (isComposerLike(value)) return value
  }
  return undefined
}

function readKey(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined
  try {
    return obj[key]
  } catch {
    return undefined
  }
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

function fromDoctorHost(root: unknown): DiscoveredHandles | undefined {
  if (!isRecord(root)) return undefined
  const host = readKey(root, DOCTOR_HOST_KEY)
  if (!isRecord(host) || host.scene == null || host.renderer == null) return undefined
  const camera = host.camera ?? findCameraInScene(host.scene) ?? {}
  const out: DiscoveredHandles = { scene: host.scene, camera, renderer: host.renderer, source: 'host' }
  if (host.composer != null) out.composer = host.composer
  return out
}

function fromPelagic(root: unknown): DiscoveredHandles | undefined {
  const debug = pelagicDebug(root)
  if (!debug || debug.scene == null || debug.renderer == null) return undefined
  const camera = debug.camera ?? findCameraInScene(debug.scene) ?? {}
  const out: DiscoveredHandles = { scene: debug.scene, camera, renderer: debug.renderer, source: 'pelagic' }
  const composer = debug.composer ?? debug.effectComposer
  if (composer != null) out.composer = composer
  return out
}

interface WalkLimits {
  maxDepth: number
  maxVisits: number
  includeNonEnumerable?: boolean
}

interface PartialHandles {
  scene?: unknown
  camera?: unknown
  renderer?: unknown
  composer?: unknown
}

function mergeHandles(into: PartialHandles, extra: PartialHandles | undefined): void {
  if (!extra) return
  if (into.scene == null && extra.scene != null) into.scene = extra.scene
  if (into.camera == null && extra.camera != null) into.camera = extra.camera
  if (into.renderer == null && extra.renderer != null) into.renderer = extra.renderer
  if (into.composer == null && extra.composer != null) into.composer = extra.composer
}

function fillFromRenderer(renderer: unknown): PartialHandles {
  const out: PartialHandles = {}
  if (!isRecord(renderer)) return out
  for (const key of RENDERER_SCENE_KEYS) {
    const value = readKey(renderer, key)
    if (isScene(value)) {
      out.scene = value
      break
    }
  }
  for (const key of RENDERER_CAMERA_KEYS) {
    const value = readKey(renderer, key)
    if (isCamera(value)) {
      out.camera = value
      break
    }
  }
  const userData = readKey(renderer, 'userData')
  if (out.scene == null) {
    const scene = readKey(userData, 'scene')
    if (isScene(scene)) out.scene = scene
  }
  if (out.camera == null) {
    const camera = readKey(userData, 'camera')
    if (isCamera(camera)) out.camera = camera
  }
  const composer = pickComposer(renderer) ?? pickComposer(userData)
  if (composer != null) out.composer = composer
  return out
}

function keysToVisit(value: Record<string, unknown>, includeNonEnumerable: boolean): string[] {
  const keys = new Set<string>()
  try {
    for (const key of Object.keys(value)) keys.add(key)
  } catch {
    // getters on the object itself
  }
  if (includeNonEnumerable) {
    try {
      for (const key of Object.getOwnPropertyNames(value)) keys.add(key)
    } catch {
      // proxy / revoked
    }
  }
  return [...keys]
}

function enqueueModuleLike(
  value: Record<string, unknown>,
  queue: Array<{ value: unknown; depth: number }>,
  depth: number,
  seen: Set<unknown>,
): void {
  const looksLikeModule = value.__esModule === true || 'default' in value || 'exports' in value
  if (!looksLikeModule) return
  for (const key of ['default', 'exports'] as const) {
    const child = readKey(value, key)
    if (!isRecord(child) || seen.has(child)) continue
    queue.push({ value: child, depth: depth + 1 })
  }
}

function walk(root: unknown, limits: WalkLimits): PartialHandles | undefined {
  if (!isRecord(root)) return undefined
  const seen = new Set<unknown>()
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  const found: PartialHandles = {}
  let visits = 0

  while (queue.length > 0 && visits < limits.maxVisits) {
    const next = queue.shift()
    if (!next) break
    const { value, depth } = next
    if (!isRecord(value) || seen.has(value) || depth > limits.maxDepth) continue
    if (typeof (value as { nodeType?: unknown }).nodeType === 'number') continue
    seen.add(value)
    visits += 1

    try {
      if (!found.renderer && isRenderer(value)) found.renderer = value
      if (!found.scene && isScene(value)) found.scene = value
      if (!found.camera && isCamera(value)) found.camera = value
      if (!found.composer && isComposerLike(value)) found.composer = value
    } catch {
      continue
    }
    if (found.scene && found.renderer && found.camera) break

    enqueueModuleLike(value, queue, depth, seen)

    let keys: string[] = []
    try {
      keys = keysToVisit(value, limits.includeNonEnumerable === true)
    } catch {
      continue
    }
    for (const key of keys) {
      if (SKIP_KEYS.has(key)) continue
      try {
        const child = value[key]
        if (!isRecord(child) || seen.has(child)) continue
        queue.push({ value: child, depth: depth + 1 })
      } catch {
        continue
      }
    }
  }

  if (found.renderer && found.scene == null) mergeHandles(found, fillFromRenderer(found.renderer))
  if (found.composer == null) {
    const composer = pickComposer(found.renderer)
    if (composer != null) found.composer = composer
  }
  if (!found.scene && !found.renderer) return undefined
  return found
}

function getDocument(root: unknown): unknown {
  const fromRoot = readKey(root, 'document')
  if (fromRoot != null) return fromRoot
  if (typeof document !== 'undefined') return document
  return undefined
}

function listCanvases(root: unknown): unknown[] {
  const doc = getDocument(root)
  if (!isRecord(doc) || typeof doc.querySelectorAll !== 'function') return []
  try {
    return Array.from(doc.querySelectorAll('canvas') as ArrayLike<unknown>)
  } catch {
    return []
  }
}

function defaultNow(): number {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now()
    }
  } catch {
    // performance may throw in odd hosts
  }
  return Date.now()
}

function clampDeepWalkOptions(options: DeepWalkOptions = {}): {
  maxNodes: number
  maxDepth: number
  maxMs: number
  now: () => number
} {
  const maxNodes = Math.min(options.maxNodes ?? DEEP_WALK_MAX_NODES, DEEP_WALK_MAX_NODES)
  const maxDepth = Math.min(options.maxDepth ?? DEEP_WALK_MAX_DEPTH, DEEP_WALK_MAX_DEPTH)
  const maxMs = Math.min(options.maxMs ?? DEEP_WALK_MAX_MS, 100)
  return {
    maxNodes: maxNodes > 0 ? maxNodes : DEEP_WALK_MAX_NODES,
    maxDepth: maxDepth >= 0 ? maxDepth : DEEP_WALK_MAX_DEPTH,
    maxMs: maxMs > 0 ? maxMs : DEEP_WALK_MAX_MS,
    now: options.now ?? defaultNow,
  }
}

export function isDeepWalkEnabled(root: unknown, option?: boolean): boolean {
  if (option === true) return true
  if (option === false) return false
  const bag = readKey(root, '__THREEJS_DOCTOR_ATTACH__')
  return isRecord(bag) && bag.deepWalk === true
}

const DEEP_SKIP_KEYS = new Set([
  ...SKIP_KEYS,
  ...CANVAS_SKIP_KEYS,
  'children',
  'parent',
  'geometry',
  'attributes',
  'morphAttributes',
  'index',
  '__THREEJS_DOCTOR_HOST__',
  '__THREEJS_DOCTOR_LAST_REPORT__',
  '__THREEJS_DOCTOR_ATTACH__',
])

function isCanvasElement(value: Record<string, unknown>): boolean {
  const tag = value.tagName
  if (typeof tag === 'string' && tag.toUpperCase() === 'CANVAS') return true
  return typeof value.nodeType === 'number' && typeof value.getContext === 'function'
}

function isIFrameElement(value: Record<string, unknown>): boolean {
  const tag = value.tagName
  return typeof tag === 'string' && tag.toUpperCase() === 'IFRAME'
}

function isDomNode(value: Record<string, unknown>): boolean {
  return typeof value.nodeType === 'number'
}

function isInaccessibleWindow(value: Record<string, unknown>): boolean {
  try {
    if (value.window === value || value.self === value) {
      void (value as { location?: { href?: unknown } }).location?.href
    }
    return false
  } catch {
    return true
  }
}

function isCrossOriginIFrame(value: Record<string, unknown>): boolean {
  if (!isIFrameElement(value)) return false
  try {
    const w = value.contentWindow
    if (w == null || typeof w !== 'object') return false
    void (w as { location: { href: unknown } }).location.href
    return false
  } catch {
    return true
  }
}

function isTypedArrayOrBuffer(value: object): boolean {
  return ArrayBuffer.isView(value) || value instanceof ArrayBuffer
}

function shouldExpandDeep(value: Record<string, unknown>, isSeed: boolean): boolean {
  if (isSeed) return true
  if (isInaccessibleWindow(value) || isCrossOriginIFrame(value)) return false
  if (isIFrameElement(value)) return true
  if (isDomNode(value)) return isCanvasElement(value)
  return !isTypedArrayOrBuffer(value)
}

/**
 * Optional BFS from window, document, and each canvas (non-enumerable own props).
 * Hard-capped (nodes / depth / wall clock). Abort returns undefined — never a 50k sync walk.
 * Default attach does not call this; set `__THREEJS_DOCTOR_ATTACH__.deepWalk = true` to opt in.
 */
export function findRendererDeep(root: unknown, options: DeepWalkOptions = {}): unknown {
  const { maxNodes, maxDepth, maxMs, now } = clampDeepWalkOptions(options)
  const seen = new Set<unknown>()
  const queue: Array<{ value: unknown; depth: number; seed: boolean }> = []
  let head = 0
  let visits = 0
  const started = now()
  let aborted = false
  const overBudget = () => now() - started >= maxMs
  const enqueue = (value: unknown, depth: number, seed: boolean) => {
    if (value == null || typeof value !== 'object') return
    if (seen.has(value) || depth > maxDepth) return
    if (visits + (queue.length - head) >= maxNodes) return
    seen.add(value)
    queue.push({ value, depth, seed })
  }

  enqueue(root, 0, true)
  enqueue(getDocument(root), 0, true)
  for (const canvas of listCanvases(root)) enqueue(canvas, 0, true)

  let named: unknown
  let duck: unknown
  while (head < queue.length && visits < maxNodes) {
    if (overBudget()) {
      aborted = true
      break
    }
    const next = queue[head]
    head += 1
    if (!next) break
    const { value, depth, seed } = next
    if (!isRecord(value)) continue
    visits += 1

    if (isInaccessibleWindow(value) || isCrossOriginIFrame(value)) continue

    try {
      if (value.isWebGLRenderer === true) return value
      if (named == null && isNamedWebGLRenderer(value)) named = value
      else if (duck == null && isDuckRenderer(value)) duck = value
    } catch {
      continue
    }

    if (depth >= maxDepth) continue
    if (!shouldExpandDeep(value, seed)) continue

    if (isIFrameElement(value)) {
      try {
        enqueue(value.contentWindow, depth + 1, true)
        enqueue(value.contentDocument, depth + 1, true)
      } catch {
        continue
      }
    }

    let keys: string[] = []
    try {
      keys = keysToVisit(value, true)
    } catch {
      continue
    }
    for (const key of keys) {
      if (overBudget()) {
        aborted = true
        break
      }
      if (DEEP_SKIP_KEYS.has(key)) continue
      try {
        const child = value[key]
        if (child == null || typeof child !== 'object' || seen.has(child)) continue
        if (!isRecord(child)) continue
        if (isTypedArrayOrBuffer(child)) continue
        if (isCrossOriginIFrame(child) || isInaccessibleWindow(child)) continue
        const childSeed = isCanvasElement(child) || isIFrameElement(child)
        if (isDomNode(child) && !childSeed) continue
        enqueue(child, depth + 1, childSeed)
      } catch {
        continue
      }
    }
    if (aborted) break
  }
  if (aborted) return undefined
  return named ?? duck
}

/** Probe an existing WebGL context. Live game canvases already have one; getContext returns it. */
function peekWebGLContext(canvas: unknown): unknown {
  if (!isRecord(canvas) || typeof canvas.getContext !== 'function') return undefined
  const getContext = canvas.getContext as (id: string) => unknown
  for (const id of GL_CONTEXT_IDS) {
    try {
      const gl = getContext.call(canvas, id)
      if (gl) return gl
    } catch {
      continue
    }
  }
  return undefined
}

function considerValue(into: PartialHandles, value: unknown, limits: WalkLimits): void {
  if (value == null) return
  if (isRenderer(value)) into.renderer ??= value
  if (isScene(value)) into.scene ??= value
  if (isCamera(value)) into.camera ??= value
  if (isComposerLike(value)) into.composer ??= value
  if (isRecord(value) && typeof (value as { nodeType?: unknown }).nodeType !== 'number') {
    mergeHandles(into, walk(value, limits))
  }
  if (into.composer == null) {
    const composer = pickComposer(value)
    if (composer != null) into.composer = composer
  }
}

function canvasArea(canvas: unknown): number {
  const gl = peekWebGLContext(canvas)
  if (!isRecord(gl)) return 0
  const width = gl.drawingBufferWidth
  const height = gl.drawingBufferHeight
  if (typeof width !== 'number' || typeof height !== 'number') return 0
  const area = width * height
  return Number.isFinite(area) && area > 0 ? area : 0
}

function canvasesToInspect(root: unknown): unknown[] {
  const all = listCanvases(root)
  const withGl = all.filter((canvas) => peekWebGLContext(canvas))
  const pool = withGl.length > 0 ? withGl : all
  return [...pool].sort((a, b) => canvasArea(b) - canvasArea(a)).slice(0, MAX_INSPECT_CANVASES)
}

function rendererOwnsCanvas(renderer: unknown, canvas: unknown): boolean {
  return isRenderer(renderer) && readKey(renderer, 'domElement') === canvas
}

function readR3fState(canvas: unknown): PartialHandles | undefined {
  const r3f = readKey(canvas, '__r3f')
  if (!isRecord(r3f)) return undefined
  let state: unknown = r3f
  if (typeof r3f.getState === 'function') {
    try {
      state = r3f.getState()
    } catch {
      return undefined
    }
  }
  if (!isRecord(state)) return undefined
  const out: PartialHandles = {}
  if (isScene(state.scene)) out.scene = state.scene
  if (isCamera(state.camera)) out.camera = state.camera
  const gl = state.gl ?? state.renderer
  if (isRenderer(gl)) out.renderer = gl
  if (isComposerLike(state.composer)) out.composer = state.composer
  if (out.scene == null && out.renderer == null) return undefined
  return out
}

function reverseLookupRendererForCanvas(root: unknown, canvas: unknown): PartialHandles | undefined {
  if (!isRecord(root)) return undefined
  const limits: WalkLimits = { maxDepth: 6, maxVisits: 400, includeNonEnumerable: true }
  for (const key of BUNDLE_ROOT_KEYS) {
    const value = readKey(root, key)
    if (value === undefined) continue
    const local: PartialHandles = {}
    considerValue(local, value, limits)
    if (local.renderer && rendererOwnsCanvas(local.renderer, canvas)) {
      mergeHandles(local, fillFromRenderer(local.renderer))
      const composer = pickComposer(value) ?? pickComposer(local.renderer)
      if (composer != null) local.composer ??= composer
      return local
    }
  }
  return undefined
}

function inspectCanvas(canvas: unknown, root?: unknown): PartialHandles {
  const found: PartialHandles = {}
  const limits: WalkLimits = { maxDepth: 4, maxVisits: 200, includeNonEnumerable: true }

  mergeHandles(found, readR3fState(canvas))
  if (found.scene != null && found.renderer != null) return found

  for (const key of CANVAS_HANDLE_KEYS) {
    considerValue(found, readKey(canvas, key), limits)
  }

  if (isRecord(canvas)) {
    let names: string[] = []
    try {
      names = Object.getOwnPropertyNames(canvas)
    } catch {
      try {
        names = Object.keys(canvas)
      } catch {
        names = []
      }
    }
    for (const key of names) {
      if (SKIP_KEYS.has(key) || CANVAS_SKIP_KEYS.has(key)) continue
      if ((CANVAS_HANDLE_KEYS as readonly string[]).includes(key)) continue
      considerValue(found, readKey(canvas, key), limits)
    }
  }

  const gl = peekWebGLContext(canvas)
  considerValue(found, gl, limits)
  considerValue(found, readKey(gl, '__THREE__'), limits)
  considerValue(found, readKey(gl, 'userData'), limits)
  considerValue(found, readKey(gl, 'renderer'), limits)
  considerValue(found, readKey(gl, '__renderer'), limits)

  if ((found.renderer == null || found.scene == null) && root != null) {
    mergeHandles(found, reverseLookupRendererForCanvas(root, canvas))
  }

  if (found.renderer && found.scene == null) mergeHandles(found, fillFromRenderer(found.renderer))
  return found
}

function fromCanvases(root: unknown): PartialHandles | undefined {
  const found: PartialHandles = {}
  for (const canvas of canvasesToInspect(root)) {
    mergeHandles(found, inspectCanvas(canvas, root))
    if (found.scene && found.renderer) break
  }
  if (!found.scene && !found.renderer) return undefined
  return found
}

function fromBundleRoots(root: unknown, probe: DiscoveryProbe): PartialHandles | undefined {
  if (!isRecord(root)) return undefined
  const found: PartialHandles = {}
  const limits: WalkLimits = { maxDepth: 8, maxVisits: 800, includeNonEnumerable: true }
  for (const key of BUNDLE_ROOT_KEYS) {
    const value = readKey(root, key)
    if (value === undefined) continue
    probe.bundleRootsPresent.push(key)
    considerValue(found, value, limits)
    const composer = pickComposer(value)
    if (composer != null) found.composer ??= composer
    if (found.scene && found.renderer) break
  }
  if (!found.scene && !found.renderer) return undefined
  return found
}

function emptyProbe(): DiscoveryProbe {
  return {
    canvasCount: 0,
    webglContextCount: 0,
    foundRenderer: false,
    foundScene: false,
    foundCamera: false,
    bundleRootsPresent: [],
    tried: [],
  }
}

function refreshProbe(probe: DiscoveryProbe, found: PartialHandles): void {
  probe.foundRenderer = found.renderer != null
  probe.foundScene = found.scene != null
  probe.foundCamera = isCamera(found.camera)
}

export function formatDiscoveryError(probe: DiscoveryProbe): string {
  const webgl = probe.canvasCount === 0 ? 'n/a' : probe.webglContextCount > 0 ? 'yes' : 'no'
  const canvasLabel = `${probe.canvasCount} canvas${probe.canvasCount === 1 ? '' : 'es'}`
  const parts: string[] = []
  if (probe.foundRenderer && !probe.foundScene) {
    parts.push('threejs-doctor live-attach: found WebGLRenderer but not scene/camera.')
  } else {
    parts.push('threejs-doctor live-attach: could not find scene/camera/renderer.')
  }
  parts.push(
    `Found: ${canvasLabel}, WebGL context: ${webgl}, renderer: ${probe.foundRenderer ? 'yes' : 'no'}, scene: ${probe.foundScene ? 'yes' : 'no'}, camera: ${probe.foundCamera ? 'yes' : 'no'}.`,
  )
  if (probe.bundleRootsPresent.length > 0) {
    parts.push(`Bundle roots present: ${probe.bundleRootsPresent.join(', ')}.`)
  } else {
    parts.push('Bundle roots present: none (checked app, game, __THREE__, and module-like singletons).')
  }
  if (probe.foundRenderer && !probe.foundScene) {
    parts.push(
      'Tried renderer properties and render() hook; still missing. Bundled games often close over scene/camera.',
    )
  } else if (probe.tried.length > 0) {
    parts.push(`Tried: ${probe.tried.join(', ')}.`)
  }
  parts.push("Pass them explicitly from this page's console once located:")
  parts.push('  await ThreejsDoctorLiveAttach.attachQualityLadder({ scene, camera, renderer })')
  parts.push(
    'Or expose window.__THREEJS_DOCTOR_HOST__ = { scene, camera, renderer, composer } before pasting (composer optional).',
  )
  parts.push(
    'Default paste skips the deep graph walk. For bundled hosts opt in with window.__THREEJS_DOCTOR_ATTACH__ = { deepWalk: true } (bounded; aborts if the graph is too large).',
  )
  return parts.join(' ')
}

export function attemptDiscovery(
  root: unknown = globalThis,
  explicit: ExplicitHandles = {},
  options: DiscoveryOptions = {},
): DiscoveryAttempt {
  const probe = emptyProbe()
  const canvases = listCanvases(root)
  probe.canvasCount = canvases.length
  for (const canvas of canvases) {
    if (peekWebGLContext(canvas)) probe.webglContextCount += 1
  }
  const deepWalk = isDeepWalkEnabled(root, options.deepWalk)
  probe.tried.push(
    '__THREEJS_DOCTOR_HOST__',
    'pelagic.debug',
    'canvas (__THREE__/userData/internals)',
    'bundle roots (app, game, __THREE__)',
    'global walk',
  )
  if (deepWalk) {
    probe.tried.push('deep walk (window/document/canvas, bounded)')
  } else {
    probe.tried.push('deep walk skipped (set __THREEJS_DOCTOR_ATTACH__.deepWalk)')
  }

  if (explicit.scene != null && explicit.camera != null && explicit.renderer != null) {
    const found = { scene: explicit.scene, camera: explicit.camera, renderer: explicit.renderer }
    refreshProbe(probe, found)
    return { ...found, source: 'explicit', probe }
  }

  const found: PartialHandles = {
    scene: explicit.scene,
    camera: explicit.camera,
    renderer: explicit.renderer,
    composer: explicit.composer,
  }
  let source: DiscoveredHandles['source'] | undefined =
    found.scene != null && found.renderer != null ? 'explicit' : undefined

  const host = fromDoctorHost(root)
  if (host) {
    mergeHandles(found, host)
    source ??= 'host'
  }

  if (found.scene == null || found.renderer == null) {
    const pelagic = fromPelagic(root)
    if (pelagic) {
      mergeHandles(found, pelagic)
      source ??= 'pelagic'
    }
  }

  if (found.scene == null || found.renderer == null) {
    const canvasFound = fromCanvases(root)
    if (canvasFound) {
      const had = found.scene != null && found.renderer != null
      mergeHandles(found, canvasFound)
      if (!had && found.scene != null && found.renderer != null) source ??= 'canvas'
      else if (canvasFound.renderer != null || canvasFound.scene != null) source ??= 'canvas'
    }
  }

  if (found.scene == null || found.renderer == null) {
    const bundleFound = fromBundleRoots(root, probe)
    if (bundleFound) {
      mergeHandles(found, bundleFound)
      source ??= 'walk'
    }
  }

  if (found.scene == null || found.renderer == null) {
    const walked = walk(root, { maxDepth: 4, maxVisits: 400 })
    if (walked) {
      mergeHandles(found, walked)
      source ??= 'walk'
    }
  }

  if (found.renderer == null && deepWalk) {
    const deep = findRendererDeep(root)
    if (deep) {
      found.renderer = deep
      mergeHandles(found, fillFromRenderer(deep))
      source ??= 'walk'
    }
  }

  if (found.renderer != null && found.scene == null) {
    mergeHandles(found, fillFromRenderer(found.renderer))
  }
  if (found.scene != null && found.camera == null) {
    found.camera = findCameraInScene(found.scene)
  }
  if (found.composer == null && found.renderer != null) {
    const composer = pickComposer(found.renderer)
    if (composer != null) found.composer = composer
  }

  refreshProbe(probe, found)
  return { ...found, probe, ...(source ? { source } : {}) }
}

export async function waitForSceneCameraFromRenderer(
  renderer: unknown,
  options: { waitFrame?: () => Promise<void>; maxAttempts?: number } = {},
): Promise<{ scene: unknown; camera: unknown } | undefined> {
  if (!isRecord(renderer)) return undefined
  const extra = fillFromRenderer(renderer)
  if (extra.scene != null) {
    return {
      scene: extra.scene,
      camera: extra.camera ?? findCameraInScene(extra.scene) ?? {},
    }
  }
  if (typeof renderer.render !== 'function') return undefined

  const hadOwn = Object.prototype.hasOwnProperty.call(renderer, 'render')
  const original = renderer.render as (...args: unknown[]) => unknown
  let captured: { scene: unknown; camera: unknown } | undefined

  ;(renderer as { render: (...args: unknown[]) => unknown }).render = function (
    this: unknown,
    scene: unknown,
    camera: unknown,
    ...rest: unknown[]
  ) {
    if (isScene(scene)) {
      captured = {
        scene,
        camera: isCamera(camera) ? camera : (findCameraInScene(scene) ?? camera ?? {}),
      }
    }
    return original.apply(this, [scene, camera, ...rest])
  }

  const wait = options.waitFrame ?? (async () => {})
  const maxAttempts = options.maxAttempts ?? 32
  try {
    for (let i = 0; i < maxAttempts && !captured; i += 1) {
      await wait()
    }
  } finally {
    if (hadOwn) {
      ;(renderer as { render: unknown }).render = original
    } else {
      try {
        delete (renderer as { render?: unknown }).render
      } catch {
        ;(renderer as { render: unknown }).render = original
      }
    }
  }
  return captured
}

export function discoverThreeHandles(
  root: unknown = globalThis,
  explicit: ExplicitHandles = {},
): DiscoveredHandles | undefined {
  const attempt = attemptDiscovery(root, explicit)
  if (attempt.scene == null || attempt.renderer == null) return undefined
  return {
    scene: attempt.scene,
    camera: attempt.camera ?? {},
    renderer: attempt.renderer,
    source: attempt.source ?? 'explicit',
    ...(attempt.composer != null ? { composer: attempt.composer } : {}),
  }
}
