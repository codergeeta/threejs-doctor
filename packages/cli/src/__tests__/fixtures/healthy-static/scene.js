import { AmbientLight, DirectionalLight, Mesh, MeshStandardMaterial, WebGLRenderer } from 'three'

const renderer = new WebGLRenderer({ antialias: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

new AmbientLight(0x404040, 0.4)
const sun = new DirectionalLight(0xffffff, 1)
sun.castShadow = false

const mesh = new Mesh(undefined, new MeshStandardMaterial())
mesh.matrixAutoUpdate = false
mesh.frustumCulled = true

renderer.render()
