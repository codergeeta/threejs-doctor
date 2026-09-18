import { describe, it, expect } from 'vitest'
import { Light, Mesh, SphereGeometry } from 'three'
import {
  DOCTOR_HOST_KEY,
  assignDoctorHost,
  createAcceptanceScene,
  isDoctorHost,
} from '../index.js'

describe('acceptance fixture host contract', () => {
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

  it('builds a non-trivial scene (meshes, high-segment sphere, shadows)', () => {
    const { scene, camera, stats } = createAcceptanceScene()
    expect((scene as { isScene?: boolean }).isScene).toBe(true)
    expect((camera as { isCamera?: boolean }).isCamera).toBe(true)

    let meshCount = 0
    let sphereWidthSegments = 0
    let sphereHeightSegments = 0
    let shadowCastingLightCount = 0
    scene.traverse((obj) => {
      if (obj instanceof Mesh) {
        meshCount += 1
        if (obj.geometry instanceof SphereGeometry) {
          sphereWidthSegments = Math.max(sphereWidthSegments, obj.geometry.parameters.widthSegments)
          sphereHeightSegments = Math.max(
            sphereHeightSegments,
            obj.geometry.parameters.heightSegments,
          )
        }
      }
      if (obj instanceof Light && obj.castShadow) shadowCastingLightCount += 1
    })

    expect(meshCount).toBeGreaterThanOrEqual(24)
    expect(sphereWidthSegments).toBeGreaterThanOrEqual(64)
    expect(sphereHeightSegments).toBeGreaterThanOrEqual(64)
    expect(shadowCastingLightCount).toBeGreaterThanOrEqual(1)
    expect(stats.meshCount).toBe(meshCount)
    expect(stats.sphereWidthSegments).toBe(sphereWidthSegments)
    expect(stats.sphereHeightSegments).toBe(sphereHeightSegments)
    expect(stats.shadowCastingLightCount).toBe(shadowCastingLightCount)
    expect(stats).not.toHaveProperty('avgFps')
    expect(stats).not.toHaveProperty('ttfiMs')
  })
})
