import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  RectAreaLight,
  SpotLight,
  WebGLRenderer,
} from 'three'

const renderer = new WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)

const sun = new DirectionalLight(0xffffff, 1)
sun.castShadow = true
const fill = new PointLight(0xffffff, 1)
fill.castShadow = true
const spot = new SpotLight(0xffffff, 1)
spot.castShadow = true
const extra = new DirectionalLight(0xffffff, 0.4)
extra.castShadow = true
new AmbientLight(0x404040)
new HemisphereLight(0xffffff, 0x444444, 0.6)
new RectAreaLight(0xffffff, 1, 4, 4)

const mesh = new Mesh(undefined, new MeshStandardMaterial())
mesh.frustumCulled = false
new Mesh(undefined, new MeshStandardMaterial())
new Mesh(undefined, new MeshStandardMaterial())

function tick() {
  renderer.render()
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
