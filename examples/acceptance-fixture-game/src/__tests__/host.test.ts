import { describe, it, expect } from 'vitest'
import {
  BoxGeometry,
  InstancedMesh,
  Light,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  Scene,
} from 'three'
import {
  GRID_SIZE as LIGHT_GRID,
  createAcceptanceScene,
} from '@threejs-doctor/acceptance-fixture'
import {
  DOCTOR_HOST_KEY,
  GRID_SIZE,
  PARTICLE_COUNT,
  SHADOW_CASTER_COUNT,
  assignDoctorHost,
  countInstancedSlots,
  countSceneDrawUnits,
  countSceneTriangles,
  createGameScene,
  geometryTriangleCount,
  isDoctorHost,
} from '../index.js'

describe('acceptance-fixture-game host contract', () => {
  it('exports the live-attach host key', () => {
    expect(DOCTOR_HOST_KEY).toBe('__THREEJS_DOCTOR_HOST__')
  })

  it('assigns a host object with scene, camera, and renderer', () => {
    const scene = { isScene: true, children: [], traverse() {} }
    const camera = { isCamera: true }
    const renderer = {
      isWebGLRenderer: true,
      setPixelRatio() {},
      info: { render: {}, memory: {} },
    }
    const target: Record<string, unknown> = {}
    const host = assignDoctorHost(target, { scene, camera, renderer })

    expect(isDoctorHost(host)).toBe(true)
    expect(host.scene).toBe(scene)
    expect(host.camera).toBe(camera)
    expect(host.renderer).toBe(renderer)
    expect(target[DOCTOR_HOST_KEY]).toBe(host)
    expect(target.scene).toBe(scene)
    expect(target.camera).toBe(camera)
    expect(target.renderer).toBe(renderer)
    expect(host).not.toHaveProperty('avgFps')
    expect(target[DOCTOR_HOST_KEY]).not.toHaveProperty('avgFps')
  })

  it('rejects incomplete host shapes', () => {
    expect(isDoctorHost({ scene: {}, camera: {} })).toBe(false)
    expect(isDoctorHost(null)).toBe(false)
    expect(isDoctorHost({ scene: {}, camera: {}, renderer: {} })).toBe(true)
  })

  it('counts InstancedMesh as one draw unit and multiplies triangles by instance count', () => {
    const scene = new Scene()
    const box = new BoxGeometry(1, 1, 1)
    const instanced = new InstancedMesh(box, new MeshBasicMaterial(), 10)
    scene.add(instanced)
    scene.add(new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial()))

    expect(countSceneDrawUnits(scene)).toBe(2)
    expect(countInstancedSlots(scene)).toBe(10)
    expect(countSceneTriangles(scene)).toBe(geometryTriangleCount(box) * 10 + 2)
  })

  it('instances the dense field so draw units stay above the light fixture without 158 uninstanced calls', () => {
    expect(GRID_SIZE).toBeGreaterThan(LIGHT_GRID)
    expect(PARTICLE_COUNT).toBeGreaterThanOrEqual(2048)
    expect(SHADOW_CASTER_COUNT).toBeLessThan(4)
    expect(SHADOW_CASTER_COUNT).toBeGreaterThanOrEqual(1)

    const light = createAcceptanceScene()
    const { scene, camera, stats } = createGameScene()
    expect((scene as { isScene?: boolean }).isScene).toBe(true)
    expect((camera as { isCamera?: boolean }).isCamera).toBe(true)

    const lightDrawUnits = countSceneDrawUnits(light.scene)
    const lightTriangles = countSceneTriangles(light.scene)

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

    expect(instancedMeshCount).toBeGreaterThanOrEqual(1)
    expect(countInstancedSlots(scene)).toBeGreaterThanOrEqual(GRID_SIZE * GRID_SIZE)
    expect(countSceneDrawUnits(scene)).toBeGreaterThan(lightDrawUnits)
    expect(countSceneDrawUnits(scene)).toBeLessThan(120)
    expect(countSceneTriangles(scene)).toBeGreaterThan(lightTriangles)
    expect(particleCount).toBe(PARTICLE_COUNT)
    expect(particleCount).toBeGreaterThanOrEqual(2048)
    expect(shadowCastingLightCount).toBe(SHADOW_CASTER_COUNT)
    expect(stats.meshCount).toBe(meshCount)
    expect(stats.instancedMeshCount).toBe(instancedMeshCount)
    expect(stats.instanceSlotCount).toBe(countInstancedSlots(scene))
    expect(stats.drawUnits).toBe(countSceneDrawUnits(scene))
    expect(stats.triangleCount).toBe(countSceneTriangles(scene))
    expect(stats.particleCount).toBe(particleCount)
    expect(stats.shadowCastingLightCount).toBe(shadowCastingLightCount)
    expect(stats).not.toHaveProperty('avgFps')
    expect(stats).not.toHaveProperty('ttfiMs')
  })
})
