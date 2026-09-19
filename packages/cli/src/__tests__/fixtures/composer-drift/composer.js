import { WebGLRenderer } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'

const renderer = new WebGLRenderer()
const composer = new EffectComposer(renderer)
renderer.setPixelRatio(window.devicePixelRatio)

function tick() {
  composer.render()
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
