import type { Profile, SceneSnapshot } from '@threejs-doctor/core'

export type ConcreteProfile = Exclude<Profile, 'auto'>

export interface ProfileBudgets {
  maxDrawCalls: number
  maxShadowCasters: number
  maxDpr: number
  maxLights: number
  maxEstimatedVramBytes: number
}

export const PROFILE_BUDGETS: Record<ConcreteProfile, ProfileBudgets> = {
  marketing: { maxDrawCalls: 80, maxShadowCasters: 1, maxDpr: 1.5, maxLights: 3, maxEstimatedVramBytes: 64_000_000 },
  product: { maxDrawCalls: 100, maxShadowCasters: 2, maxDpr: 2, maxLights: 4, maxEstimatedVramBytes: 128_000_000 },
  game: { maxDrawCalls: 150, maxShadowCasters: 3, maxDpr: 2, maxLights: 6, maxEstimatedVramBytes: 256_000_000 },
  cad: { maxDrawCalls: 120, maxShadowCasters: 2, maxDpr: 2, maxLights: 4, maxEstimatedVramBytes: 256_000_000 },
}

/**
 * Auto classification for interactive games vs CAD/marketing.
 * Continuous RAF or high draw activity prefers `game` so meshCount crossing 200
 * (instancing/chunking) does not flip a running game to CAD.
 * Games should still set `profile: 'game'` explicitly when known.
 */
export function resolveProfile(profile: Profile, snapshot: SceneSnapshot): ConcreteProfile {
  if (profile !== 'auto') return profile

  const continuous = snapshot.continuousFrameloop
  const highDraw = snapshot.drawCalls >= 80
  const substantialMesh = snapshot.meshCount >= 50

  if (continuous && (substantialMesh || snapshot.drawCalls >= 30)) return 'game'
  if (highDraw && snapshot.meshCount >= 30) return 'game'
  if (snapshot.lightCount >= 4 && snapshot.meshCount > 50) return 'game'

  if (
    !continuous &&
    snapshot.lightCount < 4 &&
    snapshot.meshCount > 200 &&
    !highDraw
  ) {
    return 'cad'
  }
  if (
    !continuous &&
    snapshot.lightCount < 3 &&
    snapshot.drawCalls > 150 &&
    snapshot.meshCount <= 50
  ) {
    return 'cad'
  }

  if (snapshot.textureCount <= 6 && snapshot.meshCount <= 20 && snapshot.drawCalls <= 40) {
    return 'product'
  }
  return 'marketing'
}
