import { Points, Line, Sprite, BufferGeometry, PointsMaterial } from 'three'

const sparks = new Points(new BufferGeometry(), new PointsMaterial())
sparks.frustumCulled = false
const trail = new Line()
trail.frustumCulled = false
const glow = new Sprite()
glow.frustumCulled = false

function tick() {
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
