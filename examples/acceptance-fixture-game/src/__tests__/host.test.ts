import { describe, it, expect } from 'vitest'
import { Light, Mesh, Points } from 'three'
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
  createGameScene,
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

  it('is heavier than the unpublished acceptance-fixture (meshes, particles, shadow casters)', () => {
    expect(GRID_SIZE).toBeGreaterThan(LIGHT_GRID)
    expect(PARTICLE_COUNT).toBeGreaterThanOrEqual(2048)
    expect(SHADOW_CASTER_COUNT).toBeGreaterThanOrEqual(4)

    const light = createAcceptanceScene()
    const { scene, camera, stats } = createGameScene()
    expect((scene as { isScene?: boolean }).isScene).toBe(true)
    expect((camera as { isCamera?: boolean }).isCamera).toBe(true)

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

    expect(meshCount).toBeGreaterThan(light.stats.meshCount)
    expect(shadowCastingLightCount).toBeGreaterThan(light.stats.shadowCastingLightCount)
    expect(particleCount).toBe(PARTICLE_COUNT)
    expect(stats.meshCount).toBe(meshCount)
    expect(stats.particleCount).toBe(particleCount)
    expect(stats.shadowCastingLightCount).toBe(shadowCastingLightCount)
    expect(stats).not.toHaveProperty('avgFps')
    expect(stats).not.toHaveProperty('ttfiMs')
  })
})
