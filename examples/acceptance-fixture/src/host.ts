import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  BoxGeometry,
} from 'three'

export const DOCTOR_HOST_KEY = '__THREEJS_DOCTOR_HOST__' as const

export const GRID_SIZE = 8
export const SPHERE_WIDTH_SEGMENTS = 96
export const SPHERE_HEIGHT_SEGMENTS = 96

export interface DoctorHostHandles {
  scene: unknown
  camera: unknown
  renderer: unknown
}

export interface AcceptanceSceneStats {
  meshCount: number
  sphereWidthSegments: number
  sphereHeightSegments: number
  shadowCastingLightCount: number
}

export interface AcceptanceScene {
  scene: Scene
  camera: PerspectiveCamera
  stats: AcceptanceSceneStats
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

export function createAcceptanceScene(): AcceptanceScene {
  const scene = new Scene()
  const camera = new PerspectiveCamera(50, 1, 0.1, 200)
  camera.position.set(10, 12, 16)
  camera.lookAt(0, 0, 0)

  const ground = new Mesh(
    new PlaneGeometry(40, 40),
    new MeshStandardMaterial({ color: 0x2a3038, roughness: 0.9, metalness: 0.05 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const boxGeo = new BoxGeometry(0.7, 0.7, 0.7)
  const boxMat = new MeshStandardMaterial({ color: 0x6ea8fe, roughness: 0.45, metalness: 0.15 })
  for (let z = 0; z < GRID_SIZE; z += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const mesh = new Mesh(boxGeo, boxMat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.position.set(x - (GRID_SIZE - 1) / 2, 0.35, z - (GRID_SIZE - 1) / 2)
      scene.add(mesh)
    }
  }

  const sphere = new Mesh(
    new SphereGeometry(1.6, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS),
    new MeshStandardMaterial({ color: 0xf0c36a, roughness: 0.35, metalness: 0.2 }),
  )
  sphere.position.set(0, 2.2, 0)
  sphere.castShadow = true
  sphere.receiveShadow = true
  scene.add(sphere)

  scene.add(new AmbientLight(0xffffff, 0.35))

  const key = new DirectionalLight(0xffffff, 1.15)
  key.position.set(8, 14, 6)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 40
  key.shadow.camera.left = -12
  key.shadow.camera.right = 12
  key.shadow.camera.top = 12
  key.shadow.camera.bottom = -12
  scene.add(key)

  const fill = new DirectionalLight(0x9bb7ff, 0.35)
  fill.position.set(-6, 8, -4)
  fill.castShadow = true
  scene.add(fill)

  const meshCount = 1 + GRID_SIZE * GRID_SIZE + 1
  return {
    scene,
    camera,
    stats: {
      meshCount,
      sphereWidthSegments: SPHERE_WIDTH_SEGMENTS,
      sphereHeightSegments: SPHERE_HEIGHT_SEGMENTS,
      shadowCastingLightCount: 2,
    },
  }
}
