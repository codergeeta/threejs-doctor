import { describe, it, expect } from 'vitest'
import { QualityController } from '../quality-controller.js'
import { Doctor } from '../doctor.js'
import { createLadderDoctor } from './ladder-harness.js'
import { SAFE_PASSES, type RendererInfoLike } from '@threejs-doctor/core'

describe('safe-auto must not demand-loop games', () => {
  it('omits frameloop-demand from default SAFE_PASSES', () => {
    expect(SAFE_PASSES).not.toContain('frameloop-demand')
  })

  it('safe-auto boot and runLadder do not apply frameloop-demand for profile game', async () => {
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, {
      mode: 'safe-auto',
      windowFrames: 3,
      waitForFirstInteractive: async () => {},
    })
    const boot = await ladder.boot()
    expect(boot.profile).toBe('game')
    expect(boot.appliedPasses.length).toBeGreaterThan(0)
    expect(boot.appliedPasses).not.toContain('frameloop-demand')

    const settled = await ladder.runLadder()
    expect(settled.appliedPasses).not.toContain('frameloop-demand')
  })

  it('safe-auto runLadder does not apply frameloop-demand on a continuous RAF game harness', async () => {
    let hostFrames = 0
    const { doctor } = createLadderDoctor({
      waitFrame: async () => {
        hostFrames += 1
      },
    })
    const ladder = new QualityController(doctor, {
      mode: 'safe-auto',
      windowFrames: 3,
      waitForFirstInteractive: async () => {},
    })
    const settled = await ladder.runLadder()
    expect(settled.profile).toBe('game')
    expect(hostFrames).toBeGreaterThan(0)
    expect(settled.appliedPasses).not.toContain('frameloop-demand')
  })

  it('Doctor.optimize safe does not apply frameloop-demand for profile game', async () => {
    const { doctor } = createLadderDoctor()
    const report = await doctor.optimize({ apply: ['safe'] })
    expect(report.profile).toBe('game')
    expect(report.appliedPasses).not.toContain('frameloop-demand')
    expect(report.appliedPasses).toContain('dpr-cap')
  })

  it('Doctor.optimize safe still applies frameloop-demand for marketing/static', async () => {
    const info: RendererInfoLike = {
      render: { calls: 20, triangles: 1000 },
      memory: { geometries: 4, textures: 2 },
    }
    const renderer = {
      info,
      pixelRatio: 2,
      setPixelRatio(v: number) {
        this.pixelRatio = v
      },
    }
    let t = 0
    let frameloop: 'always' | 'demand' = 'always'
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'marketing',
      mode: 'optimize',
      measureFrames: 2,
      now: () => {
        t += 16
        return t
      },
      setFrameloop(mode) {
        frameloop = mode
      },
      getSceneStats: () => ({
        textureCount: 2,
        estimatedVramBytes: 1_000_000,
        geometryCount: 4,
        lightCount: 0,
        shadowCastingLightCount: 0,
      }),
    })
    const report = await doctor.optimize({ apply: ['safe'] })
    expect(report.appliedPasses).toContain('frameloop-demand')
    expect(frameloop).toBe('demand')
  })
})
