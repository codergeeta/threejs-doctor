import { HYSTERESIS, TIER_ORDER } from './quality-caps.js'
import type { LadderPhase, QualityTier } from './quality-types.js'

export { HYSTERESIS, TIER_ORDER } from './quality-caps.js'

export interface HysteresisState {
  tier: QualityTier
  maxTier: QualityTier
  phase: LadderPhase
  consecutiveSlow: number
  consecutiveFast: number
  cooldownRemaining: number
}

export type LadderDecisionReason =
  | 'neutral'
  | 'emergency'
  | 'below-target'
  | 'headroom'
  | 'cooldown'
  | 'boot-no-climb'
  | 'floor'
  | 'ceiling'

export interface LadderDecision {
  action: 'hold' | 'drop' | 'climb'
  reason: LadderDecisionReason
  next: HysteresisState
}

export function createHysteresisState(init: {
  tier: QualityTier
  maxTier: QualityTier
  phase: LadderPhase
}): HysteresisState {
  return {
    tier: init.tier,
    maxTier: init.maxTier,
    phase: init.phase,
    consecutiveSlow: 0,
    consecutiveFast: 0,
    cooldownRemaining: 0,
  }
}

export function stepTier(tier: QualityTier, delta: -1 | 1): QualityTier {
  const i = TIER_ORDER.indexOf(tier)
  const next = Math.max(0, Math.min(TIER_ORDER.length - 1, i + delta))
  return TIER_ORDER[next]!
}

function rank(tier: QualityTier): number {
  return TIER_ORDER.indexOf(tier)
}

export function evaluateWindow(
  state: HysteresisState,
  p95FrameTimeMs: number,
  opts: { applyFailed?: boolean } = {},
): LadderDecision {
  let cooldownRemaining = state.cooldownRemaining
  if (opts.applyFailed) cooldownRemaining = HYSTERESIS.cooldownWindows

  const atFloor = rank(state.tier) <= 0
  const atCeiling = rank(state.tier) >= rank(state.maxTier)

  const dropTo = (reason: 'emergency' | 'below-target'): LadderDecision => {
    if (atFloor) {
      return {
        action: 'hold',
        reason: 'floor',
        next: {
          ...state,
          consecutiveSlow: 0,
          consecutiveFast: 0,
          cooldownRemaining: HYSTERESIS.cooldownWindows,
        },
      }
    }
    return {
      action: 'drop',
      reason,
      next: {
        ...state,
        tier: stepTier(state.tier, -1),
        consecutiveSlow: 0,
        consecutiveFast: 0,
        cooldownRemaining: HYSTERESIS.cooldownWindows,
      },
    }
  }

  if (p95FrameTimeMs >= HYSTERESIS.emergencyP95Ms) return dropTo('emergency')
  // Failed apply + still below 30 FPS is drop-triggering (do not wait for 2 slow windows).
  if (opts.applyFailed && p95FrameTimeMs > HYSTERESIS.dropP95Ms) return dropTo('below-target')

  let consecutiveSlow = state.consecutiveSlow
  let consecutiveFast = state.consecutiveFast
  if (p95FrameTimeMs > HYSTERESIS.dropP95Ms) {
    consecutiveSlow += 1
    consecutiveFast = 0
  } else if (p95FrameTimeMs <= HYSTERESIS.climbP95Ms) {
    // Cooldown windows do not count toward climb; need 3 fresh fast windows after.
    consecutiveFast = cooldownRemaining > 0 ? 0 : consecutiveFast + 1
    consecutiveSlow = 0
  } else {
    consecutiveSlow = 0
    consecutiveFast = 0
  }

  if (consecutiveSlow >= HYSTERESIS.dropWindows) return dropTo('below-target')

  if (p95FrameTimeMs <= HYSTERESIS.climbP95Ms && consecutiveFast >= HYSTERESIS.climbWindows) {
    if (state.phase !== 'runtime') {
      return {
        action: 'hold',
        reason: 'boot-no-climb',
        next: {
          ...state,
          consecutiveSlow,
          consecutiveFast,
          cooldownRemaining: Math.max(0, cooldownRemaining - 1),
        },
      }
    }
    if (cooldownRemaining > 0) {
      return {
        action: 'hold',
        reason: 'cooldown',
        next: {
          ...state,
          consecutiveSlow,
          consecutiveFast,
          cooldownRemaining: cooldownRemaining - 1,
        },
      }
    }
    if (atCeiling) {
      return {
        action: 'hold',
        reason: 'ceiling',
        next: {
          ...state,
          consecutiveSlow,
          consecutiveFast: 0,
          cooldownRemaining: 0,
        },
      }
    }
    return {
      action: 'climb',
      reason: 'headroom',
      next: {
        ...state,
        tier: stepTier(state.tier, 1),
        consecutiveSlow: 0,
        consecutiveFast: 0,
        cooldownRemaining: 0,
      },
    }
  }

  return {
    action: 'hold',
    reason: 'neutral',
    next: {
      ...state,
      consecutiveSlow,
      consecutiveFast,
      cooldownRemaining: Math.max(0, cooldownRemaining - 1),
    },
  }
}
