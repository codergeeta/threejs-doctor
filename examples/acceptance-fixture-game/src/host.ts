import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  InstancedMesh,
  Light,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  BoxGeometry,
  TorusGeometry,
} from 'three'

export const DOCTOR_HOST_KEY = '__THREEJS_DOCTOR_HOST__' as const

export const GRID_SIZE = 12
export const PARTICLE_COUNT = 4096
export const SHADOW_CASTER_COUNT = 2
export const SPHERE_COUNT = 2
export const TORUS_COUNT = 6
export const UNIQUE_PROP_COUNT = 64
export const SPHERE_WIDTH_SEGMENTS = 64
export const SPHERE_HEIGHT_SEGMENTS = 64
export const TORUS_RADIAL_SEGMENTS = 12
export const TORUS_TUBULAR_SEGMENTS = 16

export interface DoctorHostHandles {
  scene: unknown
  camera: unknown
  renderer: unknown
}

export interface GameSceneStats {
  meshCount: number
  instancedMeshCount: number
  instanceSlotCount: number
  drawUnits: number
  triangleCount: number
  particleCount: number
  shadowCastingLightCount: number
}

export interface GameScene {
  scene: Scene
  camera: PerspectiveCamera
  stats: GameSceneStats
  particles: Points
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isDoctorHost(value: unknown): value is DoctorHostHandles {
  if (!isRecord(value)) return false
  return value.scene != null && value.camera != null && value.renderer != null
}

export function assignDoctorHost(
  target: Record<string, unknown>,
  handles: DoctorHostHandles,
): DoctorHostHandles {
  const host: DoctorHostHandles = {
    scene: handles.scene,
    camera: handles.camera,
    renderer: handles.renderer,
  }
  target[DOCTOR_HOST_KEY] = host
  target.scene = handles.scene
  target.camera = handles.camera
  target.renderer = handles.renderer
  return host
}

export function geometryTriangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex()
  if (index) return Math.floor(index.count / 3)
  const position = geometry.getAttribute('position')
  if (!position) return 0
  return Math.floor(position.count / 3)
}

/** One GPU submit per Mesh (including InstancedMesh) or Points. */
export function countSceneDrawUnits(scene: Scene): number {
  let n = 0
  scene.traverse((obj) => {
    if (obj instanceof Mesh || obj instanceof Points) n += 1
  })
  return n
}

export function countSceneTriangles(scene: Scene): number {
  let n = 0
  scene.traverse((obj) => {
    if (obj instanceof InstancedMesh) {
      n += geometryTriangleCount(obj.geometry) * obj.count
      return
    }
    if (obj instanceof Mesh) n += geometryTriangleCount(obj.geometry)
  })
  return n
}

export function countInstancedSlots(scene: Scene): number {
  let n = 0
  scene.traverse((obj) => {
    if (obj instanceof InstancedMesh) n += obj.count
  })
  return n
}

function collectStats(scene: Scene): GameSceneStats {
  let meshCount = 0
  let instancedMeshCount = 0
  let particleCount = 0
  let shadowCastingLightCount = 0
  scene.traverse((obj) => {
    if (obj instanceof InstancedMesh) instancedMeshCount += 1
    if (obj instanceof Mesh) meshCount += 1
    if (obj instanceof Points) {
      particleCount += obj.geometry.getAttribute('position')?.count ?? 0
    }
    if (obj instanceof Light && obj.castShadow) shadowCastingLightCount += 1
  })
  return {
    meshCount,
    instancedMeshCount,
    instanceSlotCount: countInstancedSlots(scene),
    drawUnits: countSceneDrawUnits(scene),
    triangleCount: countSceneTriangles(scene),
    particleCount,
    shadowCastingLightCount,
  }
}

function stampInstance(mesh: InstancedMesh, index: number, dummy: Object3D): void {
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}

export function createGameScene(): GameScene {
  const scene = new Scene()
  scene.background = new Color(0x0b1020)

  const camera = new PerspectiveCamera(55, 1, 0.1, 400)
  camera.position.set(18, 20, 24)
  camera.lookAt(0, 1, 0)

  const dummy = new Object3D()

  const ground = new Mesh(
    new PlaneGeometry(72, 72),
    new MeshStandardMaterial({ color: 0x1a2233, roughness: 0.95, metalness: 0.05 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  ground.matrixAutoUpdate = false
  ground.updateMatrix()
  scene.add(ground)

  const boxGeo = new BoxGeometry(0.55, 0.55, 0.55)
  const boxMat = new MeshStandardMaterial({ color: 0x4cc9f0, roughness: 0.4, metalness: 0.2 })
  const boxes = new InstancedMesh(boxGeo, boxMat, GRID_SIZE * GRID_SIZE)
  boxes.frustumCulled = false
  boxes.castShadow = true
  boxes.receiveShadow = true
  boxes.matrixAutoUpdate = false
  for (let z = 0; z < GRID_SIZE; z += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      dummy.position.set(x - (GRID_SIZE - 1) / 2, 0.28, z - (GRID_SIZE - 1) / 2)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      stampInstance(boxes, z * GRID_SIZE + x, dummy)
    }
  }
  boxes.instanceMatrix.needsUpdate = true
  boxes.updateMatrix()
  scene.add(boxes)

  const sphereGeo = new SphereGeometry(0.9, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS)
  const sphereMat = new MeshStandardMaterial({ roughness: 0.3, metalness: 0.25 })
  const spheres = new InstancedMesh(sphereGeo, sphereMat, SPHERE_COUNT)
  spheres.frustumCulled = false
  spheres.castShadow = true
  spheres.receiveShadow = true
  spheres.matrixAutoUpdate = false
  const sphereColors = [0xf72585, 0x7209b7, 0x4361ee, 0x4cc9f0, 0xffd166, 0x06d6a0, 0xef476f, 0x118ab2]
  for (let i = 0; i < SPHERE_COUNT; i += 1) {
    const angle = (i / SPHERE_COUNT) * Math.PI * 2
    dummy.position.set(Math.cos(angle) * 8, 2.2, Math.sin(angle) * 8)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    stampInstance(spheres, i, dummy)
    spheres.setColorAt(i, new Color(sphereColors[i] ?? 0xffffff))
  }
  spheres.instanceMatrix.needsUpdate = true
  if (spheres.instanceColor) spheres.instanceColor.needsUpdate = true
  spheres.updateMatrix()
  scene.add(spheres)

  const torusGeo = new TorusGeometry(0.7, 0.18, TORUS_RADIAL_SEGMENTS, TORUS_TUBULAR_SEGMENTS)
  const torusMat = new MeshStandardMaterial({ color: 0xffd166, roughness: 0.35, metalness: 0.4 })
  const toruses = new InstancedMesh(torusGeo, torusMat, TORUS_COUNT)
  toruses.frustumCulled = false
  toruses.castShadow = true
  toruses.receiveShadow = true
  toruses.matrixAutoUpdate = false
  for (let i = 0; i < TORUS_COUNT; i += 1) {
    const angle = (i / TORUS_COUNT) * Math.PI * 2
    dummy.position.set(Math.cos(angle) * 12, 1.4, Math.sin(angle) * 12)
    dummy.rotation.set(Math.PI / 2, 0, angle)
    dummy.scale.set(1, 1, 1)
    stampInstance(toruses, i, dummy)
  }
  toruses.instanceMatrix.needsUpdate = true
  toruses.updateMatrix()
  scene.add(toruses)

  const propGeo = new ConeGeometry(0.22, 1.15, 6)
  const propMatA = new MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.45, metalness: 0.2 })
  const propMatB = new MeshStandardMaterial({ color: 0xc77dff, roughness: 0.45, metalness: 0.2 })
  for (let i = 0; i < UNIQUE_PROP_COUNT; i += 1) {
    const beacon = new Mesh(propGeo, i % 2 === 0 ? propMatA : propMatB)
    const angle = (i / UNIQUE_PROP_COUNT) * Math.PI * 2
    beacon.position.set(Math.cos(angle) * 16, 0.58, Math.sin(angle) * 16)
    beacon.receiveShadow = true
    beacon.castShadow = false
    beacon.matrixAutoUpdate = false
    beacon.updateMatrix()
    scene.add(beacon)
  }

  const positions = new Float32Array(PARTICLE_COUNT * 3)
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 10
    positions[i * 3 + 1] = Math.random() * 12 + 0.5
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10
  }
  const particleGeo = new BufferGeometry()
  particleGeo.setAttribute('position', new BufferAttribute(positions, 3))
  const particles = new Points(
    particleGeo,
    new PointsMaterial({
      color: 0x80ffea,
      size: 0.08,
      transparent: false,
      depthWrite: false,
    }),
  )
  scene.add(particles)

  scene.add(new AmbientLight(0xffffff, 0.28))

  const fill = new DirectionalLight(0x9bb7ff, 0.35)
  fill.position.set(-8, 10, -6)
  scene.add(fill)

  const casterPositions: Array<[number, number, number]> = [
    [16, 20, 10],
    [-14, 16, 8],
  ]
  for (let i = 0; i < SHADOW_CASTER_COUNT; i += 1) {
    const light = new DirectionalLight(0xffffff, i === 0 ? 1.05 : 0.5)
    const pos = casterPositions[i] ?? [8, 14, 6]
    light.position.set(pos[0], pos[1], pos[2])
    light.castShadow = true
    light.shadow.mapSize.set(512, 512)
    light.shadow.camera.near = 0.5
    light.shadow.camera.far = 70
    light.shadow.camera.left = -24
    light.shadow.camera.right = 24
    light.shadow.camera.top = 24
    light.shadow.camera.bottom = -24
    scene.add(light)
  }

  return {
    scene,
    camera,
    particles,
    stats: collectStats(scene),
  }
}
