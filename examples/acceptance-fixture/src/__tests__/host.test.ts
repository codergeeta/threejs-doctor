import { describe, it, expect } from 'vitest'
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
    expect(stats.meshCount).toBeGreaterThanOrEqual(24)
    expect(stats.sphereWidthSegments).toBeGreaterThanOrEqual(64)
    expect(stats.sphereHeightSegments).toBeGreaterThanOrEqual(64)
    expect(stats.shadowCastingLightCount).toBeGreaterThanOrEqual(1)
    expect(stats).not.toHaveProperty('avgFps')
    expect(stats).not.toHaveProperty('ttfiMs')
  })
})
