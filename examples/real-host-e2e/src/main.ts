import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import {
  collectHostSceneStats,
  createGpuFrameSampler,
  Doctor,
  readHostWorldRadius,
} from '@threejs-doctor/runtime'

export interface RealHostE2eReport {
  webgl2: boolean
  glHasCreateQuery: boolean
  extPresent: boolean
  extHasCreateQuery: boolean
  samplerConstructed: boolean | null
  gpuFrameTimeMsPresent: boolean
  composerMismatchAfterDpr: boolean
  instancedWorldRadius: number
  computeBoundingSphereRadius: number
  geometrySphereRadius: number
  geometryTrianglesBefore: number
  geometryTrianglesAfter: number
  drawnTrianglesBefore: number
  drawnTrianglesAfter: number
}

declare global {
  interface Window {
    __R2?: RealHostE2eReport
  }
}

const canvas = document.createElement('canvas')
canvas.width = 320
canvas.height = 180
document.body.appendChild(canvas)

const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' })
renderer.setSize(320, 180, false)
renderer.setPixelRatio(1)

const gl = renderer.getContext()
const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
const glHasCreateQuery = typeof (gl as WebGL2RenderingContext).createQuery === 'function'

const extName = 'EXT_disjoint_timer_query_webgl2'
const ext =
  renderer.extensions.get(extName) ??
  (typeof gl.getExtension === 'function' ? gl.getExtension(extName) : null)
const extPresent = Boolean(ext)
const extHasCreateQuery = Boolean(ext && typeof (ext as { createQuery?: unknown }).createQuery === 'function')

const scene = new Scene()
const camera = new PerspectiveCamera(50, 320 / 180, 0.1, 80)
camera.position.set(0, 0, 8)

const boundsGeometry = new BoxGeometry(1, 1, 1)
boundsGeometry.computeBoundingSphere()
const geometrySphereRadius = boundsGeometry.boundingSphere?.radius ?? 0
const boundsMesh = new InstancedMesh(boundsGeometry, new MeshBasicMaterial({ color: 0xffaa00 }), 2)
boundsMesh.setMatrixAt(0, new Matrix4())
boundsMesh.setMatrixAt(1, new Matrix4().setPosition(200, 0, 0))
boundsMesh.instanceMatrix.needsUpdate = true
boundsMesh.updateMatrixWorld(true)
boundsMesh.visible = false
scene.add(boundsMesh)

const drawGeometry = new BoxGeometry(1, 1, 1)
const drawMesh = new InstancedMesh(drawGeometry, new MeshBasicMaterial({ color: 0x4488ff }), 40)
for (let i = 0; i < 40; i++) {
  drawMesh.setMatrixAt(
    i,
    new Matrix4().setPosition((i % 8) * 0.15 - 0.5, Math.floor(i / 8) * 0.15, 0),
  )
}
drawMesh.instanceMatrix.needsUpdate = true
drawMesh.updateMatrixWorld(true)
scene.add(drawMesh)

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
composer.setPixelRatio(1)
composer.setSize(320, 180)

const doctor = new Doctor({
  scene,
  camera,
  renderer,
  composer,
  hostRenderer: renderer,
  profile: 'game',
  measureFrames: 3,
  renderFrame: () => {
    composer.render()
  },
})

const instancedWorldRadius = readHostWorldRadius(boundsMesh) ?? 0
boundsMesh.computeBoundingSphere()
const computeBoundingSphereRadius = boundsMesh.boundingSphere?.radius ?? 0

const sampler = createGpuFrameSampler(renderer)
const first = await doctor.measure()
const geometryTrianglesBefore = collectHostSceneStats(scene, renderer, camera).insights.geometryTriangleCount ?? 0

renderer.setPixelRatio(2)
renderer.setSize(320, 180, false)
const mismatchReport = await doctor.diagnose()
const composerMismatchAfterDpr = mismatchReport.findings.some(
  (f) => f.id === 'renderer/composer-resolution-mismatch',
)

const drawnTrianglesBefore = first.triangles
drawMesh.visible = false
const chunk = new InstancedMesh(drawGeometry, new MeshBasicMaterial({ color: 0x88ff44 }), 4)
for (let i = 0; i < 4; i++) {
  chunk.setMatrixAt(i, new Matrix4().setPosition(i * 0.2, 0, 0))
}
chunk.instanceMatrix.needsUpdate = true
scene.add(chunk)
const after = await doctor.measure()
const geometryTrianglesAfter = collectHostSceneStats(scene, renderer, camera).insights.geometryTriangleCount ?? 0

window.__R2 = {
  webgl2,
  glHasCreateQuery,
  extPresent,
  extHasCreateQuery,
  samplerConstructed: extPresent ? sampler !== undefined : null,
  gpuFrameTimeMsPresent: Object.prototype.hasOwnProperty.call(after, 'gpuFrameTimeMs'),
  composerMismatchAfterDpr,
  instancedWorldRadius,
  computeBoundingSphereRadius,
  geometrySphereRadius,
  geometryTrianglesBefore,
  geometryTrianglesAfter,
  drawnTrianglesBefore,
  drawnTrianglesAfter: after.triangles,
}

document.title = 'threejs-doctor real-host e2e ready'
