import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { DoctorProvider, useDoctor } from '../useDoctor.js'
import { Doctor, type DoctorReport } from '@threejs-doctor/runtime'

function createDoctor() {
  const renderer = {
    info: { render: { calls: 10, triangles: 1000 }, memory: { geometries: 2, textures: 1 } },
    pixelRatio: 2,
    setPixelRatio(v: number) { this.pixelRatio = v },
  }
  const scene = { children: [], traverse() {} }
  let t = 0
  return new Doctor({
    scene: scene as never,
    camera: {},
    renderer: renderer as never,
    profile: 'product',
    measureFrames: 3,
    now: () => { t += 16; return t },
    getSceneStats: () => ({
      textureCount: 1, estimatedVramBytes: 1000, geometryCount: 2,
      lightCount: 0, shadowCastingLightCount: 0,
    }),
  })
}

describe('useDoctor', () => {
  it('exposes diagnose via context', async () => {
    const doctor = createDoctor()
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DoctorProvider doctor={doctor}>{children}</DoctorProvider>
    )
    const { result } = renderHook(() => useDoctor(), { wrapper })
    let report: DoctorReport | undefined
    await act(async () => {
      report = await result.current.runDiagnose()
    })
    expect(report?.score).toBeGreaterThanOrEqual(0)
  })
})
