import type { SceneSnapshot } from '@threejs-doctor/core'
import type { SourceFile } from './collect-sources.js'

const LIGHT_NAMES =
  'AmbientLight|DirectionalLight|PointLight|SpotLight|HemisphereLight|RectAreaLight|LightProbe'
const MESH_NAMES = 'Mesh|InstancedMesh|SkinnedMesh|BatchedMesh'
const MATERIAL_NAMES =
  'MeshBasicMaterial|MeshStandardMaterial|MeshPhysicalMaterial|MeshLambertMaterial|MeshPhongMaterial|MeshToonMaterial|MeshNormalMaterial|MeshDistanceMaterial|MeshDepthMaterial|ShaderMaterial|RawShaderMaterial'
const GEOMETRY_NAMES =
  'BoxGeometry|SphereGeometry|PlaneGeometry|CylinderGeometry|ConeGeometry|TorusGeometry|CircleGeometry|DodecahedronGeometry|ExtrudeGeometry|LatheGeometry|OctahedronGeometry|PolyhedronGeometry|RingGeometry|ShapeGeometry|TetrahedronGeometry|TorusKnotGeometry|TubeGeometry|BufferGeometry'
const TEXTURE_NAMES =
  'TextureLoader|CubeTextureLoader|Texture|VideoTexture|CanvasTexture|DataTexture|CompressedTexture'

const R3F_LIGHTS = 'ambientLight|directionalLight|pointLight|spotLight|hemisphereLight|rectAreaLight'
const R3F_MESHES = 'mesh|instancedMesh|skinnedMesh'

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
  matrixAutoUpdateDisabledCount: number
  zeroIntensityLightCount: number
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function scriptBodies(path: string, source: string): string[] {
  if (!/\.(html?|vue)$/i.test(path)) return [source]
  const scripts: string[] = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    const attrs = match[1] ?? ''
    const body = match[2] ?? ''
    if (/\bsrc\s*=/.test(attrs) && /three/i.test(attrs)) scripts.push("import 'three'")
    if (body.trim()) scripts.push(body)
  }
  return scripts.length > 0 ? scripts : [source]
}

function countCtor(source: string, names: string): number {
  const re = new RegExp(`\\bnew\\s+(?:THREE\\.)?(?:${names})\\s*\\(`, 'g')
  return source.match(re)?.length ?? 0
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

function lightBindings(source: string): string[] {
  const re = new RegExp(
    `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+(?:THREE\\.)?(?:${LIGHT_NAMES})\\s*\\(`,
    'g',
  )
  return [...source.matchAll(re)].map((m) => m[1]!).filter((id): id is string => Boolean(id))
}

function countShadowCastingLights(source: string, r3fShadowLights: number): number {
  const ids = new Set(lightBindings(source))
  let count = r3fShadowLights
  for (const id of ids) {
    const assigned = new RegExp(`\\b${id}\\.castShadow\\s*=\\s*true\\b`)
    if (assigned.test(source)) count += 1
  }
  const ctorWithFlag = new RegExp(
    `\\bnew\\s+(?:THREE\\.)?(?:${LIGHT_NAMES})\\s*\\(([^)]*)\\)`,
    'g',
  )
  let match: RegExpExecArray | null
  while ((match = ctorWithFlag.exec(source))) {
    if (/\bcastShadow\s*:\s*true\b/.test(match[1] ?? '')) count += 1
  }
  return count
}

function countZeroIntensity(source: string): number {
  let count = 0
  const ctor = new RegExp(`\\bnew\\s+(?:THREE\\.)?(?:${LIGHT_NAMES})\\s*\\(([^)]*)\\)`, 'g')
  let match: RegExpExecArray | null
  while ((match = ctor.exec(source))) {
    if (/\bintensity\s*:\s*0\b/.test(match[1] ?? '')) count += 1
  }
  for (const id of lightBindings(source)) {
    if (new RegExp(`\\b${id}\\.intensity\\s*=\\s*0\\b`).test(source)) count += 1
  }
  return count
}

function parsePixelRatio(source: string): { uncapped: boolean; cap: number | undefined } {
  const calls = [...source.matchAll(/\.setPixelRatio\(\s*([^)]+)\)/g)]
  let uncapped = false
  let cap: number | undefined
  for (const call of calls) {
    const arg = (call[1] ?? '').trim()
    if (/^\d+(?:\.\d+)?$/.test(arg)) {
      cap = Number(arg)
      continue
    }
    if (/devicePixelRatio/.test(arg) && /Math\.min/.test(arg)) {
      const nums = [...arg.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]))
      if (nums.length > 0) cap = Math.min(...nums)
      continue
    }
    if (/^(?:window\.)?devicePixelRatio$/.test(arg)) uncapped = true
  }
  if (cap !== undefined) uncapped = false
  return { uncapped, cap }
}

function parseAntialias(source: string): boolean | undefined {
  const flags = [...source.matchAll(/\bantialias\s*:\s*(true|false)\b/g)].map((m) => m[1] === 'true')
  if (flags.length === 0) return undefined
  return flags[flags.length - 1]
}

function hasContinuousFrameloop(source: string): boolean {
  if (/\bsetAnimationLoop\s*\(\s*(?!null\b|undefined\b)/.test(source)) return true
  if (/\bframeloop\s*[=:]\s*['"]always['"]/.test(source)) return true
  if (/<Canvas\b/.test(source) && !/\bframeloop\s*=\s*\{?\s*['"]demand['"]/.test(source)) return true
  const rafCalls = [...source.matchAll(/requestAnimationFrame\(\s*([A-Za-z_$][\w$]*)\s*\)/g)]
  for (const call of rafCalls) {
    const id = call[1]
    if (!id) continue
    const named = new RegExp(
      `(?:function\\s+${id}|${id}\\s*=\\s*(?:function|\\([^)]*\\)\\s*=>))[\\s\\S]{0,400}requestAnimationFrame\\(\\s*${id}\\s*\\)`,
    )
    if (named.test(source)) return true
  }
  return false
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
    matrixAutoUpdateDisabledCount: 0,
    zeroIntensityLightCount: 0,
  }
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
  into.matrixAutoUpdateDisabledCount += next.matrixAutoUpdateDisabledCount
  into.zeroIntensityLightCount += next.zeroIntensityLightCount
  if (next.antialias !== undefined) into.antialias = next.antialias
  if (next.pixelRatioCap !== undefined) {
    into.pixelRatioCap = next.pixelRatioCap
    into.uncappedDevicePixelRatio = false
  }
}

function factsFromSource(source: string): StaticFacts {
  const code = stripComments(source)
  const r3fLights = countR3fTags(code, R3F_LIGHTS)
  const r3fMeshes = countR3fTags(code, R3F_MESHES)
  const pixel = parsePixelRatio(code)
  return {
    sawThree: sawThreeJs(code) || r3fLights.total > 0 || r3fMeshes.total > 0,
    lightCount: countCtor(code, LIGHT_NAMES) + r3fLights.total,
    shadowCastingLightCount: countShadowCastingLights(code, r3fLights.withCastShadow),
    meshCount: countCtor(code, MESH_NAMES) + r3fMeshes.total,
    materialCount: countCtor(code, MATERIAL_NAMES),
    geometryCount: countCtor(code, GEOMETRY_NAMES),
    textureCount: countCtor(code, TEXTURE_NAMES),
    continuousFrameloop: hasContinuousFrameloop(code),
    antialias: parseAntialias(code),
    uncappedDevicePixelRatio: pixel.uncapped,
    pixelRatioCap: pixel.cap,
    frustumCulledDisabledCount: code.match(/\bfrustumCulled\s*=\s*false\b/g)?.length ?? 0,
    matrixAutoUpdateDisabledCount: code.match(/\bmatrixAutoUpdate\s*=\s*false\b/g)?.length ?? 0,
    zeroIntensityLightCount: countZeroIntensity(code),
  }
}

export function extractStaticFacts(files: SourceFile[]): StaticFacts {
  const facts = emptyFacts()
  for (const file of files) {
    for (const body of scriptBodies(file.path, file.source)) {
      mergeFacts(facts, factsFromSource(body))
    }
  }
  return facts
}

export function factsToSnapshot(
  facts: StaticFacts,
  opts: { assumedDevicePixelRatio: number },
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
  else if (facts.uncappedDevicePixelRatio) snap.rendererPixelRatio = opts.assumedDevicePixelRatio
  if (facts.antialias !== undefined) snap.antialias = facts.antialias
  if (facts.frustumCulledDisabledCount > 0) {
    snap.frustumCulledDisabledCount = facts.frustumCulledDisabledCount
  }
  if (facts.zeroIntensityLightCount > 0) snap.zeroIntensityLightCount = facts.zeroIntensityLightCount
  return snap
}
