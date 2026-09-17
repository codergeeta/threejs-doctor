import { describe, it, expect } from 'vitest'
import { MetricsCollector } from '../metrics-collector.js'
import {
  createHysteresisState,
  evaluateWindow,
  HYSTERESIS,
  TIER_ORDER,
} from '../hysteresis.js'

function p95FromFakeClock(frameMs: number, frames = HYSTERESIS.windowFrames): number {
  const collector = new MetricsCollector({
    getRendererInfo: () => ({
      render: { calls: 0, triangles: 0 },
      memory: { geometries: 0, textures: 0 },
    }),
    getSceneStats: () => ({
      textureCount: 0,
      estimatedVramBytes: 0,
      geometryCount: 0,
      lightCount: 0,
      shadowCastingLightCount: 0,
    }),
  })
  let t = 0
  for (let i = 0; i < frames; i++) {
    const start = t
    t += frameMs
    collector.beginFrame(start)
    collector.endFrame(t)
  }
  return collector.sample().p95FrameTimeMs
}

function runWindows(
  start: ReturnType<typeof createHysteresisState>,
  frameMsList: number[],
  applyFailedAt?: number,
) {
  let state = start
  const actions: string[] = []
  for (let i = 0; i < frameMsList.length; i++) {
    const p95 = p95FromFakeClock(frameMsList[i]!)
    const decision = evaluateWindow(
      state,
      p95,
      applyFailedAt === i ? { applyFailed: true } : {},
    )
    actions.push(decision.action)
    state = decision.next
  }
  return { state, actions }
}

describe('hysteresis state machine', () => {
  it('exports four named tiers in order', () => {
    expect(TIER_ORDER).toEqual(['potato', 'low', 'mid', 'high'])
  })

  it('drops one tier after 2 consecutive windows with p95 > 33.4ms', () => {
    const { state, actions } = runWindows(
      createHysteresisState({ tier: 'mid', maxTier: 'high', phase: 'runtime' }),
      [40, 40],
    )
    expect(p95FromFakeClock(40)).toBeGreaterThan(33.4)
    expect(actions).toEqual(['hold', 'drop'])
    expect(state.tier).toBe('low')
    expect(state.cooldownRemaining).toBe(HYSTERESIS.cooldownWindows)
    expect(state.consecutiveSlow).toBe(0)
  })

  it('emergency-drops one tier on a single window with p95 >= 50ms', () => {
    const { state, actions } = runWindows(
      createHysteresisState({ tier: 'low', maxTier: 'mid', phase: 'runtime' }),
      [50],
    )
    expect(actions).toEqual(['drop'])
    expect(state.tier).toBe('potato')
  })

  it('climbs one tier after 3 consecutive fast windows (p95 <= 22ms) in runtime', () => {
    const { state, actions } = runWindows(
      createHysteresisState({ tier: 'potato', maxTier: 'mid', phase: 'runtime' }),
      [16, 16, 16],
    )
    expect(p95FromFakeClock(16)).toBeLessThanOrEqual(22)
    expect(actions).toEqual(['hold', 'hold', 'climb'])
    expect(state.tier).toBe('low')
  })

  it('does not climb during boot even after 3 fast windows', () => {
    const { state, actions } = runWindows(
      createHysteresisState({ tier: 'potato', maxTier: 'mid', phase: 'boot' }),
      [16, 16, 16],
    )
    expect(actions.every((a) => a === 'hold')).toBe(true)
    expect(state.tier).toBe('potato')
  })

  it('allows drops during boot', () => {
    const { state, actions } = runWindows(
      createHysteresisState({ tier: 'low', maxTier: 'mid', phase: 'boot' }),
      [50],
    )
    expect(actions).toEqual(['drop'])
    expect(state.tier).toBe('potato')
  })

  it('blocks climb for 2 cooldown windows after a drop', () => {
    const start = createHysteresisState({ tier: 'mid', maxTier: 'high', phase: 'runtime' })
    const afterDrop = runWindows(start, [50])
    expect(afterDrop.state.tier).toBe('low')
    const afterCooldown = runWindows(afterDrop.state, [16, 16, 16, 16, 16])
    // 2 cooldown holds, then 3 fast windows needed to climb → climb on the 5th fast window
    expect(afterCooldown.actions).toEqual(['hold', 'hold', 'hold', 'hold', 'climb'])
    expect(afterCooldown.state.tier).toBe('mid')
  })

  it('never drops below potato (floor hold)', () => {
    const { state, actions } = runWindows(
      createHysteresisState({ tier: 'potato', maxTier: 'mid', phase: 'runtime' }),
      [50, 50],
    )
    expect(actions.every((a) => a === 'hold')).toBe(true)
    expect(state.tier).toBe('potato')
  })

  it('never climbs above maxTier', () => {
    const { state, actions } = runWindows(
      createHysteresisState({ tier: 'mid', maxTier: 'mid', phase: 'runtime' }),
      [16, 16, 16],
    )
    expect(actions.every((a) => a === 'hold')).toBe(true)
    expect(state.tier).toBe('mid')
  })

  it('never jumps two rungs in one decision', () => {
    const { state, actions } = runWindows(
      createHysteresisState({ tier: 'high', maxTier: 'high', phase: 'runtime' }),
      [50],
    )
    expect(actions).toEqual(['drop'])
    expect(state.tier).toBe('mid')
    expect(state.tier).not.toBe('low')
  })

  it('starts cooldown on applyFailed even when frames are fine', () => {
    const start = createHysteresisState({ tier: 'low', maxTier: 'mid', phase: 'runtime' })
    const { state, actions } = runWindows(start, [16, 16, 16], 0)
    expect(actions[0]).toBe('hold')
    expect(state.tier).toBe('low')
    expect(actions.includes('climb')).toBe(false)
  })
})
