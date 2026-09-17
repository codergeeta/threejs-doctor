import { Doctor, type DoctorReport, type DoctorRendererLike, type DoctorSceneLike } from '@threejs-doctor/runtime'
import type { DeviceCapabilities, Profile, SceneStatsLike } from '@threejs-doctor/core'
import { createMarketingFixture } from './fixtures/marketing.js'
import { createProductFixture } from './fixtures/product.js'
import { createGameFixture } from './fixtures/game.js'
import { createCadFixture } from './fixtures/cad.js'
import { getLowEndBudget } from './budgets.js'

export interface FixtureCreateResult {
  profile: Exclude<Profile, 'auto'>
  scene: DoctorSceneLike
  renderer: DoctorRendererLike
  camera: unknown
  device: DeviceCapabilities
  getSceneStats: () => SceneStatsLike
}

/** Headless mock scenes: no WebGL/GPU. CI and unit tests run these without a renderer. */
export const fixtures: Record<
  Exclude<Profile, 'auto'>,
  { profile: Exclude<Profile, 'auto'>; create: () => FixtureCreateResult }
> = {
  marketing: { profile: 'marketing', create: createMarketingFixture },
  product: { profile: 'product', create: createProductFixture },
  game: { profile: 'game', create: createGameFixture },
  cad: { profile: 'cad', create: createCadFixture },
}

export async function runBenchSuite(opts: {
  profile: Exclude<Profile, 'auto'>
  budget: 'low' | 'mid' | 'high'
}): Promise<DoctorReport> {
  const entry = fixtures[opts.profile]
  if (!entry) {
    throw new Error(`No bench fixture for profile: ${opts.profile}`)
  }
  const fixture = entry.create()
  let t = 0
  const doctor = new Doctor({
    scene: fixture.scene,
    camera: fixture.camera,
    renderer: fixture.renderer,
    profile: opts.profile,
    mode: 'benchmark',
    measureFrames: 8,
    device: fixture.device,
    getSceneStats: fixture.getSceneStats,
    now: () => {
      t += 16
      return t
    },
  })
  await doctor.measure()
  const report = await doctor.optimize({ apply: ['safe'] })
  // v1 only defines low-end budgets; mid/high still exercise the same mock loop.
  void getLowEndBudget(opts.profile)
  return { ...report, mode: 'benchmark' }
}

export async function runAllBenchSuites(): Promise<
  Record<Exclude<Profile, 'auto'>, DoctorReport>
> {
  const profiles = ['marketing', 'product', 'game', 'cad'] as const
  const out = {} as Record<Exclude<Profile, 'auto'>, DoctorReport>
  for (const profile of profiles) {
    out[profile] = await runBenchSuite({ profile, budget: 'low' })
  }
  return out
}
