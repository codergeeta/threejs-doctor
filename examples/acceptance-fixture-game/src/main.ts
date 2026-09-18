import { WebGLRenderer } from 'three'
import { assignDoctorHost, createGameScene } from './host.js'

const canvas = document.querySelector('#c')
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('acceptance-fixture-game: missing canvas#c')
}

const { scene, camera, particles } = createGameScene()
const renderer = new WebGLRenderer({ canvas, antialias: true })
renderer.shadowMap.enabled = true
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

assignDoctorHost(window as unknown as Record<string, unknown>, { scene, camera, renderer })

function resize(): void {
  const width = Math.max(1, window.innerWidth)
  const height = Math.max(1, window.innerHeight)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
}

window.addEventListener('resize', resize)
resize()

function tick(): void {
  scene.rotation.y += 0.0015
  particles.rotation.y -= 0.004
  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}

requestAnimationFrame(tick)
