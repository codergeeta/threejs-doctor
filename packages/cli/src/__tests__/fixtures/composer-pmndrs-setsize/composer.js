import { WebGLRenderer } from 'three'
import { EffectComposer } from 'postprocessing'

const renderer = new WebGLRenderer()
const composer = new EffectComposer(renderer)
renderer.setPixelRatio(window.devicePixelRatio)
composer.setSize(320, 180)

function tick() {
  composer.render()
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
