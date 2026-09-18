import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Light,
  Mesh,
  MeshStandardMaterial,
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
export const SHADOW_CASTER_COUNT = 4
export const SPHERE_COUNT = 4
export const TORUS_COUNT = 8
export const SPHERE_WIDTH_SEGMENTS = 64
export const SPHERE_HEIGHT_SEGMENTS = 64

export interface DoctorHostHandles {
  scene: unknown
  camera: unknown
  renderer: unknown
}

export interface GameSceneStats {
  meshCount: number
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

function collectStats(scene: Scene): GameSceneStats {
  let meshCount = 0
  let particleCount = 0
  let shadowCastingLightCount = 0
  scene.traverse((obj) => {
    if (obj instanceof Mesh) meshCount += 1
    if (obj instanceof Points) {
      particleCount += obj.geometry.getAttribute('position')?.count ?? 0
    }
    if (obj instanceof Light && obj.castShadow) shadowCastingLightCount += 1
  })
  return { meshCount, particleCount, shadowCastingLightCount }
}

export function createGameScene(): GameScene {
  const scene = new Scene()
  scene.background = new Color(0x0b1020)

  const camera = new PerspectiveCamera(55, 1, 0.1, 400)
  camera.position.set(16, 18, 22)
  camera.lookAt(0, 1, 0)

  const ground = new Mesh(
    new PlaneGeometry(64, 64),
    new MeshStandardMaterial({ color: 0x1a2233, roughness: 0.95, metalness: 0.05 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const boxGeo = new BoxGeometry(0.55, 0.55, 0.55)
  const boxMat = new MeshStandardMaterial({ color: 0x4cc9f0, roughness: 0.4, metalness: 0.2 })
  for (let z = 0; z < GRID_SIZE; z += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const mesh = new Mesh(boxGeo, boxMat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.position.set(x - (GRID_SIZE - 1) / 2, 0.28, z - (GRID_SIZE - 1) / 2)
      scene.add(mesh)
    }
  }

  const sphereGeo = new SphereGeometry(0.9, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS)
  const sphereColors = [0xf72585, 0x7209b7, 0x4361ee, 0x4cc9f0]
  for (let i = 0; i < SPHERE_COUNT; i += 1) {
    const sphere = new Mesh(
      sphereGeo,
      new MeshStandardMaterial({
        color: sphereColors[i] ?? 0xffffff,
        roughness: 0.3,
        metalness: 0.25,
      }),
    )
    const angle = (i / SPHERE_COUNT) * Math.PI * 2
    sphere.position.set(Math.cos(angle) * 6, 2.2, Math.sin(angle) * 6)
    sphere.castShadow = true
    sphere.receiveShadow = true
    scene.add(sphere)
  }

  const torusGeo = new TorusGeometry(0.7, 0.18, 24, 48)
  const torusMat = new MeshStandardMaterial({ color: 0xffd166, roughness: 0.35, metalness: 0.4 })
  for (let i = 0; i < TORUS_COUNT; i += 1) {
    const torus = new Mesh(torusGeo, torusMat)
    const angle = (i / TORUS_COUNT) * Math.PI * 2
    torus.position.set(Math.cos(angle) * 10, 1.4, Math.sin(angle) * 10)
    torus.rotation.x = Math.PI / 2
    torus.castShadow = true
    torus.receiveShadow = true
    scene.add(torus)
  }

  const positions = new Float32Array(PARTICLE_COUNT * 3)
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 8
    positions[i * 3 + 1] = Math.random() * 10 + 0.5
    positions[i * 3 + 2] = (Math.random() - 0.5) * 8
  }
  const particleGeo = new BufferGeometry()
  particleGeo.setAttribute('position', new BufferAttribute(positions, 3))
  const particles = new Points(
    particleGeo,
    new PointsMaterial({
      color: 0x80ffea,
      size: 0.08,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
  )
  scene.add(particles)

  scene.add(new AmbientLight(0xffffff, 0.22))

  const casterPositions: Array<[number, number, number]> = [
    [14, 18, 8],
    [-12, 16, 10],
    [8, 14, -14],
    [-10, 12, -8],
  ]
  for (let i = 0; i < SHADOW_CASTER_COUNT; i += 1) {
    const light = new DirectionalLight(0xffffff, i === 0 ? 1.05 : 0.45)
    const pos = casterPositions[i] ?? [8, 14, 6]
    light.position.set(pos[0], pos[1], pos[2])
    light.castShadow = true
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.camera.near = 0.5
    light.shadow.camera.far = 60
    light.shadow.camera.left = -20
    light.shadow.camera.right = 20
    light.shadow.camera.top = 20
    light.shadow.camera.bottom = -20
    scene.add(light)
  }

  return {
    scene,
    camera,
    particles,
    stats: collectStats(scene),
  }
}
