import type { SceneSnapshot } from '@threejs-doctor/core'
import type { SourceFile } from './collect-sources.js'

const LIGHT_NAMES =
  'AmbientLight|DirectionalLight|PointLight|SpotLight|HemisphereLight|RectAreaLight|LightProbe'
const MESH_NAMES = 'Mesh|InstancedMesh|SkinnedMesh|BatchedMesh'
const FX_NAMES = 'Points|Line|LineSegments|LineLoop|Sprite'
const MATERIAL_NAMES =
  'MeshBasicMaterial|MeshStandardMaterial|MeshPhysicalMaterial|MeshLambertMaterial|MeshPhongMaterial|MeshToonMaterial|MeshNormalMaterial|MeshDistanceMaterial|MeshDepthMaterial|ShaderMaterial|RawShaderMaterial'
const GEOMETRY_NAMES =
  'BoxGeometry|SphereGeometry|PlaneGeometry|CylinderGeometry|ConeGeometry|TorusGeometry|CircleGeometry|DodecahedronGeometry|ExtrudeGeometry|LatheGeometry|OctahedronGeometry|PolyhedronGeometry|RingGeometry|ShapeGeometry|TetrahedronGeometry|TorusKnotGeometry|TubeGeometry|BufferGeometry'
const TEXTURE_NAMES =
  'TextureLoader|CubeTextureLoader|Texture|VideoTexture|CanvasTexture|DataTexture|CompressedTexture'

const LIGHT_NAME_LIST = LIGHT_NAMES.split('|')
const R3F_LIGHTS = 'ambientLight|directionalLight|pointLight|spotLight|hemisphereLight|rectAreaLight'
const R3F_MESHES = 'mesh|instancedMesh|skinnedMesh'
const R3F_FX = 'points|line|lineSegments|sprite'

const INTENSITY_ARG_INDEX: Record<string, number> = {
  PointLight: 1,
  SpotLight: 1,
  DirectionalLight: 1,
  AmbientLight: 1,
  RectAreaLight: 1,
  HemisphereLight: 2,
}

export interface SourceLocation {
  file: string
  line: number
}

export interface StaticLocations {
  lights: SourceLocation[]
  shadowCasters: SourceLocation[]
  zeroIntensity: SourceLocation[]
  meshes: SourceLocation[]
  materials: SourceLocation[]
  uncappedDpr: SourceLocation[]
  antialiasTrue: SourceLocation[]
  frustumDisabled: SourceLocation[]
  frustumDisabledFx: SourceLocation[]
  continuousFrameloop: SourceLocation[]
  effectComposer: SourceLocation[]
  setPixelRatio: SourceLocation[]
  rendererCtor: SourceLocation[]
}

export interface StaticFacts {
  sawThree: boolean
  lightCount: number
  shadowCastingLightCount: number
  meshCount: number
  materialCount: number
  geometryCount: number
  textureCount: number
  continuousFrameloop: boolean
  antialias: boolean | undefined
  uncappedDevicePixelRatio: boolean
  pixelRatioCap: number | undefined
  frustumCulledDisabledCount: number
  frustumCulledDisabledFxCount: number
  matrixAutoUpdateDisabledCount: number
  zeroIntensityLightCount: number
  composerCtorCount: number
  composerPixelRatioSynced: boolean
  hasNonComposerSetPixelRatio: boolean
  locations: StaticLocations
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (full, prefix: string) => prefix + ' '.repeat(full.length - prefix.length))
}

function lineOf(source: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line += 1
  }
  return line
}

function loc(file: string, source: string, index: number, lineOffset = 0): SourceLocation {
  return { file, line: lineOffset + lineOf(source, index) }
}

function emptyLocations(): StaticLocations {
  return {
    lights: [],
    shadowCasters: [],
    zeroIntensity: [],
    meshes: [],
    materials: [],
    uncappedDpr: [],
    antialiasTrue: [],
    frustumDisabled: [],
    frustumDisabledFx: [],
    continuousFrameloop: [],
    effectComposer: [],
    setPixelRatio: [],
    rendererCtor: [],
  }
}

function scriptBodies(path: string, source: string): Array<{ body: string; lineOffset: number }> {
  if (!/\.(html?|vue)$/i.test(path)) return [{ body: source, lineOffset: 0 }]
  const scripts: Array<{ body: string; lineOffset: number }> = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    const attrs = match[1] ?? ''
    const body = match[2] ?? ''
    const bodyIndex = match.index + match[0].indexOf(body)
    const lineOffset = lineOf(source, bodyIndex) - 1
    if (/\bsrc\s*=/.test(attrs) && /three/i.test(attrs)) {
      scripts.push({ body: "import 'three'", lineOffset })
    }
    if (body.trim()) scripts.push({ body, lineOffset })
  }
  return scripts.length > 0 ? scripts : [{ body: source, lineOffset: 0 }]
}

function countCtorHits(source: string, names: string, file: string, lineOffset: number): SourceLocation[] {
  const re = new RegExp(`\\bnew\\s+(?:THREE\\.)?(?:${names})\\s*\\(`, 'g')
  const hits: SourceLocation[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    hits.push(loc(file, source, match.index, lineOffset))
  }
  return hits
}

function countR3fTags(source: string, names: string): { total: number; withCastShadow: number } {
  const re = new RegExp(`<(${names})\\b([^>]*?)\\/?>`, 'g')
  let total = 0
  let withCastShadow = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    total += 1
    const attrs = match[2] ?? ''
    if (/\bcastShadow\b/.test(attrs) && !/\bcastShadow\s*=\s*\{\s*false\s*\}/.test(attrs)) {
      withCastShadow += 1
    }
  }
  return { total, withCastShadow }
}

function importAliasMap(source: string, canonical: readonly string[]): Map<string, string> {
  const aliases = new Map<string, string>()
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]three(?:\/[^'"]*)?['"]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    for (const part of (match[1] ?? '').split(',')) {
      const renamed = part.match(/(\w+)\s+as\s+(\w+)/)
      if (renamed && canonical.includes(renamed[1]!)) aliases.set(renamed[2]!, renamed[1]!)
    }
  }
  return aliases
}

function ctorNames(source: string, canonical: string, extras: string[]): string {
  return extras.length > 0 ? `${canonical}|${extras.join('|')}` : canonical
}

function lightBindings(source: string, lightCtors: string): string[] {
  const re = new RegExp(
    `(?:\\b(?:const|let|var)\\s+)?(?:this\\.)?([A-Za-z_$][\\w$]*)\\s*(?::\\s*[A-Za-z_$][\\w$.|<>\\s,]*)?=\\s*new\\s+(?:THREE\\.)?(?:${lightCtors})\\s*\\(`,
    'g',
  )
  return [...source.matchAll(re)].map((m) => m[1]!).filter((id): id is string => Boolean(id))
}

function objectBindings(source: string, names: string): string[] {
  const re = new RegExp(
    `(?:\\b(?:const|let|var)\\s+)?(?:this\\.)?([A-Za-z_$][\\w$]*)\\s*(?::\\s*[A-Za-z_$][\\w$.|<>\\s,]*)?=\\s*new\\s+(?:THREE\\.)?(?:${names})\\s*\\(`,
    'g',
  )
  return [...source.matchAll(re)].map((m) => m[1]!).filter((id): id is string => Boolean(id))
}

function extractCallArgs(source: string, openParenIndex: number): string {
  let depth = 0
  for (let i = openParenIndex; i < source.length; i++) {
    const ch = source[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return source.slice(openParenIndex + 1, i)
    }
  }
  return ''
}

function splitTopLevelArgs(args: string): string[] {
  const out: string[] = []
  let current = ''
  let depth = 0
  for (const ch of args) {
    if (ch === '(' || ch === '[' || ch === '{') depth += 1
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1
    if (ch === ',' && depth === 0) {
      out.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) out.push(current.trim())
  return out
}

function isLiteralZero(expr: string): boolean {
  return /^(?:0(?:\.0+)?|0x0+)$/.test(expr.trim())
}

function countShadowCastingLights(
  source: string,
  lightCtors: string,
  r3fShadowLights: number,
  file: string,
  lineOffset: number,
): { count: number; locations: SourceLocation[] } {
  const ids = new Set(lightBindings(source, lightCtors))
  let count = r3fShadowLights
  const locations: SourceLocation[] = []
  for (const id of ids) {
    const assigned = new RegExp(`(?:\\bthis\\.)?\\b${id}\\.castShadow\\s*=\\s*([^\\n;]+)`)
    const hit = assigned.exec(source)
    if (!hit) continue
    const rhs = (hit[1] ?? '').trim()
    if (/^(?:false|0|null|undefined)$/.test(rhs)) continue
    count += 1
    locations.push(loc(file, source, hit.index, lineOffset))
  }
  const ctorWithFlag = new RegExp(`\\bnew\\s+(?:THREE\\.)?(?:${lightCtors})\\s*\\(`, 'g')
  let match: RegExpExecArray | null
  while ((match = ctorWithFlag.exec(source))) {
    const open = match.index + match[0].length - 1
    const args = extractCallArgs(source, open)
    if (/\bcastShadow\s*:\s*true\b/.test(args)) {
      count += 1
      locations.push(loc(file, source, match.index, lineOffset))
    }
  }
  return { count, locations }
}

function countZeroIntensity(
  source: string,
  lightCtors: string,
  aliasToCanonical: Map<string, string>,
  file: string,
  lineOffset: number,
): { count: number; locations: SourceLocation[] } {
  let count = 0
  const locations: SourceLocation[] = []
  const ctor = new RegExp(`\\bnew\\s+(?:THREE\\.)?(${lightCtors})\\s*\\(`, 'g')
  let match: RegExpExecArray | null
  while ((match = ctor.exec(source))) {
    const name = match[1] ?? ''
    const canonical = aliasToCanonical.get(name) ?? name
    const open = match.index + match[0].length - 1
    const args = extractCallArgs(source, open)
    if (/\bintensity\s*:\s*0\b/.test(args)) {
      count += 1
      locations.push(loc(file, source, match.index, lineOffset))
      continue
    }
    const intensityIndex = INTENSITY_ARG_INDEX[canonical]
    if (intensityIndex === undefined) continue
    const parts = splitTopLevelArgs(args)
    const positional = parts[intensityIndex]
    if (positional !== undefined && isLiteralZero(positional) && !/\bintensity\s*:/.test(args)) {
      count += 1
      locations.push(loc(file, source, match.index, lineOffset))
    }
  }
  for (const id of lightBindings(source, lightCtors)) {
    const re = new RegExp(`(?:\\bthis\\.)?\\b${id}\\.intensity\\s*=\\s*0\\b`)
    const hit = re.exec(source)
    if (hit) {
      count += 1
      locations.push(loc(file, source, hit.index, lineOffset))
    }
  }
  return { count, locations }
}

function parsePixelRatio(
  source: string,
  file: string,
  lineOffset: number,
  composerIds: Set<string>,
): {
  uncapped: boolean
  cap: number | undefined
  nonComposer: boolean
  locations: SourceLocation[]
} {
  const calls = [...source.matchAll(/(\.?)setPixelRatio\(\s*([^)]+)\)/g)]
  let uncapped = false
  let cap: number | undefined
  let nonComposer = false
  const locations: SourceLocation[] = []
  for (const call of calls) {
    const arg = (call[2] ?? '').trim()
    const idx = call.index ?? 0
    const before = source.slice(Math.max(0, idx - 80), idx)
    const idHit = before.match(/([A-Za-z_$][\w$]*)\s*$/)
    const id = idHit?.[1]
    const onComposer = Boolean(id && composerIds.has(id))
    if (!onComposer) {
      nonComposer = true
      locations.push(loc(file, source, idx, lineOffset))
    }
    if (/^\d+(?:\.\d+)?$/.test(arg)) {
      cap = Number(arg)
      continue
    }
    if (/devicePixelRatio/.test(arg) && /Math\.min/.test(arg)) {
      const nums = [...arg.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]))
      if (nums.length > 0) cap = Math.min(...nums)
      continue
    }
    if (/^(?:window\.)?devicePixelRatio$/.test(arg) || /devicePixelRatio/.test(arg)) {
      if (!/Math\.min/.test(arg)) uncapped = true
    }
  }
  if (uncapped) cap = undefined
  return { uncapped, cap, nonComposer, locations }
}

function parseAntialias(source: string, file: string, lineOffset: number): {
  value: boolean | undefined
  locations: SourceLocation[]
} {
  const flags = [...source.matchAll(/\bantialias\s*:\s*(true|false)\b/g)]
  if (flags.length === 0) return { value: undefined, locations: [] }
  const last = flags[flags.length - 1]!
  const value = last[1] === 'true'
  const locations = value ? [loc(file, source, last.index ?? 0, lineOffset)] : []
  return { value, locations }
}

function hasContinuousFrameloop(
  source: string,
  file: string,
  lineOffset: number,
): { yes: boolean; location?: SourceLocation } {
  const mark = (index: number) => loc(file, source, index, lineOffset)
  const setLoop = source.match(/\bsetAnimationLoop\s*\(\s*(?!null\b|undefined\b)/)
  if (setLoop) return { yes: true, location: mark(setLoop.index ?? 0) }
  const always = source.match(/\bframeloop\s*[=:]\s*['"]always['"]/)
  if (always) return { yes: true, location: mark(always.index ?? 0) }
  if (
    /\bfrom\s+['"]@react-three\/fiber['"]/.test(source) &&
    /<Canvas\b/.test(source) &&
    !/\bframeloop\s*=\s*\{?\s*['"](?:demand|never)['"]/.test(source)
  ) {
    const canvas = source.match(/<Canvas\b/)
    return canvas ? { yes: true, location: mark(canvas.index ?? 0) } : { yes: true }
  }
  const rafRender = source.match(/requestAnimationFrame\s*\(/)
  if (rafRender && /\.render\s*\(/.test(source)) {
    return { yes: true, location: mark(rafRender.index ?? 0) }
  }
  const rafCalls = [...source.matchAll(/requestAnimationFrame\(\s*(?:this\.)?([A-Za-z_$][\w$]*)\s*\)/g)]
  for (const call of rafCalls) {
    const id = call[1]
    if (!id) continue
    const named = new RegExp(
      `(?:function\\s+${id}|${id}\\s*=\\s*(?:function|\\([^)]*\\)\\s*=>))[\\s\\S]{0,400}requestAnimationFrame\\(\\s*(?:this\\.)?${id}\\s*\\)`,
    )
    if (named.test(source)) return { yes: true, location: mark(call.index ?? 0) }
  }
  return { yes: false }
}

function sawThreeJs(source: string): boolean {
  return (
    /\bfrom\s+['"]three(?:\/[^'"]*)?['"]/.test(source) ||
    /\bfrom\s+['"]@react-three\//.test(source) ||
    /\bTHREE\./.test(source) ||
    /three(?:\.module)?(?:\.min)?\.js/.test(source) ||
    /\bnew\s+(?:THREE\.)?(?:WebGLRenderer|WebGPURenderer|Scene)\s*\(/.test(source)
  )
}

function countFrustumDisabled(
  source: string,
  file: string,
  lineOffset: number,
): { mesh: SourceLocation[]; fx: SourceLocation[] } {
  const meshIds = new Set(objectBindings(source, MESH_NAMES))
  const fxIds = new Set(objectBindings(source, FX_NAMES))
  const mesh: SourceLocation[] = []
  const fx: SourceLocation[] = []
  const re = /(?:\bthis\.)?([A-Za-z_$][\w$]*)\.frustumCulled\s*=\s*false\b/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    const id = match[1] ?? ''
    const at = loc(file, source, match.index, lineOffset)
    if (fxIds.has(id)) fx.push(at)
    else if (meshIds.has(id)) mesh.push(at)
    else mesh.push(at)
  }
  const r3fFx = new RegExp(`<(${R3F_FX})\\b([^>]*?)\\/?>`, 'g')
  let r3f: RegExpExecArray | null
  while ((r3f = r3fFx.exec(source))) {
    if (/\bfrustumCulled\s*=\s*\{\s*false\s*\}/.test(r3f[2] ?? '')) {
      fx.push(loc(file, source, r3f.index, lineOffset))
    }
  }
  const r3fMesh = new RegExp(`<(${R3F_MESHES})\\b([^>]*?)\\/?>`, 'g')
  while ((r3f = r3fMesh.exec(source))) {
    if (/\bfrustumCulled\s*=\s*\{\s*false\s*\}/.test(r3f[2] ?? '')) {
      mesh.push(loc(file, source, r3f.index, lineOffset))
    }
  }
  return { mesh, fx }
}

function composerKind(source: string): 'three' | 'pmndrs' {
  if (
    /\bfrom\s+['"]postprocessing(?:\/[^'"]*)?['"]/.test(source) ||
    /\brequire\(\s*['"]postprocessing(?:\/[^'"]*)?['"]\s*\)/.test(source) ||
    /@react-three\/postprocessing/.test(source)
  ) {
    return 'pmndrs'
  }
  return 'three'
}

function composerFacts(
  source: string,
  file: string,
  lineOffset: number,
): {
  ctor: SourceLocation[]
  ids: Set<string>
  synced: boolean
} {
  const ctor = countCtorHits(source, 'EffectComposer', file, lineOffset)
  const ids = new Set(objectBindings(source, 'EffectComposer'))
  if (ctor.length > 0 && ids.size === 0) ids.add('composer')
  const kind = composerKind(source)
  let synced = false
  for (const id of ids) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`(?:\\bthis\\.)?\\b${escaped}\\.setPixelRatio\\s*\\(`).test(source)) {
      synced = true
      break
    }
    if (kind === 'pmndrs' && new RegExp(`(?:\\bthis\\.)?\\b${escaped}\\.setSize\\s*\\(`).test(source)) {
      synced = true
      break
    }
  }
  return { ctor, ids, synced }
}

function emptyFacts(): StaticFacts {
  return {
    sawThree: false,
    lightCount: 0,
    shadowCastingLightCount: 0,
    meshCount: 0,
    materialCount: 0,
    geometryCount: 0,
    textureCount: 0,
    continuousFrameloop: false,
    antialias: undefined,
    uncappedDevicePixelRatio: false,
    pixelRatioCap: undefined,
    frustumCulledDisabledCount: 0,
    frustumCulledDisabledFxCount: 0,
    matrixAutoUpdateDisabledCount: 0,
    zeroIntensityLightCount: 0,
    composerCtorCount: 0,
    composerPixelRatioSynced: false,
    hasNonComposerSetPixelRatio: false,
    locations: emptyLocations(),
  }
}

function concatLoc(into: SourceLocation[], extra: SourceLocation[]): void {
  into.push(...extra)
}

function mergeFacts(into: StaticFacts, next: StaticFacts): void {
  into.sawThree = into.sawThree || next.sawThree
  into.lightCount += next.lightCount
  into.shadowCastingLightCount += next.shadowCastingLightCount
  into.meshCount += next.meshCount
  into.materialCount += next.materialCount
  into.geometryCount += next.geometryCount
  into.textureCount += next.textureCount
  into.continuousFrameloop = into.continuousFrameloop || next.continuousFrameloop
  into.uncappedDevicePixelRatio = into.uncappedDevicePixelRatio || next.uncappedDevicePixelRatio
  into.frustumCulledDisabledCount += next.frustumCulledDisabledCount
  into.frustumCulledDisabledFxCount += next.frustumCulledDisabledFxCount
  into.matrixAutoUpdateDisabledCount += next.matrixAutoUpdateDisabledCount
  into.zeroIntensityLightCount += next.zeroIntensityLightCount
  into.composerCtorCount += next.composerCtorCount
  into.composerPixelRatioSynced = into.composerPixelRatioSynced || next.composerPixelRatioSynced
  into.hasNonComposerSetPixelRatio = into.hasNonComposerSetPixelRatio || next.hasNonComposerSetPixelRatio
  if (next.antialias !== undefined) into.antialias = next.antialias
  if (next.uncappedDevicePixelRatio) {
    into.uncappedDevicePixelRatio = true
    into.pixelRatioCap = undefined
  } else if (next.pixelRatioCap !== undefined && !into.uncappedDevicePixelRatio) {
    into.pixelRatioCap = next.pixelRatioCap
  }
  const keys = Object.keys(into.locations) as Array<keyof StaticLocations>
  for (const key of keys) concatLoc(into.locations[key], next.locations[key])
}

function factsFromSource(source: string, file: string, lineOffset: number): StaticFacts {
  const code = stripComments(source)
  const aliasMap = importAliasMap(code, LIGHT_NAME_LIST)
  const lightAliases = [...aliasMap.keys()]
  const lightCtors = ctorNames(code, LIGHT_NAMES, lightAliases)
  const r3fLights = countR3fTags(code, R3F_LIGHTS)
  const r3fMeshes = countR3fTags(code, R3F_MESHES)
  const composer = composerFacts(code, file, lineOffset)
  const pixel = parsePixelRatio(code, file, lineOffset, composer.ids)
  const antialias = parseAntialias(code, file, lineOffset)
  const lights = countCtorHits(code, lightCtors, file, lineOffset)
  const meshes = countCtorHits(code, MESH_NAMES, file, lineOffset)
  const materials = countCtorHits(code, MATERIAL_NAMES, file, lineOffset)
  const shadows = countShadowCastingLights(code, lightCtors, r3fLights.withCastShadow, file, lineOffset)
  const zeros = countZeroIntensity(code, lightCtors, aliasMap, file, lineOffset)
  const frustum = countFrustumDisabled(code, file, lineOffset)
  const loop = hasContinuousFrameloop(code, file, lineOffset)
  const rendererCtor = countCtorHits(code, 'WebGLRenderer|WebGPURenderer', file, lineOffset)
  const locations = emptyLocations()
  concatLoc(locations.lights, lights)
  concatLoc(locations.shadowCasters, shadows.locations)
  concatLoc(locations.zeroIntensity, zeros.locations)
  concatLoc(locations.meshes, meshes)
  concatLoc(locations.materials, materials)
  concatLoc(locations.uncappedDpr, pixel.uncapped ? pixel.locations : [])
  concatLoc(locations.antialiasTrue, antialias.locations)
  concatLoc(locations.frustumDisabled, frustum.mesh)
  concatLoc(locations.frustumDisabledFx, frustum.fx)
  if (loop.location) locations.continuousFrameloop.push(loop.location)
  concatLoc(locations.effectComposer, composer.ctor)
  concatLoc(locations.setPixelRatio, pixel.locations)
  concatLoc(locations.rendererCtor, rendererCtor)
  return {
    sawThree:
      sawThreeJs(code) || r3fLights.total > 0 || r3fMeshes.total > 0 || lightAliases.length > 0 || composer.ctor.length > 0,
    lightCount: lights.length + r3fLights.total,
    shadowCastingLightCount: shadows.count,
    meshCount: meshes.length + r3fMeshes.total,
    materialCount: materials.length,
    geometryCount: countCtorHits(code, GEOMETRY_NAMES, file, lineOffset).length,
    textureCount: countCtorHits(code, TEXTURE_NAMES, file, lineOffset).length,
    continuousFrameloop: loop.yes,
    antialias: antialias.value,
    uncappedDevicePixelRatio: pixel.uncapped,
    pixelRatioCap: pixel.cap,
    frustumCulledDisabledCount: frustum.mesh.length,
    frustumCulledDisabledFxCount: frustum.fx.length,
    matrixAutoUpdateDisabledCount: code.match(/\bmatrixAutoUpdate\s*=\s*false\b/g)?.length ?? 0,
    zeroIntensityLightCount: zeros.count,
    composerCtorCount: composer.ctor.length,
    composerPixelRatioSynced: composer.synced,
    hasNonComposerSetPixelRatio: pixel.nonComposer,
    locations,
  }
}

export function extractStaticFacts(files: SourceFile[]): StaticFacts {
  const facts = emptyFacts()
  for (const file of files) {
    for (const { body, lineOffset } of scriptBodies(file.path, file.source)) {
      mergeFacts(facts, factsFromSource(body, file.path, lineOffset))
    }
  }
  return facts
}

export function factsToSnapshot(
  facts: StaticFacts,
  _opts?: { assumedDevicePixelRatio: number },
): SceneSnapshot {
  const matrixAutoUpdateCount = Math.max(0, facts.meshCount - facts.matrixAutoUpdateDisabledCount)
  const snap: SceneSnapshot = {
    objectCount: facts.meshCount + facts.lightCount,
    meshCount: facts.meshCount,
    geometryCount: facts.geometryCount,
    materialCount: facts.materialCount,
    textureCount: facts.textureCount,
    estimatedVramBytes: 0,
    lightCount: facts.lightCount,
    shadowCastingLightCount: facts.shadowCastingLightCount,
    drawCalls: 0,
    triangles: 0,
    maxTextureDimension: 0,
    continuousFrameloop: facts.continuousFrameloop,
    matrixAutoUpdateCount,
  }
  if (facts.pixelRatioCap !== undefined) snap.rendererPixelRatio = facts.pixelRatioCap
  if (facts.antialias !== undefined) snap.antialias = facts.antialias
  if (facts.frustumCulledDisabledCount > 0) {
    snap.frustumCulledDisabledCount = facts.frustumCulledDisabledCount
  }
  if (facts.zeroIntensityLightCount > 0) snap.zeroIntensityLightCount = facts.zeroIntensityLightCount
  return snap
}
