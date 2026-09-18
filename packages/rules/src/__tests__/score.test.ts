import { describe, it, expect } from 'vitest'
import { computeDoctorScore } from '../score.js'
import type { Finding } from '../types.js'
import type { SceneSnapshot } from '@threejs-doctor/core'

const healthy: SceneSnapshot = {
  objectCount: 10, meshCount: 5, geometryCount: 5, materialCount: 3,
  textureCount: 2, estimatedVramBytes: 2_000_000, lightCount: 1,
  shadowCastingLightCount: 0, drawCalls: 20, triangles: 5000,
  maxTextureDimension: 512, continuousFrameloop: false,
  matrixAutoUpdateCount: 0, rendererPixelRatio: 1, antialias: false,
}

describe('computeDoctorScore', () => {
  it('returns 100 with no findings on a healthy snapshot', () => {
    expect(computeDoctorScore([], healthy, 'product')).toBe(100)
  })

  it('penalizes errors more than warns', () => {
    const findings: Finding[] = [
      {
        id: 'draw-calls/too-many',
        severity: 'error',
        evidence: { drawCalls: 300 },
        message: 'Too many draw calls',
        suggestedFix: 'Merge or instance meshes',
      },
      {
        id: 'renderer/uncapped-dpr',
        severity: 'warn',
        evidence: { rendererPixelRatio: 3 },
        message: 'DPR uncapped',
        suggestedFix: 'Cap DPR',
        autoFix: 'dpr-cap',
      },
    ]
    const score = computeDoctorScore(findings, healthy, 'product')
    expect(score).toBeLessThan(80)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBe(74)
  })

  it('penalizes over-budget draw calls without findings', () => {
    expect(computeDoctorScore([], { ...healthy, drawCalls: 200 }, 'product')).toBe(90)
    expect(computeDoctorScore([], { ...healthy, drawCalls: 400 }, 'product')).toBe(85)
  })

  it('penalizes over-budget VRAM without findings', () => {
    expect(
      computeDoctorScore([], { ...healthy, estimatedVramBytes: 129_000_000 }, 'product'),
    ).toBe(90)
  })

  it('penalizes over-budget scene triangles so a material drop improves score', () => {
    const heavy = computeDoctorScore([], { ...healthy, geometryTriangleCount: 400_000, triangles: 400_000 }, 'game')
    const light = computeDoctorScore([], { ...healthy, geometryTriangleCount: 84_000, triangles: 84_000 }, 'game')
    expect(heavy).toBeLessThan(100)
    expect(light).toBeGreaterThan(heavy)
  })

  it('boosts score when measured GPU time drops and both values were actually sampled', () => {
    const before = { ...healthy, geometryTriangleCount: 100_000, gpuFrameTimeMs: 12 }
    const after = { ...healthy, geometryTriangleCount: 21_000, gpuFrameTimeMs: 10.5 }
    const sameFindings: Finding[] = [
      {
        id: 'draw-calls/too-many',
        severity: 'warn',
        evidence: { drawCalls: 180 },
        message: 'too many',
        suggestedFix: 'instance',
      },
    ]
    const beforeScore = computeDoctorScore(sameFindings, before, 'game')
    const afterScore = computeDoctorScore(sameFindings, after, 'game', before)
    expect(afterScore).toBeGreaterThan(beforeScore)
  })

  it('boosts score when drawn triangles drop even if leftover geometryTriangleCount stays high', () => {
    const before = { ...healthy, geometryTriangleCount: 880_000, triangles: 880_000 }
    const after = { ...healthy, geometryTriangleCount: 880_000, triangles: 211_000 }
    expect(computeDoctorScore([], after, 'game', before)).toBeGreaterThan(
      computeDoctorScore([], before, 'game'),
    )
  })

  it('does not invent a GPU bonus when gpuFrameTimeMs is omitted', () => {
    const before = { ...healthy, geometryTriangleCount: 100_000 }
    const after = { ...healthy, geometryTriangleCount: 100_000 }
    expect(computeDoctorScore([], after, 'game', before)).toBe(100)
  })
})
