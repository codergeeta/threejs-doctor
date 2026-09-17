# threejs-doctor v2 Quality Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a progressive-boot-then-runtime Quality Ladder beside v1 `Doctor` so heavy Three.js demos (ocean-class) hit TTFI under ~3s and then hold ≥30 FPS on low-end mobile, without breaking callers who never construct a controller.

**Architecture:** Keep diagnose in `@threejs-doctor/rules` and v1 measure/diagnose/optimize on `Doctor`. Add `QualityTier` / adapter types / `resolveStartTier` / a pure hysteresis state machine in `@threejs-doctor/core`. Add `QualityController` in `@threejs-doctor/runtime` next to `Doctor` (same package — not `@threejs-doctor/boot`, not a static rewrite). Generic caps always run; an optional `QualityAdapter` exposes app knobs. Unpublished `examples/ocean-adapter` wraps `window.pelagic.debug`. Live WebGL ocean is the acceptance proof; headless CI stays unit tests only.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, existing `@threejs-doctor/*` packages, `three` as peer, Node 22 GitHub Actions (`pnpm typecheck` / `pnpm test` / `pnpm build` / `threejs-doctor ci --min-score 0`).

## Global Constraints

- Pipeline: progressive boot first, then runtime Quality Ladder — **one product loop** (not split boot/runtime packages)
- User-facing quality modes: `advise` | `safe-auto` | `takeover`; default **`safe-auto`**
- Success bar (low-end mobile, live ocean): **TTFI under ~3s**, then hold **≥30 FPS** (`avgFps ≥ 30` and `p95FrameTimeMs ≤ 33.4` over 90-frame windows, 3 consecutive windows at the settled tier)
- Control model: **hybrid** — generic Three.js caps always; optional `QualityAdapter` for app knobs (FFT, RT scale, mesh LOD, deferred HDR)
- Architecture: **QualityController beside Doctor in `@threejs-doctor/runtime`** — NOT split packages, NOT static source rewrite
- Acceptance: live [ocean-simulation](https://iamtechartist.github.io/ocean-simulation/) WebGL attach; headless CI is unit tests only — never the mobile-quality proof
- Metrics: **never invent after metrics**; omit unmeasured fields (do not write `0` / `53` for missing `ttfiMs` / `simPassCount` / `bytesLoaded` / `compileMs`)
- `npx threejs-doctor scan` **stays a stub** (score 100, empty findings, zeroed baseline) — no static FFT/HDR analysis
- Do **not** vendor `iamtechartist/ocean-simulation` into this repo; unpublished `examples/ocean-adapter` only — do not publish `@threejs-doctor/ocean-adapter`
- v1 `Doctor` / diagnose / score / reversible passes / overlay / CLI / R3F **must keep working** for callers who never use the ladder
- Do **not** request `WEBGL_debug_renderer_info` (no unmasked vendor/renderer)
- Doctor Score is a hygiene signal, **not** the success bar; a 100 score without TTFI/FPS movement is a false win
- `simPassCount` in reports comes **only** from `adapter.readExtras()` — never fill from the §5 expected-pass table
- Safe apply order (boot and each rung): `dpr-cap` → `pixel-budget` → `shadow-budget` → `postfx-budget` → `tone-map-lite` → `anisotropy-cap` → `frameloop-demand` → `distance-cull` → adapter knobs; `pixel-budget` may lower DPR further after `dpr-cap` and must not raise it
- `material-downgrade` stays opt-in; `takeover` may include it; never put it in `SAFE_PASSES`
- `frameloop-demand` still applies only for `marketing` / `product` (ocean is `game`: continuous)
- Potato-class devices never climb to `high` unless the caller sets `maxTier: 'high'`
- During boot: **no climb**; drops are allowed
- Climb is one rung per successful window-set — never jump `potato` → `mid`
- Dual-controller: `safe-auto` sets ceilings (host may still run, next tick reclamps); `takeover` pauses the host loop via `takeExclusiveControl()`; `advise` neither clamps nor pauses
- `boot()` must **not** call `Doctor.optimize()` (that measures 30 frames first and would delay TTFI)
- `exactOptionalPropertyTypes` is on: omit optional fields; never assign `undefined`
- Product name `threejs-doctor`; packages `@threejs-doctor/*`; MIT © codergeeta; telemetry off by default
- Commits: small, frequent, conventional (`feat:`, `test:`, `fix:`, `docs:`, `chore:`)
- Do not start glTF pipelines, custom shader rewrites, `scan` AST, WebGPU-only FFT, Spector.js replacement, or a second publishable package in these tasks
- tsconfig `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` stay on; Node 22 CI pattern unchanged (no new GPU job)

---

## File Structure Map

Existing v1 files stay. New and modified paths for v2:

```
threejs-doctor/
├── README.md                                          # add v2 plan link; attach notes after Task 6–7
├── package.json                                       # Task 6: include examples in test recursion
├── pnpm-workspace.yaml                                # Task 6: add examples/*
├── docs/superpowers/specs/2026-09-17-threejs-doctor-quality-ladder-design.md
├── docs/superpowers/plans/2026-09-17-threejs-doctor-quality-ladder.md  # this file
├── docs/superpowers/acceptance/
│   ├── quality-ladder-report.schema.json              # Task 7: schema only, no live FPS numbers
│   └── live-ocean-capture.md                          # Task 7: how to capture JSON on a phone
├── packages/core/src/
│   ├── types.ts                                       # PassId + SAFE_PASSES + optional MetricsSample fields
│   ├── device-probe.ts                                # DeviceProbeInput extras; classifyTier untouched
│   ├── start-tier.ts                                  # NEW resolveStartTier
│   ├── quality-types.ts                               # NEW QualityTier, adapter types, QualityMode
│   ├── hysteresis.ts                                  # NEW window state machine
│   ├── quality-caps.ts                                # NEW per-tier generic caps + adapter knob tables
│   ├── index.ts                                       # re-export new modules
│   └── __tests__/
│       ├── device-probe.test.ts                       # extend; keep v1 cases
│       ├── start-tier.test.ts                         # NEW
│       ├── hysteresis.test.ts                         # NEW fake-clock windows
│       └── exports.test.ts                            # SAFE_PASSES grows in Task 3
├── packages/runtime/src/
│   ├── doctor.ts                                      # applyPassesImmediate, rollbackAll, measure(frames?), overlay HUD hook
│   ├── quality-controller.ts                          # NEW QualityController
│   ├── overlay/mount-overlay.ts                       # second HUD line when ladder attached
│   ├── overlay/format-quality-hud.ts                  # NEW second-line formatter
│   ├── passes/types.ts                                # qualityTier + drawing-buffer / toneMapping / shadowMap
│   ├── passes/dpr-cap.ts                              # ladder tier caps when qualityTier set; v1 path unchanged
│   ├── passes/shadow-budget.ts                        # potato 0 casters + shadowMap.enabled=false when qualityTier set
│   ├── passes/postfx-budget.ts                        # potato+low off when qualityTier set; v1 path unchanged
│   ├── passes/pixel-budget.ts                         # NEW
│   ├── passes/tone-map-lite.ts                        # NEW
│   ├── passes/anisotropy-cap.ts                       # NEW
│   ├── index.ts                                       # export QualityController + new passes
│   └── __tests__/
│       ├── ladder-harness.ts                          # NEW shared fake Doctor/renderer (created Task 2)
│       ├── hysteresis already in core
│       ├── doctor.test.ts                             # v1 compatibility stays green
│       ├── passes.test.ts                             # v2 passes + v1 dpr still 1.5 without qualityTier
│       ├── quality-controller-boot.test.ts            # Task 2
│       ├── quality-adapter.test.ts                    # Task 4
│       ├── quality-controller-ladder.test.ts          # Task 5
│       └── overlay.test.ts                            # second line; v1 first line unchanged
├── packages/rules/                                    # no new success bar; optional findings appended by controller
├── packages/cli/src/commands/scan.ts                  # unchanged stub
├── packages/bench/                                    # fixtures stay v1 scene-stat contracts
├── packages/r3f/                                      # unchanged until optional Task 8
└── examples/ocean-adapter/                            # Task 6, unpublished
    ├── package.json                                   # private: true; NOT a published package
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── README.md                                      # live attach notes
    └── src/
        ├── index.ts
        ├── pelagic-adapter.ts
        └── __tests__/pelagic-adapter.test.ts
```

Responsibility split:

| File | Responsibility |
|------|----------------|
| `quality-types.ts` | Public ladder/adapter types matching spec §9 |
| `quality-caps.ts` | Numeric ceilings and ocean knob tables (documentation + controller input); `simPassCount` is **not** a fill-in) |
| `hysteresis.ts` | Pure climb/drop/cooldown machine; no WebGL |
| `start-tier.ts` | `resolveStartTier` only; does not change `classifyTier` |
| `quality-controller.ts` | Boot + runtime loop, modes, adapter registry, report extras |
| `passes/pixel-budget.ts` etc. | Generic reversible caps; no FFT/RT walks |
| `examples/ocean-adapter` | Thin `window.pelagic.debug` wrapper; degrades to `capabilities: []` if the handle is missing |

---

### Task 0: Quality types, per-tier tables, hysteresis state machine

**Files:**
- Create: `packages/core/src/quality-types.ts`
- Create: `packages/core/src/quality-caps.ts`
- Create: `packages/core/src/hysteresis.ts`
- Create: `packages/core/src/__tests__/hysteresis.test.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/hysteresis.test.ts`

**Interfaces:**
- Consumes: `MetricsCollector` from `packages/core/src/metrics-collector.ts` (fake clock in tests only)
- Produces:

```ts
export type QualityTier = 'potato' | 'low' | 'mid' | 'high'
export type QualityMode = 'advise' | 'safe-auto' | 'takeover'
export type LadderPhase = 'boot' | 'runtime'
export type AdapterCapability =
  | 'fftSize'
  | 'rtScale'
  | 'meshLod'
  | 'deferredHdr'
  | 'simPassCount'

export interface QualityKnobSet {
  fftSize?: number[]
  spectrumEveryNFrames?: number
  rtScale?: number
  meshLod?: 0 | 1 | 2
  deferredHdr?: boolean
}

export interface AdapterExtras {
  simPassCount?: number
  bytesLoaded?: number
  compileMs?: number
}

export interface KnobHandle {
  rollback(): void
}

export interface QualityAdapter {
  readonly id: string
  capabilities(): AdapterCapability[]
  snapshot(): QualityKnobSet
  apply(tier: QualityTier, knobs: QualityKnobSet): KnobHandle
  readExtras?(): AdapterExtras
  takeExclusiveControl?(): { release(): void }
}

export const TIER_ORDER: readonly QualityTier[]
export const HYSTERESIS: {
  emergencyP95Ms: 50
  dropP95Ms: 33.4
  climbP95Ms: 22
  dropWindows: 2
  climbWindows: 3
  cooldownWindows: 2
  windowFrames: 90
  ttfiBudgetMs: 3000
  targetFps: 30
}

export interface GenericTierCaps {
  pixelRatio: number
  drawingBufferPixels?: number
  shadowCasters?: number
  postfxOff: boolean
  toneMapping?: 0 | 1
  anisotropy?: number
}

export const GENERIC_CAPS: Record<QualityTier, GenericTierCaps>
export const ADAPTER_KNOBS: Record<QualityTier, QualityKnobSet>

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
}): HysteresisState

export function evaluateWindow(
  state: HysteresisState,
  p95FrameTimeMs: number,
  opts?: { applyFailed?: boolean },
): LadderDecision

export function stepTier(tier: QualityTier, delta: -1 | 1): QualityTier
```

- [ ] **Step 1: Write the failing hysteresis tests (fake clock + MetricsCollector)**

Create `packages/core/src/__tests__/hysteresis.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @threejs-doctor/core test -- src/__tests__/hysteresis.test.ts`

Expected: FAIL with `Cannot find module '../hysteresis.js'` (or `evaluateWindow` is not a function).

- [ ] **Step 3: Write types, cap tables, and hysteresis implementation**

`packages/core/src/quality-types.ts`:

```ts
export type QualityTier = 'potato' | 'low' | 'mid' | 'high'
export type QualityMode = 'advise' | 'safe-auto' | 'takeover'
export type LadderPhase = 'boot' | 'runtime'

export type AdapterCapability =
  | 'fftSize'
  | 'rtScale'
  | 'meshLod'
  | 'deferredHdr'
  | 'simPassCount'

export interface QualityKnobSet {
  fftSize?: number[]
  spectrumEveryNFrames?: number
  rtScale?: number
  meshLod?: 0 | 1 | 2
  deferredHdr?: boolean
}

export interface AdapterExtras {
  simPassCount?: number
  bytesLoaded?: number
  compileMs?: number
}

export interface KnobHandle {
  rollback(): void
}

export interface QualityAdapter {
  readonly id: string
  capabilities(): AdapterCapability[]
  snapshot(): QualityKnobSet
  apply(tier: QualityTier, knobs: QualityKnobSet): KnobHandle
  readExtras?(): AdapterExtras
  takeExclusiveControl?(): { release(): void }
}
```

`packages/core/src/quality-caps.ts` (knob table is for implementers; **never** copy `simPassCount` into reports):

```ts
import type { QualityKnobSet, QualityTier } from './quality-types.js'

export const TIER_ORDER: readonly QualityTier[] = ['potato', 'low', 'mid', 'high']

export const HYSTERESIS = {
  emergencyP95Ms: 50,
  dropP95Ms: 33.4,
  climbP95Ms: 22,
  dropWindows: 2,
  climbWindows: 3,
  cooldownWindows: 2,
  windowFrames: 90,
  ttfiBudgetMs: 3000,
  targetFps: 30,
} as const

export interface GenericTierCaps {
  pixelRatio: number
  drawingBufferPixels?: number
  shadowCasters?: number
  postfxOff: boolean
  toneMapping?: 0 | 1
  anisotropy?: number
}

export const GENERIC_CAPS: Record<QualityTier, GenericTierCaps> = {
  potato: {
    pixelRatio: 1.0,
    drawingBufferPixels: 1.2e6,
    shadowCasters: 0,
    postfxOff: true,
    toneMapping: 0,
    anisotropy: 1,
  },
  low: {
    pixelRatio: 1.25,
    drawingBufferPixels: 2.0e6,
    shadowCasters: 1,
    postfxOff: true,
    toneMapping: 1,
    anisotropy: 1,
  },
  mid: {
    pixelRatio: 1.5,
    drawingBufferPixels: 2.7e6,
    postfxOff: false,
    anisotropy: 4,
  },
  high: {
    pixelRatio: 2,
    postfxOff: false,
  },
}

export const ADAPTER_KNOBS: Record<QualityTier, QualityKnobSet> = {
  potato: {
    fftSize: [64, 0, 0],
    spectrumEveryNFrames: 2,
    rtScale: 0.35,
    meshLod: 0,
    deferredHdr: true,
  },
  low: {
    fftSize: [128, 128, 128],
    spectrumEveryNFrames: 1,
    rtScale: 0.5,
    meshLod: 1,
    deferredHdr: true,
  },
  mid: {
    fftSize: [128, 256, 128],
    spectrumEveryNFrames: 1,
    rtScale: 0.7,
    meshLod: 2,
    deferredHdr: false,
  },
  high: {
    fftSize: [128, 256, 128],
    spectrumEveryNFrames: 1,
    rtScale: 1.0,
    meshLod: 2,
    deferredHdr: false,
  },
}
```

`packages/core/src/hysteresis.ts`:

```ts
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

  let consecutiveSlow = state.consecutiveSlow
  let consecutiveFast = state.consecutiveFast
  if (p95FrameTimeMs > HYSTERESIS.dropP95Ms) {
    consecutiveSlow += 1
    consecutiveFast = 0
  } else if (p95FrameTimeMs <= HYSTERESIS.climbP95Ms) {
    consecutiveFast += 1
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
```

Re-export from `packages/core/src/index.ts` (keep existing exports, append):

```ts
export const PACKAGE_NAME = '@threejs-doctor/core' as const
export * from './types.js'
export * from './device-probe.js'
export * from './scene-snapshot.js'
export * from './metrics-collector.js'
export * from './quality-types.js'
export * from './quality-caps.js'
export * from './hysteresis.js'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @threejs-doctor/core test -- src/__tests__/hysteresis.test.ts`

Expected: PASS. If the cooldown test fails by one window, adjust only `evaluateWindow` cooldown decrement so a drop’s own window does not consume a cooldown slot (the implementation above already returns immediately on drop without decrementing).

- [ ] **Step 5: Run existing core tests (v1 must stay green)**

Run: `pnpm --filter @threejs-doctor/core test`

Expected: PASS (including `device-probe.test.ts` and `exports.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/quality-types.ts packages/core/src/quality-caps.ts packages/core/src/hysteresis.ts packages/core/src/__tests__/hysteresis.test.ts packages/core/src/index.ts
git commit -m "feat(core): add QualityTier types and hysteresis state machine"
```

---

### Task 1: `resolveStartTier` + probe input extensions

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/device-probe.ts`
- Create: `packages/core/src/start-tier.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/__tests__/device-probe.test.ts`
- Create: `packages/core/src/__tests__/start-tier.test.ts`
- Modify: `packages/runtime/src/passes/types.ts` (optional `getExtension` on renderer — used by Doctor in Step 5)
- Modify: `packages/runtime/src/doctor.ts` (`device()` forwards new signals)
- Test: `packages/core/src/__tests__/start-tier.test.ts`
- Test: `packages/core/src/__tests__/device-probe.test.ts`

**Interfaces:**
- Consumes: `DeviceCapabilities`, `DeviceTier` from `packages/core/src/types.ts`; `QualityTier` from `packages/core/src/quality-types.ts`; existing `classifyTier` arithmetic in `device-probe.ts` (**do not edit the score formula**)
- Produces:

```ts
export interface DeviceProbeInput {
  devicePixelRatio: number
  hardwareConcurrency: number
  maxTextureSize: number
  webgl: boolean
  webgpu: boolean
  deviceMemory?: number
  maxTouchPoints?: number
  coarsePointer?: boolean
  prefersReducedData?: boolean
  colorBufferFloat?: boolean
  floatLinear?: boolean
  maxRenderbufferSize?: number
}

export interface DeviceCapabilities {
  tier: DeviceTier
  maxTextureSize: number
  webgl: boolean
  webgpu: boolean
  devicePixelRatio: number
  hardwareConcurrency: number
  deviceMemory?: number
  maxTouchPoints?: number
  coarsePointer?: boolean
  prefersReducedData?: boolean
  colorBufferFloat?: boolean
  floatLinear?: boolean
  maxRenderbufferSize?: number
}

export interface StartTierResult {
  startTier: QualityTier
  maxTier: QualityTier
  mobile: boolean
  noFloatRt: boolean
}

export function resolveStartTier(
  caps: DeviceCapabilities,
  opts?: Partial<DeviceProbeInput>,
): StartTierResult

export function isMobileSignal(input: {
  maxTouchPoints?: number
  coarsePointer?: boolean
  deviceMemory?: number
  devicePixelRatio: number
  hardwareConcurrency: number
}): boolean

export function readWebglQualitySignals(
  gl: { getExtension(name: string): unknown } | undefined,
): Pick<DeviceProbeInput, 'colorBufferFloat' | 'floatLinear'>
```

- [ ] **Step 1: Write failing start-tier + unmasking tests**

Create `packages/core/src/__tests__/start-tier.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { probeDevice, readWebglQualitySignals } from '../device-probe.js'
import { resolveStartTier, isMobileSignal } from '../start-tier.js'

describe('resolveStartTier', () => {
  it('keeps v1 desktop high → startTier high, maxTier high', () => {
    const caps = probeDevice({
      devicePixelRatio: 1,
      hardwareConcurrency: 16,
      maxTextureSize: 16384,
      webgl: true,
      webgpu: true,
    })
    expect(caps.tier).toBe('high')
    const r = resolveStartTier(caps)
    expect(r.startTier).toBe('high')
    expect(r.maxTier).toBe('high')
    expect(r.mobile).toBe(false)
  })

  it('maps desktop v1 mid → start mid, max high', () => {
    const caps = probeDevice({
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
      maxTextureSize: 8192,
      webgl: true,
      webgpu: false,
    })
    expect(caps.tier).toBe('mid')
    const r = resolveStartTier(caps)
    expect(r.startTier).toBe('mid')
    expect(r.maxTier).toBe('high')
  })

  it('maps desktop v1 low → start low, max high', () => {
    const caps = probeDevice({
      devicePixelRatio: 3,
      hardwareConcurrency: 4,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
    })
    expect(caps.tier).toBe('low')
    const r = resolveStartTier(caps)
    expect(r.startTier).toBe('low')
    expect(r.maxTier).toBe('high')
    expect(r.mobile).toBe(false)
  })

  it('starts potato on mobile with deviceMemory <= 4, maxTier mid', () => {
    const caps = probeDevice({
      devicePixelRatio: 3,
      hardwareConcurrency: 8,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      deviceMemory: 4,
      maxTouchPoints: 5,
      coarsePointer: true,
    })
    const r = resolveStartTier(caps)
    expect(r.mobile).toBe(true)
    expect(r.startTier).toBe('potato')
    expect(r.maxTier).toBe('mid')
  })

  it('starts potato on mobile with cores <= 4', () => {
    const caps = probeDevice({
      devicePixelRatio: 2,
      hardwareConcurrency: 4,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      maxTouchPoints: 1,
    })
    const r = resolveStartTier(caps)
    expect(r.startTier).toBe('potato')
    expect(r.maxTier).toBe('mid')
  })

  it('starts potato on mobile when OES_texture_float_linear is false', () => {
    const caps = probeDevice({
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      maxTouchPoints: 5,
      deviceMemory: 6,
      floatLinear: false,
      colorBufferFloat: true,
    })
    const r = resolveStartTier(caps)
    expect(r.startTier).toBe('potato')
    expect(r.maxTier).toBe('mid')
  })

  it('starts low on other mobile, maxTier mid', () => {
    const caps = probeDevice({
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      maxTouchPoints: 5,
      deviceMemory: 6,
      floatLinear: true,
      colorBufferFloat: true,
    })
    const r = resolveStartTier(caps)
    expect(r.mobile).toBe(true)
    expect(r.startTier).toBe('low')
    expect(r.maxTier).toBe('mid')
  })

  it('treats unknown mobile deviceMemory as potato-class (conservative)', () => {
    const caps = probeDevice({
      devicePixelRatio: 3,
      hardwareConcurrency: 8,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      maxTouchPoints: 5,
      coarsePointer: true,
    })
    const r = resolveStartTier(caps)
    expect(r.mobile).toBe(true)
    expect(r.startTier).toBe('potato')
    expect(r.maxTier).toBe('mid')
  })

  it('forces potato + maxTier potato when colorBufferFloat is false', () => {
    const caps = probeDevice({
      devicePixelRatio: 1,
      hardwareConcurrency: 16,
      maxTextureSize: 16384,
      webgl: true,
      webgpu: true,
      colorBufferFloat: false,
    })
    const r = resolveStartTier(caps)
    expect(r.startTier).toBe('potato')
    expect(r.maxTier).toBe('potato')
    expect(r.noFloatRt).toBe(true)
  })

  it('throws when webgl is false', () => {
    const caps = probeDevice({ webgl: false, webgpu: false })
    expect(() => resolveStartTier(caps)).toThrow(/webgl/i)
  })

  it('does not treat missing colorBufferFloat as false', () => {
    const caps = probeDevice({
      devicePixelRatio: 1,
      hardwareConcurrency: 16,
      maxTextureSize: 16384,
      webgl: true,
      webgpu: true,
    })
    const r = resolveStartTier(caps)
    expect(r.noFloatRt).toBe(false)
    expect(r.startTier).toBe('high')
  })
})

describe('isMobileSignal', () => {
  it('is true when maxTouchPoints >= 1', () => {
    expect(
      isMobileSignal({
        maxTouchPoints: 1,
        devicePixelRatio: 1,
        hardwareConcurrency: 16,
      }),
    ).toBe(true)
  })

  it('is true when coarsePointer is true', () => {
    expect(
      isMobileSignal({
        coarsePointer: true,
        devicePixelRatio: 1,
        hardwareConcurrency: 16,
      }),
    ).toBe(true)
  })

  it('is true when deviceMemory <= 8 with dpr >= 2 and cores <= 8', () => {
    expect(
      isMobileSignal({
        deviceMemory: 8,
        devicePixelRatio: 2,
        hardwareConcurrency: 8,
      }),
    ).toBe(true)
  })
})

describe('readWebglQualitySignals', () => {
  it('never requests WEBGL_debug_renderer_info or unmasked vendor/renderer', () => {
    const requested: string[] = []
    readWebglQualitySignals({
      getExtension(name: string) {
        requested.push(name)
        return {}
      },
    })
    expect(requested).toContain('EXT_color_buffer_float')
    expect(requested).toContain('OES_texture_float_linear')
    expect(requested).not.toContain('WEBGL_debug_renderer_info')
    expect(requested).not.toContain('UNMASKED_RENDERER_WEBGL')
    expect(requested).not.toContain('UNMASKED_VENDOR_WEBGL')
  })

  it('returns empty object when gl is missing (fields omitted, not false)', () => {
    expect(readWebglQualitySignals(undefined)).toEqual({})
  })
})
```

Append to `packages/core/src/__tests__/device-probe.test.ts` (keep both existing cases unchanged):

```ts
  it('classifies low tier when dpr is high and cores are few', () => {
    const caps = probeDevice({
      devicePixelRatio: 3,
      hardwareConcurrency: 4,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
    })
    expect(caps.tier).toBe('low')
    expect(caps.webgl).toBe(true)
    expect(caps.webgpu).toBe(false)
  })

  it('classifies high tier for strong desktop-like signals', () => {
    const caps = probeDevice({
      devicePixelRatio: 1,
      hardwareConcurrency: 16,
      maxTextureSize: 16384,
      webgl: true,
      webgpu: true,
    })
    expect(caps.tier).toBe('high')
  })

  it('forwards optional v2 probe fields without changing classifyTier', () => {
    const caps = probeDevice({
      devicePixelRatio: 3,
      hardwareConcurrency: 4,
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      deviceMemory: 4,
      maxTouchPoints: 5,
      coarsePointer: true,
      colorBufferFloat: true,
      floatLinear: false,
    })
    expect(caps.tier).toBe('low')
    expect(caps.deviceMemory).toBe(4)
    expect(caps.maxTouchPoints).toBe(5)
    expect(caps.coarsePointer).toBe(true)
    expect(caps.colorBufferFloat).toBe(true)
    expect(caps.floatLinear).toBe(false)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @threejs-doctor/core test -- src/__tests__/start-tier.test.ts src/__tests__/device-probe.test.ts`

Expected: FAIL — `resolveStartTier` / `readWebglQualitySignals` not exported; optional fields missing on `DeviceCapabilities`.

- [ ] **Step 3: Extend probe types and implement resolveStartTier**

In `packages/core/src/types.ts`, add the optional fields to `DeviceCapabilities` **after** the existing required fields. Do not add them to `MetricsSample` yet.

In `packages/core/src/device-probe.ts`, replace the file with:

```ts
import type { DeviceCapabilities, DeviceTier } from './types.js'

export interface DeviceProbeInput {
  devicePixelRatio: number
  hardwareConcurrency: number
  maxTextureSize: number
  webgl: boolean
  webgpu: boolean
  deviceMemory?: number
  maxTouchPoints?: number
  coarsePointer?: boolean
  prefersReducedData?: boolean
  colorBufferFloat?: boolean
  floatLinear?: boolean
  maxRenderbufferSize?: number
}

function classifyTier(input: DeviceProbeInput): DeviceTier {
  const score =
    (input.hardwareConcurrency >= 12 ? 2 : input.hardwareConcurrency >= 8 ? 1 : 0) +
    (input.maxTextureSize >= 8192 ? 2 : input.maxTextureSize >= 4096 ? 1 : 0) +
    (input.devicePixelRatio <= 1.5 ? 1 : 0) +
    (input.webgpu ? 1 : 0)
  if (score >= 5) return 'high'
  if (score >= 3) return 'mid'
  return 'low'
}

function assignOptional(
  caps: DeviceCapabilities,
  partial: Partial<DeviceProbeInput>,
): void {
  if (partial.deviceMemory !== undefined) caps.deviceMemory = partial.deviceMemory
  if (partial.maxTouchPoints !== undefined) caps.maxTouchPoints = partial.maxTouchPoints
  if (partial.coarsePointer !== undefined) caps.coarsePointer = partial.coarsePointer
  if (partial.prefersReducedData !== undefined) {
    caps.prefersReducedData = partial.prefersReducedData
  }
  if (partial.colorBufferFloat !== undefined) caps.colorBufferFloat = partial.colorBufferFloat
  if (partial.floatLinear !== undefined) caps.floatLinear = partial.floatLinear
  if (partial.maxRenderbufferSize !== undefined) {
    caps.maxRenderbufferSize = partial.maxRenderbufferSize
  }
}

export function probeDevice(partial: Partial<DeviceProbeInput> = {}): DeviceCapabilities {
  const input: DeviceProbeInput = {
    devicePixelRatio: partial.devicePixelRatio ?? 1,
    hardwareConcurrency: partial.hardwareConcurrency ?? 4,
    maxTextureSize: partial.maxTextureSize ?? 2048,
    webgl: partial.webgl ?? false,
    webgpu: partial.webgpu ?? false,
  }
  const caps: DeviceCapabilities = {
    tier: classifyTier(input),
    maxTextureSize: input.maxTextureSize,
    webgl: input.webgl,
    webgpu: input.webgpu,
    devicePixelRatio: input.devicePixelRatio,
    hardwareConcurrency: input.hardwareConcurrency,
  }
  assignOptional(caps, partial)
  return caps
}

export function readWebglQualitySignals(
  gl: { getExtension(name: string): unknown } | undefined,
): Pick<DeviceProbeInput, 'colorBufferFloat' | 'floatLinear'> {
  if (!gl) return {}
  return {
    colorBufferFloat: Boolean(gl.getExtension('EXT_color_buffer_float')),
    floatLinear: Boolean(gl.getExtension('OES_texture_float_linear')),
  }
}
```

Create `packages/core/src/start-tier.ts`:

```ts
import type { DeviceCapabilities } from './types.js'
import type { DeviceProbeInput } from './device-probe.js'
import type { QualityTier } from './quality-types.js'

export interface StartTierResult {
  startTier: QualityTier
  maxTier: QualityTier
  mobile: boolean
  noFloatRt: boolean
}

export function isMobileSignal(input: {
  maxTouchPoints?: number
  coarsePointer?: boolean
  deviceMemory?: number
  devicePixelRatio: number
  hardwareConcurrency: number
}): boolean {
  if ((input.maxTouchPoints ?? 0) >= 1) return true
  if (input.coarsePointer === true) return true
  if (
    input.deviceMemory !== undefined &&
    input.deviceMemory <= 8 &&
    input.devicePixelRatio >= 2 &&
    input.hardwareConcurrency <= 8
  ) {
    return true
  }
  return false
}

export function resolveStartTier(
  caps: DeviceCapabilities,
  opts: Partial<DeviceProbeInput> = {},
): StartTierResult {
  const deviceMemory = opts.deviceMemory ?? caps.deviceMemory
  const maxTouchPoints = opts.maxTouchPoints ?? caps.maxTouchPoints
  const coarsePointer = opts.coarsePointer ?? caps.coarsePointer
  const colorBufferFloat = opts.colorBufferFloat ?? caps.colorBufferFloat
  const floatLinear = opts.floatLinear ?? caps.floatLinear
  const devicePixelRatio = opts.devicePixelRatio ?? caps.devicePixelRatio
  const hardwareConcurrency = opts.hardwareConcurrency ?? caps.hardwareConcurrency
  const webgl = opts.webgl ?? caps.webgl

  if (!webgl) {
    throw new Error('webgl required for quality ladder')
  }

  if (colorBufferFloat === false) {
    return { startTier: 'potato', maxTier: 'potato', mobile: isMobileSignal({
      maxTouchPoints,
      coarsePointer,
      deviceMemory,
      devicePixelRatio,
      hardwareConcurrency,
    }), noFloatRt: true }
  }

  const mobile = isMobileSignal({
    maxTouchPoints,
    coarsePointer,
    deviceMemory,
    devicePixelRatio,
    hardwareConcurrency,
  })

  if (mobile) {
    const potatoClass =
      deviceMemory === undefined ||
      deviceMemory <= 4 ||
      hardwareConcurrency <= 4 ||
      floatLinear === false
    if (potatoClass) {
      return { startTier: 'potato', maxTier: 'mid', mobile: true, noFloatRt: false }
    }
    return { startTier: 'low', maxTier: 'mid', mobile: true, noFloatRt: false }
  }

  if (caps.tier === 'low') {
    return { startTier: 'low', maxTier: 'high', mobile: false, noFloatRt: false }
  }
  if (caps.tier === 'mid') {
    return { startTier: 'mid', maxTier: 'high', mobile: false, noFloatRt: false }
  }
  return { startTier: 'high', maxTier: 'high', mobile: false, noFloatRt: false }
}
```

Append `export * from './start-tier.js'` to `packages/core/src/index.ts`.

- [ ] **Step 4: Forward new signals from `Doctor.device()` without breaking v1**

Add optional `getExtension?: (name: string) => unknown` to `DoctorRendererLike` in `packages/runtime/src/passes/types.ts`.

In `packages/runtime/src/doctor.ts`, inside `device()`, after building `probe`, copy `navigator.deviceMemory`, `navigator.maxTouchPoints`, `matchMedia('(pointer: coarse)').matches` when they exist, and merge `readWebglQualitySignals` when `this.opts.renderer.getExtension` exists. Do **not** call `getExtension('WEBGL_debug_renderer_info')`. If `this.opts.device` is provided, return it unchanged (v1 tests inject `device`).

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @threejs-doctor/core test
pnpm --filter @threejs-doctor/runtime test
```

Expected: PASS. v1 `probeDevice` low/high cases still assert `tier: 'low' | 'high'` exactly as before.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/device-probe.ts packages/core/src/start-tier.ts packages/core/src/index.ts packages/core/src/__tests__/start-tier.test.ts packages/core/src/__tests__/device-probe.test.ts packages/runtime/src/passes/types.ts packages/runtime/src/doctor.ts
git commit -m "feat(core): add resolveStartTier and v2 device probe signals"
```

---

### Task 2: `QualityController.boot()` — TTFI, start-tier apply, advise vs safe-auto gate

**Files:**
- Create: `packages/runtime/src/quality-controller.ts`
- Create: `packages/runtime/src/__tests__/ladder-harness.ts`
- Create: `packages/runtime/src/__tests__/quality-controller-boot.test.ts`
- Modify: `packages/runtime/src/doctor.ts`
- Modify: `packages/runtime/src/passes/types.ts`
- Modify: `packages/runtime/src/passes/dpr-cap.ts`
- Modify: `packages/runtime/src/passes/shadow-budget.ts`
- Modify: `packages/runtime/src/passes/postfx-budget.ts`
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/src/__tests__/passes.test.ts`
- Modify: `packages/runtime/src/__tests__/doctor.test.ts` (add one compatibility case; do not change existing assertions)
- Test: `packages/runtime/src/__tests__/quality-controller-boot.test.ts`

**Interfaces:**
- Consumes: `Doctor` from `packages/runtime/src/doctor.ts`; `SAFE_PASSES`, `resolveStartTier`, `GENERIC_CAPS`, `QualityAdapter`, `QualityMode`, `QualityTier`, `LadderPhase` from core
- Produces:

```ts
export interface QualityControllerOptions {
  mode?: QualityMode
  startTier?: QualityTier | 'auto'
  maxTier?: QualityTier | 'auto'
  ttfiBudgetMs?: number
  targetFps?: number
  windowFrames?: number
  now?: () => number
  waitForFirstInteractive?: () => Promise<void>
}

export interface AppliedKnob {
  capability: AdapterCapability
  value: unknown
}

export interface QualityLadderReport {
  profile: Exclude<Profile, 'auto'>
  mode: Mode
  qualityMode: QualityMode
  phase: LadderPhase
  tier: QualityTier
  startTier: QualityTier
  maxTier: QualityTier
  score: number
  findings: Finding[]
  baseline: MetricsSample
  after?: MetricsSample
  deltas?: Partial<Record<keyof MetricsSample, number>>
  appliedPasses: PassId[]
  appliedKnobs: AppliedKnob[]
  failedPasses: Array<{ id: PassId; error: string }>
  unsupportedKnobs: AdapterCapability[]
  floorFailed: boolean
  applyFailed: boolean
  incomplete: boolean
  ttfiMs?: number
  adapterUnavailable?: boolean
  recommendedTier?: QualityTier
}

export class QualityController {
  constructor(doctor: Doctor, options?: QualityControllerOptions)
  registerAdapter(adapter: QualityAdapter): void
  async boot(): Promise<QualityLadderReport>
  async runLadder(): Promise<QualityLadderReport>
  setMode(mode: QualityMode): void
  dispose(): void
}

export class Doctor {
  applyPassesImmediate(
    passIds: PassId[],
    extras?: { qualityTier?: QualityTier },
  ): { appliedPasses: PassId[]; failedPasses: Array<{ id: PassId; error: string }> }
  rollbackAll(): void
  async measure(frameCount?: number): Promise<MetricsSample>
  attachQualityHud(getter: () => QualityHudState | undefined): void
  getDevice(): DeviceCapabilities
  refreshOverlay(): void
}
```

`PassContext` gains `qualityTier?: QualityTier`. When it is omitted, `dpr-cap` / `shadow-budget` / `postfx-budget` must keep **exact v1 behavior**.

In this task `runLadder()` may throw `Error('runLadder not implemented')` — Task 5 implements it. `registerAdapter` may store the adapter and no-op apply until Task 4; boot still must not call `adapter.apply` in `advise`.

- [ ] **Step 1: Write failing boot tests**

Create `packages/runtime/src/__tests__/ladder-harness.ts`:

```ts
import { Doctor } from '../doctor.js'
import type { RendererInfoLike } from '@threejs-doctor/core'

export function createLadderDoctor(opts?: {
  pixelRatio?: number
  setPixelRatio?: (v: number) => void
  getSceneStats?: () => {
    textureCount: number
    estimatedVramBytes: number
    geometryCount: number
    lightCount: number
    shadowCastingLightCount: number
  }
  now?: () => number
  device?: ConstructorParameters<typeof Doctor>[0] extends infer O
    ? O extends { device?: infer D }
      ? D
      : never
    : never
  measureFrames?: number
}) {
  const info: RendererInfoLike = {
    render: { calls: 40, triangles: 8000 },
    memory: { geometries: 8, textures: 4 },
  }
  const lights = [{ castShadow: true }, { castShadow: true }]
  const renderer = {
    info,
    pixelRatio: opts?.pixelRatio ?? 3,
    antialias: true,
    toneMapping: 4,
    shadowMap: { enabled: true },
    drawingBufferWidth: 2000,
    drawingBufferHeight: 2000,
    setPixelRatio(v: number) {
      if (opts?.setPixelRatio) {
        opts.setPixelRatio(v)
        return
      }
      this.pixelRatio = v
    },
    setDrawingBufferSize(width: number, height: number, pixelRatio: number) {
      this.drawingBufferWidth = width
      this.drawingBufferHeight = height
      this.pixelRatio = pixelRatio
    },
  }
  const scene = {
    children: lights,
    traverse(cb: (o: Record<string, unknown>) => void) {
      for (const l of lights) cb(l as never)
      cb({
        isMesh: true,
        geometry: { uuid: 'g1' },
        material: {
          uuid: 'm1',
          map: { anisotropy: 8 },
        },
        matrixAutoUpdate: false,
      })
    },
  }
  let t = 0
  const doctor = new Doctor({
    scene: scene as never,
    camera: {},
    renderer: renderer as never,
    profile: 'game',
    mode: 'optimize',
    measureFrames: opts?.measureFrames ?? 5,
    now:
      opts?.now ??
      (() => {
        t += 16
        return t
      }),
    device: opts?.device ?? {
      tier: 'low',
      maxTextureSize: 4096,
      webgl: true,
      webgpu: false,
      devicePixelRatio: 3,
      hardwareConcurrency: 4,
      deviceMemory: 4,
      maxTouchPoints: 5,
      coarsePointer: true,
      colorBufferFloat: true,
      floatLinear: true,
    },
    getSceneStats:
      opts?.getSceneStats ??
      (() => ({
        textureCount: 4,
        estimatedVramBytes: 8_000_000,
        geometryCount: 8,
        lightCount: 2,
        shadowCastingLightCount: lights.filter((l) => l.castShadow).length,
      })),
  })
  return { doctor, renderer, lights }
}
```

Create `packages/runtime/src/__tests__/quality-controller-boot.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { QualityController } from '../quality-controller.js'
import { createLadderDoctor } from './ladder-harness.js'
import { dprCapPass } from '../passes/dpr-cap.js'
import type { QualityAdapter } from '@threejs-doctor/core'

function fakeAdapter(applyCalls: unknown[]): QualityAdapter {
  return {
    id: 'fake',
    capabilities: () => ['fftSize'],
    snapshot: () => ({}),
    apply(tier, knobs) {
      applyCalls.push({ tier, knobs })
      return { rollback() {} }
    },
  }
}

describe('QualityController.boot', () => {
  it('defaults mode to safe-auto when omitted', async () => {
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor)
    const boot = await ladder.boot()
    expect(boot.qualityMode).toBe('safe-auto')
  })

  it('records ttfiMs from a fake waitForFirstInteractive clock', async () => {
    let t = 1000
    const { doctor } = createLadderDoctor({ now: () => t })
    const ladder = new QualityController(doctor, {
      now: () => t,
      waitForFirstInteractive: async () => {
        t = 2840
      },
    })
    const boot = await ladder.boot()
    expect(boot.ttfiMs).toBe(1840)
    expect(boot.phase).toBe('runtime')
    expect(boot.incomplete).toBe(false)
  })

  it('omits ttfiMs and sets incomplete when waitForFirstInteractive throws', async () => {
    let t = 0
    const { doctor } = createLadderDoctor({ now: () => t })
    const ladder = new QualityController(doctor, {
      now: () => t,
      waitForFirstInteractive: async () => {
        throw new Error('no first frame')
      },
    })
    const boot = await ladder.boot()
    expect(boot.incomplete).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(boot, 'ttfiMs')).toBe(false)
  })

  it('safe-auto applies start-tier generic caps before first interactive and does not call Doctor.optimize', async () => {
    const { doctor, renderer } = createLadderDoctor()
    let optimized = false
    const original = doctor.optimize.bind(doctor)
    doctor.optimize = async (...args) => {
      optimized = true
      return original(...args)
    }
    const applyCalls: unknown[] = []
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(fakeAdapter(applyCalls))
    const boot = await ladder.boot()
    expect(optimized).toBe(false)
    expect(boot.startTier).toBe('potato')
    expect(boot.tier).toBe('potato')
    expect(boot.maxTier).toBe('mid')
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.0)
    expect(boot.appliedPasses).toContain('dpr-cap')
  })

  it('advise never mutates renderer or calls adapter.apply', async () => {
    const { doctor, renderer } = createLadderDoctor()
    const applyCalls: unknown[] = []
    const ladder = new QualityController(doctor, { mode: 'advise' })
    ladder.registerAdapter(fakeAdapter(applyCalls))
    const boot = await ladder.boot()
    expect(renderer.pixelRatio).toBe(3)
    expect(applyCalls).toEqual([])
    expect(boot.appliedPasses).toEqual([])
    expect(boot.qualityMode).toBe('advise')
    expect(boot.recommendedTier).toBe('potato')
  })

  it('does not climb during boot', async () => {
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    const boot = await ladder.boot()
    expect(boot.phase).toBe('runtime')
    expect(boot.tier).toBe(boot.startTier)
  })

  it('adds quality/no-float-rt when probe says noFloatRt', async () => {
    const { doctor } = createLadderDoctor({
      device: {
        tier: 'high',
        maxTextureSize: 16384,
        webgl: true,
        webgpu: true,
        devicePixelRatio: 1,
        hardwareConcurrency: 16,
        colorBufferFloat: false,
      },
    })
    const ladder = new QualityController(doctor, { mode: 'advise' })
    const boot = await ladder.boot()
    expect(boot.tier).toBe('potato')
    expect(boot.maxTier).toBe('potato')
    expect(boot.findings.some((f) => f.id === 'quality/no-float-rt')).toBe(true)
  })

  it('v1 dpr-cap without qualityTier still caps low devices to 1.5', () => {
    const renderer = {
      pixelRatio: 3,
      setPixelRatio(v: number) {
        this.pixelRatio = v
      },
    }
    dprCapPass.apply({
      renderer: renderer as never,
      scene: { children: [], traverse() {} } as never,
      device: {
        tier: 'low',
        maxTextureSize: 4096,
        webgl: true,
        webgpu: false,
        devicePixelRatio: 3,
        hardwareConcurrency: 4,
      },
      profile: 'marketing',
      postfxEnabled: true,
      frameloop: 'always',
      setFrameloop() {},
    })
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.5)
    expect(renderer.pixelRatio).toBeGreaterThan(1.0)
  })
})
```

Add to `packages/runtime/src/__tests__/doctor.test.ts`:

```ts
  it('applyPassesImmediate does not call measure or write after metrics', async () => {
    const { doctor, renderer } = createHarness()
    const before = renderer.pixelRatio
    const result = doctor.applyPassesImmediate(['dpr-cap'])
    expect(result.appliedPasses).toContain('dpr-cap')
    expect(renderer.pixelRatio).toBeLessThan(before)
    doctor.rollbackAll()
    expect(renderer.pixelRatio).toBe(before)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @threejs-doctor/runtime test -- src/__tests__/quality-controller-boot.test.ts src/__tests__/doctor.test.ts`

Expected: FAIL — `QualityController` not found; `applyPassesImmediate` not a function.

- [ ] **Step 3: Implement PassContext.qualityTier, v1-compatible caps, Doctor helpers, QualityController.boot**

Add to `PassContext` in `packages/runtime/src/passes/types.ts`:

```ts
  qualityTier?: import('@threejs-doctor/core').QualityTier
```

(Use a real `import type { QualityTier }` at the top of the file next to the existing core import.)

Update `dprCapPass.apply` cap selection:

```ts
    const prev = ctx.renderer.pixelRatio
    const cap = ctx.qualityTier
      ? ctx.qualityTier === 'potato'
        ? 1.0
        : ctx.qualityTier === 'low'
          ? 1.25
          : ctx.qualityTier === 'mid'
            ? 1.5
            : 2
      : ctx.device.tier === 'low'
        ? 1.5
        : ctx.device.tier === 'mid'
          ? 2
          : Math.min(prev, 2)
    ctx.renderer.setPixelRatio(Math.min(prev, cap))
```

Keep the existing try/rollback structure.

Update `shadowBudgetPass` max caster selection:

```ts
    const maxCasters =
      ctx.qualityTier === 'potato'
        ? 0
        : ctx.qualityTier === 'low'
          ? 1
          : ctx.qualityTier === 'mid'
            ? 2
            : ctx.profile === 'marketing'
              ? 1
              : 2
```

When `qualityTier` is omitted, the marketing/product branch must match v1 (`marketing` → 1 else 2).

Update `postfxBudgetPass` disable condition:

```ts
    const forceOff = ctx.qualityTier
      ? ctx.qualityTier === 'potato' || ctx.qualityTier === 'low'
      : ctx.device.tier === 'low'
    if (forceOff && ctx.postfxEnabled) {
      // existing setPostfxEnabled(false) body
    }
```

On `Doctor`:

1. Change `measure()` to `async measure(frameCount?: number)` using `frameCount ?? this.opts.measureFrames ?? 30`.
2. Extract the pass loop from `optimize` into `applyPassesImmediate(passIds, extras)` that builds `PassContext` (including `qualityTier` when provided), pushes handles, and does **not** measure.
3. Add `rollbackAll()` that rollbacks `this.handles` in reverse and clears the array.
4. `optimize` must call `applyPassesImmediate` then measure (existing incomplete contract unchanged).
5. Add `attachQualityHud(_getter: () => unknown): void { /* no-op until Task 5 */ }`.
6. Expose `getDevice()` as `device()` already private — add `getDevice(): DeviceCapabilities { return this.device() }` for the controller.
7. Keep all `PassContext` construction inside `applyPassesImmediate` so `QualityController` never duplicates renderer/scene wiring.

`packages/runtime/src/quality-controller.ts` (boot only; `runLadder` throws until Task 5):

```ts
import {
  SAFE_PASSES,
  resolveStartTier,
  type AdapterCapability,
  type MetricsSample,
  type Mode,
  type PassId,
  type Profile,
  type QualityAdapter,
  type QualityMode,
  type QualityTier,
  type LadderPhase,
} from '@threejs-doctor/core'
import type { Finding } from '@threejs-doctor/rules'
import type { Doctor } from './doctor.js'

export interface QualityControllerOptions {
  mode?: QualityMode
  startTier?: QualityTier | 'auto'
  maxTier?: QualityTier | 'auto'
  ttfiBudgetMs?: number
  targetFps?: number
  windowFrames?: number
  now?: () => number
  waitForFirstInteractive?: () => Promise<void>
}

export interface AppliedKnob {
  capability: AdapterCapability
  value: unknown
}

export interface QualityLadderReport {
  profile: Exclude<Profile, 'auto'>
  mode: Mode
  qualityMode: QualityMode
  phase: LadderPhase
  tier: QualityTier
  startTier: QualityTier
  maxTier: QualityTier
  score: number
  findings: Finding[]
  baseline: MetricsSample
  appliedPasses: PassId[]
  appliedKnobs: AppliedKnob[]
  failedPasses: Array<{ id: PassId; error: string }>
  unsupportedKnobs: AdapterCapability[]
  floorFailed: boolean
  applyFailed: boolean
  incomplete: boolean
  after?: MetricsSample
  deltas?: Partial<Record<keyof MetricsSample, number>>
  ttfiMs?: number
  adapterUnavailable?: boolean
  recommendedTier?: QualityTier
}

export class QualityController {
  private mode: QualityMode
  private adapter: QualityAdapter | undefined
  private booted = false
  private knobHandles: Array<{ rollback(): void }> = []
  private exclusive: { release(): void } | undefined
  private last: QualityLadderReport | undefined

  constructor(
    private readonly doctor: Doctor,
    private readonly options: QualityControllerOptions = {},
  ) {
    this.mode = options.mode ?? 'safe-auto'
  }

  registerAdapter(adapter: QualityAdapter): void {
    this.adapter = adapter
  }

  setMode(mode: QualityMode): void {
    this.mode = mode
  }

  async boot(): Promise<QualityLadderReport> {
    const now = this.options.now ?? (() => performance.now())
    const bootStart = now()
    const device = this.doctor.getDevice()
    const resolved = resolveStartTier(device)
    const startTier =
      this.options.startTier && this.options.startTier !== 'auto'
        ? this.options.startTier
        : resolved.startTier
    const maxTier =
      this.options.maxTier && this.options.maxTier !== 'auto'
        ? this.options.maxTier
        : resolved.maxTier

    const findings: Finding[] = []
    if (resolved.noFloatRt) {
      findings.push({
        id: 'quality/no-float-rt',
        severity: 'warn',
        evidence: { colorBufferFloat: false },
        message: 'Floating-point color buffers unavailable; ladder locked to potato',
        suggestedFix: 'Use a WebGL context with EXT_color_buffer_float, or stay on potato generic caps',
      })
    }

    const appliedPasses: PassId[] = []
    const failedPasses: Array<{ id: PassId; error: string }> = []
    const appliedKnobs: AppliedKnob[] = []

    if (this.mode !== 'advise') {
      if (this.mode === 'takeover') {
        this.exclusive = this.adapter?.takeExclusiveControl?.()
      }
      const result = this.doctor.applyPassesImmediate([...SAFE_PASSES], {
        qualityTier: startTier,
      })
      appliedPasses.push(...result.appliedPasses)
      failedPasses.push(...result.failedPasses)
      // adapter.apply is Task 4; do not invent knobs here
    }

    let ttfiMs: number | undefined
    let incomplete = false
    try {
      await (this.options.waitForFirstInteractive ?? (async () => {}))()
      ttfiMs = now() - bootStart
    } catch {
      incomplete = true
    }

    const diagnosed = await this.doctor.diagnose()
    const report: QualityLadderReport = {
      profile: diagnosed.profile,
      mode: diagnosed.mode,
      qualityMode: this.mode,
      phase: 'runtime',
      tier: startTier,
      startTier,
      maxTier,
      score: diagnosed.score,
      findings: [...diagnosed.findings, ...findings],
      baseline: diagnosed.baseline,
      appliedPasses,
      appliedKnobs,
      failedPasses,
      unsupportedKnobs: [],
      floorFailed: false,
      applyFailed: failedPasses.length > 0,
      incomplete,
    }
    if (ttfiMs !== undefined) report.ttfiMs = ttfiMs
    if (this.mode === 'advise') report.recommendedTier = startTier
    this.booted = true
    this.last = report
    return report
  }

  async runLadder(): Promise<QualityLadderReport> {
    throw new Error('runLadder not implemented')
  }

  dispose(): void {
    for (let i = this.knobHandles.length - 1; i >= 0; i--) {
      try {
        this.knobHandles[i]!.rollback()
      } catch {
        // best-effort
      }
    }
    this.knobHandles = []
    this.doctor.rollbackAll()
    try {
      this.exclusive?.release()
    } catch {
      // best-effort
    }
    this.exclusive = undefined
  }
}
```

Export `QualityController` and the report types from `packages/runtime/src/index.ts`.

Default `waitForFirstInteractive` resolves immediately so unit tests without the hook still record `ttfiMs` (often ~0). The TTFI test supplies a clock hook.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @threejs-doctor/runtime test
pnpm --filter @threejs-doctor/core test
```

Expected: PASS, including existing overlay/doctor/passes tests. `quality-controller-boot` advise case: pixelRatio stays 3.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/quality-controller.ts packages/runtime/src/__tests__/ladder-harness.ts packages/runtime/src/__tests__/quality-controller-boot.test.ts packages/runtime/src/doctor.ts packages/runtime/src/passes/types.ts packages/runtime/src/passes/dpr-cap.ts packages/runtime/src/passes/shadow-budget.ts packages/runtime/src/passes/postfx-budget.ts packages/runtime/src/index.ts packages/runtime/src/__tests__/doctor.test.ts packages/runtime/src/__tests__/passes.test.ts
git commit -m "feat(runtime): add QualityController.boot with TTFI and mode mutation gate"
```

---

### Task 3: Generic v2 passes — pixel-budget, tone-map-lite, anisotropy-cap, potato shadow-off

**Files:**
- Modify: `packages/core/src/types.ts` (`PassId` + `SAFE_PASSES` order)
- Modify: `packages/core/src/__tests__/exports.test.ts`
- Create: `packages/runtime/src/passes/pixel-budget.ts`
- Create: `packages/runtime/src/passes/tone-map-lite.ts`
- Create: `packages/runtime/src/passes/anisotropy-cap.ts`
- Modify: `packages/runtime/src/passes/types.ts`
- Modify: `packages/runtime/src/passes/shadow-budget.ts`
- Modify: `packages/runtime/src/doctor.ts` (`PASS_REGISTRY`)
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/src/__tests__/passes.test.ts`
- Test: `packages/runtime/src/__tests__/passes.test.ts`
- Test: `packages/core/src/__tests__/exports.test.ts`
- Test: `packages/runtime/src/__tests__/doctor.test.ts` (existing `appliedPasses` equals `SAFE_PASSES` — update the expected array by changing `SAFE_PASSES` only)

**Interfaces:**
- Consumes: `GENERIC_CAPS`, `QualityTier`, `PassContext`, `OptimizePass`
- Produces:

```ts
export type PassId =
  | 'dpr-cap'
  | 'pixel-budget'
  | 'shadow-budget'
  | 'postfx-budget'
  | 'tone-map-lite'
  | 'anisotropy-cap'
  | 'frameloop-demand'
  | 'distance-cull'
  | 'material-downgrade'

export const SAFE_PASSES: readonly PassId[] = [
  'dpr-cap',
  'pixel-budget',
  'shadow-budget',
  'postfx-budget',
  'tone-map-lite',
  'anisotropy-cap',
  'frameloop-demand',
  'distance-cull',
]

export interface DoctorRendererLike {
  info: { render: { calls: number; triangles: number }; memory: { geometries: number; textures: number } }
  pixelRatio: number
  antialias?: boolean
  setPixelRatio(value: number): void
  getExtension?: (name: string) => unknown
  toneMapping?: number
  shadowMap?: { enabled: boolean }
  drawingBufferWidth?: number
  drawingBufferHeight?: number
  setDrawingBufferSize?: (width: number, height: number, pixelRatio: number) => void
}

export const pixelBudgetPass: OptimizePass
export const toneMapLitePass: OptimizePass
export const anisotropyCapPass: OptimizePass
```

Ceilings (do not raise if the host is already lower):

| Cap | potato | low | mid | high |
|-----|--------|-----|-----|------|
| pixelRatio | min(current, 1.0) | min(current, 1.25) | min(current, 1.5) | min(current, 2) |
| drawing-buffer pixels | 1.2e6 | 2.0e6 | 2.7e6 | no new cap |
| shadow casters | 0; `shadowMap.enabled = false` | 1 | 2 | v1 profile default |
| post-FX | off | off | host | host |
| toneMapping | `0` (NoToneMapping) | `1` (LinearToneMapping) | host | host |
| anisotropy | 1 | 1 | 4 | host |

No generic FFT pass. No global `WebGLRenderTarget` walk. RT scale is adapter-only (Task 4).

- [ ] **Step 1: Write failing pass tests**

Append to `packages/runtime/src/__tests__/passes.test.ts`:

```ts
import { pixelBudgetPass } from '../passes/pixel-budget.js'
import { toneMapLitePass } from '../passes/tone-map-lite.js'
import { anisotropyCapPass } from '../passes/anisotropy-cap.js'
import { SAFE_PASSES } from '@threejs-doctor/core'

describe('v2 generic passes', () => {
  it('lists v2 passes in safe apply order and keeps material-downgrade out', () => {
    expect(SAFE_PASSES).toEqual([
      'dpr-cap',
      'pixel-budget',
      'shadow-budget',
      'postfx-budget',
      'tone-map-lite',
      'anisotropy-cap',
      'frameloop-demand',
      'distance-cull',
    ])
    expect(SAFE_PASSES).not.toContain('material-downgrade')
  })

  it('pixel-budget lowers drawing-buffer pixels to the tier cap and rollbacks', () => {
    const renderer = {
      pixelRatio: 2,
      drawingBufferWidth: 2000,
      drawingBufferHeight: 2000,
      setPixelRatio(v: number) {
        this.pixelRatio = v
      },
      setDrawingBufferSize(w: number, h: number, pr: number) {
        this.drawingBufferWidth = w
        this.drawingBufferHeight = h
        this.pixelRatio = pr
      },
    }
    const handle = pixelBudgetPass.apply(
      baseCtx({
        renderer: renderer as never,
        qualityTier: 'potato',
      }),
    )
    const pixels = renderer.drawingBufferWidth * renderer.drawingBufferHeight
    expect(pixels).toBeLessThanOrEqual(1.2e6)
    expect(renderer.pixelRatio).toBeLessThanOrEqual(2)
    handle.rollback()
    expect(renderer.drawingBufferWidth).toBe(2000)
    expect(renderer.drawingBufferHeight).toBe(2000)
    expect(renderer.pixelRatio).toBe(2)
  })

  it('pixel-budget does not raise DPR when already under the pixel cap', () => {
    const renderer = {
      pixelRatio: 0.5,
      drawingBufferWidth: 400,
      drawingBufferHeight: 400,
      setPixelRatio(v: number) {
        this.pixelRatio = v
      },
    }
    pixelBudgetPass.apply(
      baseCtx({
        renderer: renderer as never,
        qualityTier: 'potato',
      }),
    )
    expect(renderer.pixelRatio).toBe(0.5)
  })

  it('pixel-budget is a no-op on high when no drawing-buffer cap applies', () => {
    const renderer = {
      pixelRatio: 2,
      drawingBufferWidth: 3000,
      drawingBufferHeight: 2000,
      setPixelRatio(v: number) {
        this.pixelRatio = v
      },
    }
    pixelBudgetPass.apply(
      baseCtx({
        renderer: renderer as never,
        qualityTier: 'high',
      }),
    )
    expect(renderer.pixelRatio).toBe(2)
    expect(renderer.drawingBufferWidth).toBe(3000)
  })

  it('tone-map-lite sets NoToneMapping on potato and rollbacks', () => {
    const renderer = { pixelRatio: 1, toneMapping: 4, setPixelRatio() {} }
    const handle = toneMapLitePass.apply(
      baseCtx({ renderer: renderer as never, qualityTier: 'potato' }),
    )
    expect(renderer.toneMapping).toBe(0)
    handle.rollback()
    expect(renderer.toneMapping).toBe(4)
  })

  it('tone-map-lite sets LinearToneMapping on low', () => {
    const renderer = { pixelRatio: 1, toneMapping: 4, setPixelRatio() {} }
    toneMapLitePass.apply(baseCtx({ renderer: renderer as never, qualityTier: 'low' }))
    expect(renderer.toneMapping).toBe(1)
  })

  it('tone-map-lite skips when toneMapping is missing or tier is mid/high', () => {
    const missing = { pixelRatio: 1, setPixelRatio() {} }
    toneMapLitePass.apply(baseCtx({ renderer: missing as never, qualityTier: 'potato' }))
    expect('toneMapping' in missing).toBe(false)
    const host = { pixelRatio: 1, toneMapping: 4, setPixelRatio() {} }
    toneMapLitePass.apply(baseCtx({ renderer: host as never, qualityTier: 'mid' }))
    expect(host.toneMapping).toBe(4)
  })

  it('anisotropy-cap lowers texture anisotropy and rollbacks', () => {
    const tex = { anisotropy: 8 }
    const scene = {
      children: [],
      traverse(cb: (o: { material?: { map?: { anisotropy: number } } }) => void) {
        cb({ material: { map: tex } })
      },
    }
    const handle = anisotropyCapPass.apply(
      baseCtx({ scene: scene as never, qualityTier: 'potato' }),
    )
    expect(tex.anisotropy).toBe(1)
    handle.rollback()
    expect(tex.anisotropy).toBe(8)
  })

  it('anisotropy-cap skips objects without anisotropy', () => {
    const mat = { uuid: 'm' }
    const scene = {
      children: [],
      traverse(cb: (o: { material?: { uuid: string } }) => void) {
        cb({ material: mat })
      },
    }
    const handle = anisotropyCapPass.apply(
      baseCtx({ scene: scene as never, qualityTier: 'low' }),
    )
    expect(mat).toEqual({ uuid: 'm' })
    handle.rollback()
  })

  it('shadow-budget potato disables all casters and shadowMap.enabled, then rollbacks', () => {
    const lights = [{ castShadow: true }, { castShadow: true }]
    const renderer = {
      pixelRatio: 1,
      setPixelRatio() {},
      shadowMap: { enabled: true },
    }
    const scene = {
      children: lights,
      traverse(cb: (o: { castShadow?: boolean }) => void) {
        for (const l of lights) cb(l)
      },
    }
    const handle = shadowBudgetPass.apply(
      baseCtx({
        renderer: renderer as never,
        scene: scene as never,
        qualityTier: 'potato',
      }),
    )
    expect(lights.every((l) => l.castShadow === false)).toBe(true)
    expect(renderer.shadowMap.enabled).toBe(false)
    handle.rollback()
    expect(lights.every((l) => l.castShadow)).toBe(true)
    expect(renderer.shadowMap.enabled).toBe(true)
  })

  it('shadow-budget without qualityTier still keeps v1 product budget of 2', () => {
    const lights = [{ castShadow: true }, { castShadow: true }, { castShadow: true }]
    const scene = {
      children: lights,
      traverse(cb: (o: { castShadow?: boolean }) => void) {
        for (const l of lights) cb(l)
      },
    }
    shadowBudgetPass.apply(baseCtx({ scene: scene as never, profile: 'product' }))
    expect(lights.filter((l) => l.castShadow).length).toBe(2)
  })
})
```

Update `packages/core/src/__tests__/exports.test.ts` expected `SAFE_PASSES` to the eight-id list above (still excluding `material-downgrade`).

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @threejs-doctor/runtime test -- src/__tests__/passes.test.ts
pnpm --filter @threejs-doctor/core test -- src/__tests__/exports.test.ts
```

Expected: FAIL — missing modules / `SAFE_PASSES` still the v1 five-id list.

- [ ] **Step 3: Implement passes and wire SAFE_PASSES + registry**

Change `PassId` and `SAFE_PASSES` in `packages/core/src/types.ts` to the eight-id ordered list in Interfaces.

`packages/runtime/src/passes/pixel-budget.ts`:

```ts
import { GENERIC_CAPS } from '@threejs-doctor/core'
import type { OptimizePass } from './types.js'

export const pixelBudgetPass: OptimizePass = {
  id: 'pixel-budget',
  apply(ctx) {
    const renderer = ctx.renderer
    const prevRatio = renderer.pixelRatio
    const prevW = renderer.drawingBufferWidth
    const prevH = renderer.drawingBufferHeight
    const capPixels =
      ctx.qualityTier !== undefined
        ? GENERIC_CAPS[ctx.qualityTier].drawingBufferPixels
        : GENERIC_CAPS.low.drawingBufferPixels
    const restore = () => {
      try {
        if (renderer.setDrawingBufferSize && prevW !== undefined && prevH !== undefined) {
          renderer.setDrawingBufferSize(prevW, prevH, prevRatio)
        } else {
          renderer.setPixelRatio(prevRatio)
        }
      } catch {
        // best-effort
      }
    }
    if (capPixels === undefined) {
      return { rollback() {} }
    }
    const width = renderer.drawingBufferWidth
    const height = renderer.drawingBufferHeight
    if (width === undefined || height === undefined) {
      return { rollback() {} }
    }
    const current = width * height
    if (current <= capPixels) {
      return { rollback() {} }
    }
    const scale = Math.sqrt(capPixels / current)
    const newRatio = Math.min(prevRatio, prevRatio * scale)
    try {
      if (renderer.setDrawingBufferSize) {
        renderer.setDrawingBufferSize(width, height, newRatio)
      } else {
        renderer.setPixelRatio(newRatio)
      }
    } catch (err) {
      restore()
      throw err
    }
    return { rollback: restore }
  },
}
```

When `qualityTier` is omitted (v1 `Doctor.optimize({ apply: ['safe'] })`), using `GENERIC_CAPS.low.drawingBufferPixels` (2.0e6) is the conservative generic cap. That is additive to v1 and must still rollback.

`packages/runtime/src/passes/tone-map-lite.ts`:

```ts
import { GENERIC_CAPS } from '@threejs-doctor/core'
import type { OptimizePass } from './types.js'

export const toneMapLitePass: OptimizePass = {
  id: 'tone-map-lite',
  apply(ctx) {
    if (ctx.renderer.toneMapping === undefined) return { rollback() {} }
    const target =
      ctx.qualityTier !== undefined
        ? GENERIC_CAPS[ctx.qualityTier].toneMapping
        : GENERIC_CAPS.low.toneMapping
    if (target === undefined) return { rollback() {} }
    const prev = ctx.renderer.toneMapping
    try {
      ctx.renderer.toneMapping = target
    } catch (err) {
      ctx.renderer.toneMapping = prev
      throw err
    }
    return {
      rollback() {
        ctx.renderer.toneMapping = prev
      },
    }
  },
}
```

`packages/runtime/src/passes/anisotropy-cap.ts`:

```ts
import { GENERIC_CAPS } from '@threejs-doctor/core'
import type { OptimizePass } from './types.js'

const MAP_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
] as const

export const anisotropyCapPass: OptimizePass = {
  id: 'anisotropy-cap',
  apply(ctx) {
    const cap =
      ctx.qualityTier !== undefined
        ? GENERIC_CAPS[ctx.qualityTier].anisotropy
        : GENERIC_CAPS.low.anisotropy
    if (cap === undefined) return { rollback() {} }
    const touched: Array<{ tex: { anisotropy: number }; prev: number }> = []
    const restore = () => {
      for (const t of touched) t.tex.anisotropy = t.prev
    }
    try {
      ctx.scene.traverse((obj) => {
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
        for (const mat of mats) {
          if (!mat || typeof mat !== 'object') continue
          for (const key of MAP_KEYS) {
            const tex = (mat as Record<string, { anisotropy?: number } | undefined>)[key]
            if (!tex || typeof tex.anisotropy !== 'number') continue
            if (tex.anisotropy <= cap) continue
            touched.push({ tex: tex as { anisotropy: number }, prev: tex.anisotropy })
            tex.anisotropy = cap
          }
        }
      })
    } catch (err) {
      restore()
      throw err
    }
    return { rollback: restore }
  },
}
```

Extend `DoctorObjectLike.material` to allow texture map fields (index signature or `unknown`). Keep traverse working for v1 uuid snapshots.

In `shadow-budget.ts`, when `ctx.qualityTier === 'potato'` and `ctx.renderer.shadowMap` exists, set `shadowMap.enabled = false` and restore the previous boolean on rollback (including apply-throw restore). When `qualityTier` is omitted, do not touch `shadowMap.enabled`.

Register the three new passes in `PASS_REGISTRY` in `doctor.ts` and export them from `packages/runtime/src/index.ts`.

`DoctorObjectLike` material type: change to `unknown` or a broader interface so anisotropy can read `.map.anisotropy` without breaking uuid walks. Snapshot code already treats `material.uuid`.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @threejs-doctor/core test
pnpm --filter @threejs-doctor/runtime test
pnpm --filter @threejs-doctor/bench test
```

Expected: PASS. `doctor.test.ts` still `expect(report.appliedPasses).toEqual([...SAFE_PASSES])` — now eight ids, still no `material-downgrade`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/__tests__/exports.test.ts packages/runtime/src/passes packages/runtime/src/doctor.ts packages/runtime/src/index.ts packages/runtime/src/__tests__/passes.test.ts
git commit -m "feat(runtime): add pixel-budget, tone-map-lite, anisotropy-cap, potato shadows"
```

---

### Task 4: `registerAdapter`, appliedKnobs, unsupportedKnob, extras passthrough

**Files:**
- Modify: `packages/runtime/src/quality-controller.ts`
- Create: `packages/runtime/src/__tests__/quality-adapter.test.ts`
- Modify: `packages/runtime/src/__tests__/quality-controller-boot.test.ts` (safe-auto now calls `adapter.apply` with advertised knobs only)
- Test: `packages/runtime/src/__tests__/quality-adapter.test.ts`

**Interfaces:**
- Consumes: `QualityAdapter`, `ADAPTER_KNOBS`, `QualityKnobSet`, `AdapterCapability`, `AdapterExtras` from core (spec §9 — do not rename methods)
- Produces: `boot()` / later `runLadder()` populate:

```ts
appliedKnobs: AppliedKnob[]
unsupportedKnobs: AdapterCapability[]
// extras copied onto the report/sample only when adapter.readExtras() returns them
```

Controller rules (must be tested):

- Never call `apply` in `advise`
- Never fill extras the adapter did not return
- If `capabilities()` omits `fftSize`, do not pass `fftSize`
- Unsupported keys in the knob set are ignored and recorded on `unsupportedKnobs`
- Reallocating RTs/meshes is the adapter’s job
- `takeover` calls `takeExclusiveControl()` before knobs; `dispose` calls `release()` after rolling knobs back (reverse apply order: knobs → generic passes → exclusive release)
- `readExtras().simPassCount` is copied as-is; if missing, omit the field — **never write 53**

- [ ] **Step 1: Write failing adapter tests**

Create `packages/runtime/src/__tests__/quality-adapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { QualityController } from '../quality-controller.js'
import { createLadderDoctor } from './ladder-harness.js'
import type { QualityAdapter, QualityKnobSet, QualityTier } from '@threejs-doctor/core'

describe('QualityController adapter wiring', () => {
  it('passes only advertised knobs and records unsupportedKnob for unknown keys on the adapter side', async () => {
    const seen: QualityKnobSet[] = []
    const adapter: QualityAdapter = {
      id: 'partial',
      capabilities: () => ['rtScale', 'deferredHdr'],
      snapshot: () => ({ rtScale: 1, deferredHdr: false }),
      apply(_tier: QualityTier, knobs: QualityKnobSet) {
        seen.push(knobs)
        return { rollback() {} }
      },
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(seen).toHaveLength(1)
    expect(seen[0]!.rtScale).toBe(0.35)
    expect(seen[0]!.deferredHdr).toBe(true)
    expect(seen[0]!.fftSize).toBeUndefined()
    expect(seen[0]!.meshLod).toBeUndefined()
    expect(boot.appliedKnobs.map((k) => k.capability).sort()).toEqual([
      'deferredHdr',
      'rtScale',
    ])
    expect(boot.unsupportedKnobs).toEqual([])
  })

  it('records unsupportedKnobs when apply is given a capability the adapter does not implement', async () => {
    const adapter: QualityAdapter = {
      id: 'rt-only',
      capabilities: () => ['rtScale'],
      snapshot: () => ({}),
      apply(_tier, knobs) {
        if (knobs.fftSize) {
          // controller must not do this; test the controller filter, not the adapter
        }
        return { rollback() {} }
      },
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(boot.unsupportedKnobs).not.toContain('rtScale')
    expect(boot.appliedKnobs.some((k) => k.capability === 'fftSize')).toBe(false)
  })

  it('advise never calls adapter.apply', async () => {
    let applies = 0
    const adapter: QualityAdapter = {
      id: 'x',
      capabilities: () => ['fftSize'],
      snapshot: () => ({ fftSize: [128, 256, 128] }),
      apply() {
        applies += 1
        return { rollback() {} }
      },
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'advise' })
    ladder.registerAdapter(adapter)
    await ladder.boot()
    expect(applies).toBe(0)
  })

  it('copies simPassCount from readExtras and never defaults it to 53', async () => {
    const adapter: QualityAdapter = {
      id: 'silent-sim',
      capabilities: () => ['simPassCount'],
      snapshot: () => ({}),
      apply: () => ({ rollback() {} }),
      readExtras: () => ({}),
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(boot.baseline.simPassCount).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(boot.baseline, 'simPassCount')).toBe(false)
    expect(JSON.stringify(boot)).not.toMatch(/"simPassCount":\s*53/)
  })

  it('passthrough extras when readExtras returns simPassCount', async () => {
    const adapter: QualityAdapter = {
      id: 'counted',
      capabilities: () => ['simPassCount'],
      snapshot: () => ({}),
      apply: () => ({ rollback() {} }),
      readExtras: () => ({ simPassCount: 17 }),
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(boot.baseline.simPassCount).toBe(17)
    expect(boot.findings.some((f) => f.id === 'quality/heavy-sim-passes')).toBe(true)
  })

  it('takeover calls takeExclusiveControl and dispose releases it after knob rollback', async () => {
    const order: string[] = []
    const adapter: QualityAdapter = {
      id: 'ex',
      capabilities: () => ['rtScale'],
      snapshot: () => ({}),
      apply() {
        order.push('apply')
        return {
          rollback() {
            order.push('knob-rollback')
          },
        }
      },
      takeExclusiveControl() {
        order.push('take')
        return {
          release() {
            order.push('release')
          },
        }
      },
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'takeover' })
    ladder.registerAdapter(adapter)
    await ladder.boot()
    expect(order).toEqual(['take', 'apply'])
    ladder.dispose()
    expect(order).toEqual(['take', 'apply', 'knob-rollback', 'release'])
  })

  it('rolls back a throwing adapter apply, continues, and sets applyFailed', async () => {
    const adapter: QualityAdapter = {
      id: 'boom',
      capabilities: () => ['fftSize', 'rtScale'],
      snapshot: () => ({}),
      apply(_tier, knobs) {
        if (knobs.fftSize) throw new Error('cannot rebuild cascade')
        return { rollback() {} }
      },
    }
    const { doctor, renderer } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(boot.applyFailed).toBe(true)
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.0)
    expect(boot.appliedKnobs.some((k) => k.capability === 'fftSize')).toBe(false)
  })

  it('sets adapterUnavailable when capabilities are empty', async () => {
    const adapter: QualityAdapter = {
      id: 'gone',
      capabilities: () => [],
      snapshot: () => ({}),
      apply() {
        throw new Error('should not apply')
      },
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(boot.adapterUnavailable).toBe(true)
    expect(boot.appliedPasses.length).toBeGreaterThan(0)
  })
})
```

Add optional `simPassCount?: number` (and the other v2 extras) to `MetricsSample` in `packages/core/src/types.ts`. `MetricsCollector.sample()` must **not** set them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @threejs-doctor/runtime test -- src/__tests__/quality-adapter.test.ts`

Expected: FAIL — `adapter.apply` never called; `simPassCount` not on baseline; exclusive order wrong.

- [ ] **Step 3: Implement knob filtering, extras copy, exclusive control**

Add helper in `quality-controller.ts`:

```ts
function knobsFor(
  tier: QualityTier,
  capabilities: AdapterCapability[],
): { knobs: QualityKnobSet; applied: AppliedKnob[]; unsupported: AdapterCapability[] } {
  const table = ADAPTER_KNOBS[tier]
  const knobs: QualityKnobSet = {}
  const applied: AppliedKnob[] = []
  const advertised = new Set(capabilities)
  const maybeSet = <K extends keyof QualityKnobSet>(key: K, cap: AdapterCapability) => {
    if (!advertised.has(cap)) return
    const value = table[key]
    if (value === undefined) return
    knobs[key] = value as QualityKnobSet[K]
    applied.push({ capability: cap, value })
  }
  maybeSet('fftSize', 'fftSize')
  maybeSet('spectrumEveryNFrames', 'fftSize')
  maybeSet('rtScale', 'rtScale')
  maybeSet('meshLod', 'meshLod')
  maybeSet('deferredHdr', 'deferredHdr')
  return { knobs, applied, unsupported: [] }
}

function copyExtras(sample: MetricsSample, extras: AdapterExtras | undefined): MetricsSample {
  if (!extras) return sample
  const next: MetricsSample = { ...sample }
  if (typeof extras.simPassCount === 'number') next.simPassCount = extras.simPassCount
  if (typeof extras.bytesLoaded === 'number') next.bytesLoaded = extras.bytesLoaded
  if (typeof extras.compileMs === 'number') next.compileMs = extras.compileMs
  return next
}
```

`spectrumEveryNFrames` is part of the `fftSize` capability (same cascade contract). Do not invent a sixth `AdapterCapability`.

In `boot()` after generic passes, if `mode !== 'advise'` and adapter exists:

1. `caps = adapter.capabilities()`
2. If `caps.length === 0`, set `adapterUnavailable: true` and skip apply
3. Else `filtered = knobsFor(startTier, caps)` then `handle = adapter.apply(startTier, filtered.knobs)` inside try/catch; on throw, rollback that handle if any, set `applyFailed`, continue (generic caps stay)
4. Push handle onto `knobHandles`
5. `readExtras?.()` → `copyExtras` onto `report.baseline`
6. If `typeof extras.simPassCount === 'number'`, append finding `quality/heavy-sim-passes` at `info` with `evidence: { simPassCount }` — only when the number was actually returned

`takeover`: call `takeExclusiveControl` **before** generic passes + knobs when the method exists. If it is missing, continue without throwing.

`dispose` order: reverse `knobHandles`, then `doctor.rollbackAll()`, then `exclusive.release()`.

After-measure extras: boot does not invent `compileMs` / `bytesLoaded`. If `PerformanceObserver` is missing, omit `bytesLoaded`. If `renderer.compileAsync` is missing, omit `compileMs`. Optional boot hook:

```ts
private maybeBytesLoaded(bootStart: number): number | undefined {
  const perf = (globalThis as { performance?: { getEntriesByType?: (t: string) => Array<{ transferSize?: number; startTime: number }> } }).performance
  const entries = perf?.getEntriesByType?.('resource')
  if (!entries) return undefined
  let sum = 0
  let any = false
  for (const e of entries) {
    if (e.startTime < bootStart) continue
    if (typeof e.transferSize === 'number') {
      sum += e.transferSize
      any = true
    }
  }
  if (!any) return undefined
  return sum
}
```

Copy onto extras only when `any` is true. Do not use `0` as a sentinel win.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @threejs-doctor/runtime test
pnpm --filter @threejs-doctor/core test
```

Expected: PASS. JSON of an extras-silent boot must not contain `"simPassCount":53`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/runtime/src/quality-controller.ts packages/runtime/src/__tests__/quality-adapter.test.ts packages/runtime/src/__tests__/quality-controller-boot.test.ts
git commit -m "feat(runtime): wire QualityAdapter knobs, extras passthrough, exclusive control"
```

---

### Task 5: `runLadder()` hysteresis against measure windows + overlay second line

**Files:**
- Modify: `packages/runtime/src/quality-controller.ts`
- Create: `packages/runtime/src/overlay/format-quality-hud.ts`
- Modify: `packages/runtime/src/overlay/mount-overlay.ts`
- Modify: `packages/runtime/src/doctor.ts` (`attachQualityHud` paints second line)
- Create: `packages/runtime/src/__tests__/quality-controller-ladder.test.ts`
- Modify: `packages/runtime/src/__tests__/overlay.test.ts`
- Test: `packages/runtime/src/__tests__/quality-controller-ladder.test.ts`
- Test: `packages/runtime/src/__tests__/overlay.test.ts`

**Interfaces:**
- Consumes: `evaluateWindow`, `createHysteresisState`, `HYSTERESIS`, `Doctor.measure(frameCount?)`, adapter apply from Task 4
- Produces:

```ts
export interface QualityHudState {
  score: number
  profile: string
  qualityMode: QualityMode
  startTier: QualityTier
  tier: QualityTier
  ttfiMs?: number
  avgFps?: number
  p95FrameTimeMs?: number
  simPassCount?: number
  bytesLoaded?: number
  exclusive?: boolean
}

export function formatQualityHud(state: QualityHudState): { line1: string; line2: string }

// QualityController.runLadder(): Promise<QualityLadderReport>
// runLadder() without boot() calls boot() first
```

Overlay copy (v2, controller attached):

```
Doctor Score 92 · game · safe-auto · potato→low
TTFI 1840ms · 32 FPS p95=31ms · simPasses 51 · bytes 3.1MB
```

- `advise`: prefix line1 with `ADVISE` and do not mention rollback
- `takeover`: include `exclusive` on line1
- Omit `simPasses` / `bytes` / `TTFI` tokens when those fields are absent
- Score is displayed; copy must not say `healthy` solely because score is 100
- v1 overlay without a controller stays `Doctor Score {n} | {deltas}`

Ladder loop:

1. If not booted, `await this.boot()`
2. `baseline = await doctor.measure(windowFrames)` at current tier (first runtime window)
3. Evaluate hysteresis on that window’s `p95FrameTimeMs`
4. On drop/climb in `safe-auto`/`takeover`: rollback previous knob handle for the rung, `applyPassesImmediate(SAFE_PASSES, { qualityTier: next })` is wrong (would stack caps). Instead apply **delta** by rolling back generic handles via `doctor.rollbackAll()` then re-applying `SAFE_PASSES` at the new tier, then adapter apply for the new tier. Record failed steps. Remeasure one window before another climb.
5. Stop when 3 consecutive **hold** windows at the current tier with `p95 <= 33.4`, or when a drop is requested at `potato` (`floorFailed: true`)
6. `after` = last window sample; `deltas` only for keys present on both baseline and after (skip omitted extras)
7. After-measure throw → `incomplete: true`, keep baseline, no `after`, no `deltas`
8. `advise`: run the same window evaluation but do not apply; set `recommendedTier` to `decision.next.tier` without mutating
9. `safe-auto`: after each window, if host `pixelRatio` exceeds `GENERIC_CAPS[tier].pixelRatio`, clamp back (ceiling)
10. Max 12 windows in unit tests to prevent infinite loops; production may use the same cap as a safety valve (document as 12)

- [ ] **Step 1: Write failing ladder + overlay tests**

Create `packages/runtime/src/__tests__/quality-controller-ladder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { QualityController } from '../quality-controller.js'
import { createLadderDoctor } from './ladder-harness.js'
import { HYSTERESIS } from '@threejs-doctor/core'
import type { QualityAdapter, QualityTier } from '@threejs-doctor/core'

function adapterRecording(applies: QualityTier[]): QualityAdapter {
  return {
    id: 'rec',
    capabilities: () => ['rtScale'],
    snapshot: () => ({}),
    apply(tier) {
      applies.push(tier)
      return { rollback() {} }
    },
  }
}

describe('QualityController.runLadder', () => {
  it('calls boot() first when boot was not invoked', async () => {
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, {
      waitForFirstInteractive: async () => {},
      windowFrames: 4,
    })
    const settled = await ladder.runLadder()
    expect(settled.startTier).toBe('potato')
    expect(settled.phase).toBe('runtime')
  })

  it('drops one tier when two windows miss 30 FPS and does not jump two rungs', async () => {
    const applies: QualityTier[] = []
    let calls = 0
    const { doctor } = createLadderDoctor({
      now: (() => {
        let t = 0
        return () => {
          calls += 1
          // first boot frames 16ms; subsequent measure windows 40ms
          t += calls < 20 ? 16 : 40
          return t
        }
      })(),
      measureFrames: 4,
      device: {
        tier: 'mid',
        maxTextureSize: 8192,
        webgl: true,
        webgpu: false,
        devicePixelRatio: 2,
        hardwareConcurrency: 8,
      },
    })
    const ladder = new QualityController(doctor, {
      mode: 'safe-auto',
      startTier: 'mid',
      maxTier: 'high',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    ladder.registerAdapter(adapterRecording(applies))
    await ladder.boot()
    const settled = await ladder.runLadder()
    expect(settled.tier === 'low' || settled.tier === 'potato').toBe(true)
    expect(settled.tier).not.toBe('high')
    const uniqueJumps = applies.filter((t, i) => i === 0 || t !== applies[i - 1])
    for (let i = 1; i < uniqueJumps.length; i++) {
      const order = ['potato', 'low', 'mid', 'high']
      expect(Math.abs(order.indexOf(uniqueJumps[i]!) - order.indexOf(uniqueJumps[i - 1]!))).toBeLessThanOrEqual(1)
    }
  })

  it('does not climb when still in boot phase windows', async () => {
    const { doctor } = createLadderDoctor({
      now: (() => {
        let t = 0
        return () => {
          t += 16
          return t
        }
      })(),
      measureFrames: 4,
    })
    const ladder = new QualityController(doctor, {
      startTier: 'potato',
      maxTier: 'mid',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    const boot = await ladder.boot()
    expect(boot.tier).toBe('potato')
    const settled = await ladder.runLadder()
    // 16ms frames can climb after boot; assert the boot report itself did not climb
    expect(boot.tier).toBe(boot.startTier)
    expect(settled.phase).toBe('runtime')
  })

  it('sets floorFailed when potato still misses target', async () => {
    const { doctor } = createLadderDoctor({
      now: (() => {
        let t = 0
        return () => {
          t += 50
          return t
        }
      })(),
      measureFrames: 4,
    })
    const ladder = new QualityController(doctor, {
      startTier: 'potato',
      maxTier: 'mid',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    const settled = await ladder.runLadder()
    expect(settled.tier).toBe('potato')
    expect(settled.floorFailed).toBe(true)
  })

  it('advise evaluates recommendations without applying adapter or changing DPR', async () => {
    const applies: QualityTier[] = []
    const { doctor, renderer } = createLadderDoctor({
      now: (() => {
        let t = 0
        return () => {
          t += 50
          return t
        }
      })(),
      measureFrames: 4,
    })
    const dprBefore = renderer.pixelRatio
    const ladder = new QualityController(doctor, {
      mode: 'advise',
      startTier: 'mid',
      maxTier: 'high',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    ladder.registerAdapter(adapterRecording(applies))
    const settled = await ladder.runLadder()
    expect(applies).toEqual([])
    expect(renderer.pixelRatio).toBe(dprBefore)
    expect(settled.recommendedTier).toBeDefined()
  })

  it('marks incomplete and keeps baseline when after-measure throws', async () => {
    let samples = 0
    const { doctor } = createLadderDoctor({
      measureFrames: 4,
      getSceneStats: () => {
        samples += 1
        if (samples > 3) throw new Error('gpu lost')
        return {
          textureCount: 4,
          estimatedVramBytes: 8_000_000,
          geometryCount: 8,
          lightCount: 2,
          shadowCastingLightCount: 2,
        }
      },
    })
    const ladder = new QualityController(doctor, {
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    const settled = await ladder.runLadder()
    expect(settled.incomplete).toBe(true)
    expect(settled.after).toBeUndefined()
    expect(settled.deltas).toBeUndefined()
    expect(settled.baseline).toBeDefined()
  })

  it('reclamps DPR if the host raises it above the safe-auto ceiling', async () => {
    const { doctor, renderer } = createLadderDoctor({ measureFrames: 4 })
    const ladder = new QualityController(doctor, {
      startTier: 'potato',
      maxTier: 'mid',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    await ladder.boot()
    renderer.pixelRatio = 3
    await ladder.runLadder()
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.0)
  })
})
```

Add overlay tests to `packages/runtime/src/__tests__/overlay.test.ts`:

```ts
import { formatQualityHud } from '../overlay/format-quality-hud.js'

describe('quality HUD second line', () => {
  it('formats score, mode, tier path, TTFI, FPS, simPasses, bytes', () => {
    const { line1, line2 } = formatQualityHud({
      score: 92,
      profile: 'game',
      qualityMode: 'safe-auto',
      startTier: 'potato',
      tier: 'low',
      ttfiMs: 1840,
      avgFps: 32,
      p95FrameTimeMs: 31,
      simPassCount: 51,
      bytesLoaded: 3_100_000,
    })
    expect(line1).toBe('Doctor Score 92 · game · safe-auto · potato→low')
    expect(line2).toBe('TTFI 1840ms · 32 FPS p95=31ms · simPasses 51 · bytes 3.1MB')
    expect(line1.toLowerCase()).not.toContain('healthy')
  })

  it('prefixes ADVISE and omits missing extras', () => {
    const { line1, line2 } = formatQualityHud({
      score: 100,
      profile: 'game',
      qualityMode: 'advise',
      startTier: 'potato',
      tier: 'potato',
      avgFps: 28,
      p95FrameTimeMs: 40,
    })
    expect(line1.startsWith('ADVISE ')).toBe(true)
    expect(line2).toBe('28 FPS p95=40ms')
    expect(line2).not.toContain('TTFI')
    expect(line2).not.toContain('simPasses')
    expect(line2).not.toContain('bytes')
  })

  it('marks exclusive for takeover', () => {
    const { line1 } = formatQualityHud({
      score: 80,
      profile: 'game',
      qualityMode: 'takeover',
      startTier: 'low',
      tier: 'low',
      exclusive: true,
    })
    expect(line1).toContain('takeover')
    expect(line1).toContain('exclusive')
  })
})
```

Keep every existing v1 overlay assertion (`Doctor Score ${n} |` and `No after metrics`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @threejs-doctor/runtime test -- src/__tests__/quality-controller-ladder.test.ts src/__tests__/overlay.test.ts`

Expected: FAIL — `runLadder not implemented`; `formatQualityHud` missing.

- [ ] **Step 3: Implement runLadder, HUD formatter, overlay second line**

`packages/runtime/src/overlay/format-quality-hud.ts`:

```ts
export interface QualityHudState {
  score: number
  profile: string
  qualityMode: 'advise' | 'safe-auto' | 'takeover'
  startTier: string
  tier: string
  ttfiMs?: number
  avgFps?: number
  p95FrameTimeMs?: number
  simPassCount?: number
  bytesLoaded?: number
  exclusive?: boolean
}

export function formatQualityHud(state: QualityHudState): { line1: string; line2: string } {
  const tierPath =
    state.startTier === state.tier ? state.tier : `${state.startTier}→${state.tier}`
  let line1 = `Doctor Score ${state.score} · ${state.profile} · ${state.qualityMode} · ${tierPath}`
  if (state.qualityMode === 'advise') line1 = `ADVISE ${line1}`
  if (state.qualityMode === 'takeover' && state.exclusive) line1 += ' · exclusive'
  const parts: string[] = []
  if (state.ttfiMs !== undefined) parts.push(`TTFI ${Math.round(state.ttfiMs)}ms`)
  if (state.avgFps !== undefined && state.p95FrameTimeMs !== undefined) {
    parts.push(`${Math.round(state.avgFps)} FPS p95=${Math.round(state.p95FrameTimeMs)}ms`)
  }
  if (state.simPassCount !== undefined) parts.push(`simPasses ${state.simPassCount}`)
  if (state.bytesLoaded !== undefined) {
    const mb = state.bytesLoaded / 1_000_000
    parts.push(`bytes ${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)}MB`)
  }
  return { line1, line2: parts.join(' · ') }
}
```

`mountOverlay`: add optional `getQualityHud?: () => QualityHudState | undefined`. When it returns a state, `el.textContent = line1 + '\n' + line2` (if line2 is non-empty). When it returns `undefined`, keep v1 `Doctor Score ${score} | ${deltas}` painting.

`Doctor.attachQualityHud` stores the getter and, if the overlay is already mounted, `refresh()`. `mountOverlay` on Doctor passes `getQualityHud` through.

`QualityController` constructor calls `this.doctor.attachQualityHud(() => this.hudState())`.

`runLadder` implementation sketch:

```ts
  async runLadder(): Promise<QualityLadderReport> {
    if (!this.booted) await this.boot()
    const windowFrames = this.options.windowFrames ?? HYSTERESIS.windowFrames
    let state = createHysteresisState({
      tier: this.last!.tier,
      maxTier: this.last!.maxTier,
      phase: 'runtime',
    })
    let baseline: MetricsSample | undefined
    let after: MetricsSample | undefined
    let incomplete = this.last!.incomplete
    let holdsAtTarget = 0
    const maxWindows = 12
    try {
      for (let w = 0; w < maxWindows; w++) {
        if (this.mode !== 'advise') this.clampCeiling(state.tier)
        const sample = await this.doctor.measure(windowFrames)
        if (!baseline) baseline = this.mergeExtras(sample)
        after = this.mergeExtras(sample)
        const decision = evaluateWindow(state, sample.p95FrameTimeMs, {
          applyFailed: this.last!.applyFailed,
        })
        if (this.mode === 'advise') {
          state = { ...decision.next, tier: state.tier }
          this.last = {
            ...this.last!,
            recommendedTier: decision.next.tier,
            baseline,
            incomplete,
          }
          if (sample.p95FrameTimeMs <= HYSTERESIS.dropP95Ms) holdsAtTarget += 1
          else holdsAtTarget = 0
          if (holdsAtTarget >= 3 || decision.reason === 'floor') break
          continue
        }
        if (decision.action === 'drop' || decision.action === 'climb') {
          await this.applyRung(decision.next.tier)
          state = decision.next
          holdsAtTarget = 0
          continue
        }
        state = decision.next
        if (decision.reason === 'floor') {
          this.last = { ...this.last!, floorFailed: true, tier: 'potato' }
          break
        }
        if (sample.p95FrameTimeMs <= HYSTERESIS.dropP95Ms) holdsAtTarget += 1
        else holdsAtTarget = 0
        if (holdsAtTarget >= 3) break
      }
    } catch {
      incomplete = true
      after = undefined
    }
    const report = this.finalize(state, baseline!, after, incomplete)
    this.last = report
    this.doctor.refreshOverlay?.()
    return report
  }
```

`Doctor` needs `refreshOverlay()` that calls `this.overlay?.refresh()`, or `runLadder` relies on diagnose/optimize — add a one-line public `refreshOverlay()` on Doctor.

`applyRung(tier)`:

1. Rollback knob handles reverse
2. `doctor.rollbackAll()`
3. `applyPassesImmediate([...SAFE_PASSES], { qualityTier: tier })`
4. Adapter apply if not advise, same filter as boot
5. Record appliedPasses/knobs/failures onto `this.last`

`clampCeiling(tier)`: if `renderer.pixelRatio > GENERIC_CAPS[tier].pixelRatio`, `setPixelRatio(GENERIC_CAPS[tier].pixelRatio)` (never raise).

`finalize` builds deltas by iterating keys of baseline whose values are `typeof number` **and** the same key is present on `after`. If `after.simPassCount` is missing, do not emit `deltas.simPassCount`.

Bytes display: `3_100_000` → `3.1MB` using decimal 1e6.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @threejs-doctor/runtime test
pnpm --filter @threejs-doctor/core test
pnpm --filter @threejs-doctor/cli test
```

Expected: PASS. v1 overlay tests still see `Doctor Score ${score} |` when no HUD getter is passed.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/quality-controller.ts packages/runtime/src/overlay/format-quality-hud.ts packages/runtime/src/overlay/mount-overlay.ts packages/runtime/src/doctor.ts packages/runtime/src/__tests__/quality-controller-ladder.test.ts packages/runtime/src/__tests__/overlay.test.ts
git commit -m "feat(runtime): run Quality Ladder windows and overlay HUD second line"
```

---

### Task 6: Unpublished `examples/ocean-adapter` wrapping `window.pelagic.debug`

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (root test script includes examples)
- Create: `examples/ocean-adapter/package.json`
- Create: `examples/ocean-adapter/tsconfig.json`
- Create: `examples/ocean-adapter/vitest.config.ts`
- Create: `examples/ocean-adapter/src/pelagic-debug.ts`
- Create: `examples/ocean-adapter/src/pelagic-adapter.ts`
- Create: `examples/ocean-adapter/src/index.ts`
- Create: `examples/ocean-adapter/src/__tests__/pelagic-adapter.test.ts`
- Create: `examples/ocean-adapter/README.md`
- Modify: `README.md` (one paragraph pointing at the example; do not vendor the demo)
- Test: `examples/ocean-adapter/src/__tests__/pelagic-adapter.test.ts`

**Interfaces:**
- Consumes: `QualityAdapter`, `QualityTier`, `QualityKnobSet`, `ADAPTER_KNOBS` from `@threejs-doctor/core`
- Produces:

```ts
export interface PelagicCascadeLike {
  size: number
  dispose?: () => void
  resize?: (n: number) => void
}

export interface PelagicRtLike {
  width: number
  height: number
  setSize(width: number, height: number): void
}

export interface PelagicDebugHandle {
  renderer?: { setPixelRatio?: (n: number) => void; pixelRatio?: number }
  scene?: unknown
  cascades?: Array<PelagicCascadeLike | null | undefined>
  reflectionTarget?: PelagicRtLike
  refractionTarget?: PelagicRtLike
  causticWide?: PelagicRtLike
  causticDetail?: PelagicRtLike
  waterMesh?: { geometry?: unknown }
  terrainMesh?: { geometry?: unknown }
  effectQuality?: number
  runPass?: (...args: unknown[]) => void
  updateSpectrum?: () => void
  dprLoop?: { enabled: boolean }
}

export function getPelagicDebug(root?: unknown): PelagicDebugHandle | undefined

export function createOceanAdapter(debug?: PelagicDebugHandle | null): QualityAdapter
// id: 'ocean-pelagic'
// capabilities(): [] when debug is missing or has no cascades/targets → controller sets adapterUnavailable
```

Desktop reference sizes used **only** inside the adapter (not as report metrics): reflection 768², caustics wide 1024², caustics detail 1536². `rtScale` multiplies those. `fftSize[i] === 0` disposes cascade `i` and records a `1×1` black-texture bind on a `blackBinds: string[]` test spy. `meshLod` `0 | 1 | 2` records requested water/terrain segment pairs `(192,128)/(288,256)/(448,256)` and terrain `192/320/432`. `deferredHdr: true` sets `hdrDeferred = true` on the fake handle. `takeExclusiveControl` freezes `effectQuality` and sets `dprLoop.enabled = false`, restored on `release`. `readExtras().simPassCount` increments a wrapper around `runPass` during `updateSpectrum` if both exist; otherwise **omit** the field.

Do not add `ocean-simulation` as a git submodule, vendor directory, or published package.

- [ ] **Step 1: Write failing adapter tests against a fake debug handle**

`examples/ocean-adapter/src/__tests__/pelagic-adapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createOceanAdapter, getPelagicDebug } from '../pelagic-adapter.js'
import type { PelagicDebugHandle } from '../pelagic-debug.js'

function fakeDebug(): PelagicDebugHandle & { hdrDeferred?: boolean } {
  const rt = (w: number, h: number) => ({
    width: w,
    height: h,
    setSize(nw: number, nh: number) {
      this.width = nw
      this.height = nh
    },
  })
  const debug: PelagicDebugHandle & { hdrDeferred?: boolean } = {
    cascades: [
      { size: 128, dispose() {}, resize(n: number) { this.size = n } },
      { size: 256, dispose() {}, resize(n: number) { this.size = n } },
      { size: 128, dispose() {}, resize(n: number) { this.size = n } },
    ],
    reflectionTarget: rt(768, 768),
    refractionTarget: rt(768, 768),
    causticWide: rt(1024, 1024),
    causticDetail: rt(1536, 1536),
    waterMesh: { geometry: { type: 'clipmap' } },
    terrainMesh: { geometry: { type: 'terrain' } },
    effectQuality: 1,
    dprLoop: { enabled: true },
    runPass() {},
    updateSpectrum() {
      debug.runPass?.()
      debug.runPass?.()
    },
  }
  return debug
}

describe('createOceanAdapter', () => {
  it('returns no capabilities when pelagic.debug is missing', () => {
    const adapter = createOceanAdapter(undefined)
    expect(adapter.id).toBe('ocean-pelagic')
    expect(adapter.capabilities()).toEqual([])
  })

  it('reads window.pelagic.debug via getPelagicDebug', () => {
    const g = globalThis as { pelagic?: { debug: PelagicDebugHandle } }
    const debug = fakeDebug()
    g.pelagic = { debug }
    expect(getPelagicDebug(g)?.reflectionTarget).toBe(debug.reflectionTarget)
    delete g.pelagic
  })

  it('applies potato fftSize [64,0,0], rtScale 0.35, meshLod 0, deferredHdr true', () => {
    const debug = fakeDebug()
    const adapter = createOceanAdapter(debug)
    expect(adapter.capabilities().sort()).toEqual(
      ['deferredHdr', 'fftSize', 'meshLod', 'rtScale', 'simPassCount'].sort(),
    )
    const handle = adapter.apply('potato', {
      fftSize: [64, 0, 0],
      rtScale: 0.35,
      meshLod: 0,
      deferredHdr: true,
    })
    expect(debug.cascades![0]!.size).toBe(64)
    expect(debug.cascades![1]).toBeNull()
    expect(debug.cascades![2]).toBeNull()
    expect(debug.reflectionTarget!.width).toBe(Math.round(768 * 0.35))
    expect(debug.causticWide!.width).toBe(Math.round(1024 * 0.35))
    expect(debug.causticDetail).toBeNull()
    expect(debug.hdrDeferred).toBe(true)
    handle.rollback()
    expect(debug.cascades![1]?.size).toBe(256)
    expect(debug.reflectionTarget!.width).toBe(768)
  })

  it('applies low compact knobs [128,128,128] / 0.50 / lod 1', () => {
    const debug = fakeDebug()
    const adapter = createOceanAdapter(debug)
    adapter.apply('low', {
      fftSize: [128, 128, 128],
      rtScale: 0.5,
      meshLod: 1,
      deferredHdr: true,
    })
    expect(debug.cascades!.map((c) => c?.size)).toEqual([128, 128, 128])
    expect(debug.reflectionTarget!.width).toBe(Math.round(768 * 0.5))
  })

  it('ignores unsupported knob keys without throwing', () => {
    const debug = fakeDebug()
    const adapter = createOceanAdapter(debug)
    expect(() =>
      adapter.apply('mid', { rtScale: 0.7, fftSize: [128, 256, 128] }),
    ).not.toThrow()
  })

  it('readExtras returns simPassCount only after wrapped spectrum work', () => {
    const debug = fakeDebug()
    const adapter = createOceanAdapter(debug)
    expect(adapter.readExtras?.()?.simPassCount).toBeUndefined()
    debug.updateSpectrum?.()
    expect(adapter.readExtras?.()?.simPassCount).toBe(2)
  })

  it('takeExclusiveControl freezes effectQuality and host dpr loop', () => {
    const debug = fakeDebug()
    const adapter = createOceanAdapter(debug)
    debug.effectQuality = 0.8
    const exclusive = adapter.takeExclusiveControl!()
    debug.effectQuality = 1
    expect(debug.effectQuality).toBe(0.8)
    expect(debug.dprLoop!.enabled).toBe(false)
    exclusive.release()
    expect(debug.dprLoop!.enabled).toBe(true)
    debug.effectQuality = 1
    expect(debug.effectQuality).toBe(1)
  })
})
```

`createOceanAdapter` must wrap `runPass` so `readExtras` sees the count even when the host calls the wrapped function. The test expects `2` after `updateSpectrum`.

- [ ] **Step 2: Run tests to verify they fail**

From repo root after adding the workspace package:

Run: `pnpm --filter @threejs-doctor/ocean-adapter-example test`

Expected: FAIL on missing package or missing `createOceanAdapter`.

- [ ] **Step 3: Scaffold the unpublished example and implement the adapter**

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'examples/*'
```

Root `package.json` scripts.test:

```json
"test": "pnpm -r --filter './packages/*' --filter './examples/*' run test"
```

Keep `build` and `typecheck` filtered to `./packages/*` so the example is never published as a dist artifact.

`examples/ocean-adapter/package.json`:

```json
{
  "name": "@threejs-doctor/ocean-adapter-example",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@threejs-doctor/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  }
}
```

`examples/ocean-adapter/tsconfig.json` extends `../../tsconfig.base.json` with `rootDir: src`, `noEmit: true`.

`examples/ocean-adapter/vitest.config.ts`: `environment: 'node'`, alias `@threejs-doctor/core` to `../../packages/core/src/index.ts`.

Implement `createOceanAdapter`:

- Snapshot stores previous cascade sizes, RT sizes, `effectQuality`, `dprLoop.enabled`, `hdrDeferred`, cascade object identities for rollback
- `apply` is synchronous; throw on missing `setSize` when `rtScale` was requested and the target exists
- When `fftSize[i] === 0`, `dispose?.()` cascade i, set slot to `null`
- When rolling back a disposed cascade, restore the previous object and size (keep the disposed instance in the snapshot)
- `getPelagicDebug(root = globalThis)` reads `(root as { pelagic?: { debug?: PelagicDebugHandle } }).pelagic?.debug`
- If debug is missing: `capabilities()` returns `[]`; `apply` returns `{ rollback() {} }` without throwing; `readExtras` returns `{}`

`examples/ocean-adapter/README.md` must include:

1. Live demo URL `https://iamtechartist.github.io/ocean-simulation/`
2. This repo does **not** vendor the demo
3. Snippet: construct `Doctor` + `QualityController` + `createOceanAdapter(getPelagicDebug())`, `boot()`, `runLadder()`, `JSON.stringify` the report
4. If `pelagic.debug` is missing, document `adapterUnavailable: true` and generic-caps-only
5. `scan` is not an acceptance path

Root README: add one sentence after the runtime example pointing to `examples/ocean-adapter/README.md`.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm install
pnpm --filter @threejs-doctor/ocean-adapter-example test
pnpm test
```

Expected: PASS. `pnpm build` still only builds `packages/*`.

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml package.json examples/ocean-adapter README.md pnpm-lock.yaml
git commit -m "feat(examples): add unpublished ocean QualityAdapter wrapping pelagic.debug"
```

---

### Task 7: Live acceptance schema and phone-capture docs (no invented FPS)

**Files:**
- Create: `docs/superpowers/acceptance/quality-ladder-report.schema.json`
- Create: `docs/superpowers/acceptance/live-ocean-capture.md`
- Create: `packages/runtime/src/__tests__/acceptance-schema.test.ts`
- Modify: `packages/cli/src/__tests__/cli.test.ts` (assert `runScan` remains score 100 / empty findings)
- Modify: `README.md` (how to capture; scan is non-authoritative)
- Modify: `.github/workflows/ci.yml` only if you must prove **no** GPU job was added — the existing file stays as-is; the test below reads it
- Test: `packages/runtime/src/__tests__/acceptance-schema.test.ts`
- Test: `packages/cli/src/__tests__/cli.test.ts`
- Test: `packages/cli/src/__tests__/ci-gate.test.ts` (already forbids extra GPU jobs implicitly by snapshotting workflow commands)

**Interfaces:**
- Consumes: `QualityLadderReport` field names from Task 2
- Produces: JSON Schema + capture runbook. **No checked-in live `avgFps` / `ttfiMs` numbers.** Headless CI does not gate TTFI or 30 FPS.

Required schema properties (always present once the ladder runs): `qualityMode`, `phase`, `tier`, `startTier`, `maxTier`, `score`, `findings`, `baseline`, `appliedPasses`, `appliedKnobs`, `failedPasses`, `unsupportedKnobs`, `floorFailed`, `applyFailed`, `incomplete`.

Optional (omit or absent, **not** typed as required): `ttfiMs`, `after`, `deltas`, `adapterUnavailable`, `recommendedTier`, and on samples `simPassCount`, `bytesLoaded`, `compileMs`, `drawingBufferPixels`.

v1 sample fields on `baseline` remain required numbers: `avgFps`, `p95FrameTimeMs`, `drawCalls`, `triangles`, `textureCount`, `estimatedVramBytes`, `geometryCount`, `lightCount`, `shadowCastingLightCount`.

- [ ] **Step 1: Write failing schema-guard tests**

Create `packages/runtime/src/__tests__/acceptance-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const acceptanceDir = resolve(process.cwd(), '../../docs/superpowers/acceptance')

describe('live acceptance artifacts', () => {
  it('checks in a JSON schema and forbids capture JSON with invented numbers', () => {
    const files = readdirSync(acceptanceDir)
    expect(files).toContain('quality-ladder-report.schema.json')
    expect(files).toContain('live-ocean-capture.md')
    for (const f of files) {
      if (f.endsWith('.json') && f !== 'quality-ladder-report.schema.json') {
        throw new Error(`do not check in capture JSON (${f}); store schema only`)
      }
    }
    const schema = JSON.parse(
      readFileSync(resolve(acceptanceDir, 'quality-ladder-report.schema.json'), 'utf8'),
    ) as {
      required: string[]
      properties: Record<string, unknown>
    }
    expect(schema.required).toEqual(
      expect.arrayContaining([
        'qualityMode',
        'phase',
        'tier',
        'score',
        'baseline',
        'incomplete',
      ]),
    )
    expect(schema.required).not.toContain('ttfiMs')
    expect(schema.required).not.toContain('simPassCount')
    expect(schema.required).not.toContain('after')
    const schemaText = JSON.stringify(schema)
    expect(schemaText).not.toContain('62.5')
    expect(schemaText).not.toMatch(/"avgFps":\s*3[0-9]/)
  })

  it('CI workflow stays headless (no gpu / playwright live job)', () => {
    const yml = readFileSync(resolve(process.cwd(), '../../.github/workflows/ci.yml'), 'utf8')
    expect(yml).toContain('node-version: 22')
    expect(yml).not.toMatch(/playwright/i)
    expect(yml).not.toMatch(/ocean-simulation/)
  })
})
```

Add to `packages/cli/src/__tests__/cli.test.ts` inside the existing `runScan` test:

```ts
  it('runScan remains a non-authoritative stub (score 100, empty findings, zero baseline)', async () => {
    const report = await runScan({ ...defaultArgs, profile: 'game' })
    expect(report.score).toBe(100)
    expect(report.findings).toEqual([])
    expect(report.baseline.avgFps).toBe(0)
    expect(report.appliedPasses).toEqual([])
    expect(report.mode).toBe('diagnose')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @threejs-doctor/runtime test -- src/__tests__/acceptance-schema.test.ts
pnpm --filter @threejs-doctor/cli test -- src/__tests__/cli.test.ts
```

Expected: FAIL — `docs/superpowers/acceptance` missing.

- [ ] **Step 3: Write schema + capture runbook (no live numbers)**

`docs/superpowers/acceptance/quality-ladder-report.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/codergeeta/threejs-doctor/docs/superpowers/acceptance/quality-ladder-report.schema.json",
  "title": "QualityLadderReport",
  "type": "object",
  "additionalProperties": true,
  "required": [
    "qualityMode",
    "phase",
    "tier",
    "startTier",
    "maxTier",
    "score",
    "findings",
    "baseline",
    "appliedPasses",
    "appliedKnobs",
    "failedPasses",
    "unsupportedKnobs",
    "floorFailed",
    "applyFailed",
    "incomplete"
  ],
  "properties": {
    "qualityMode": { "enum": ["advise", "safe-auto", "takeover"] },
    "phase": { "enum": ["boot", "runtime"] },
    "tier": { "enum": ["potato", "low", "mid", "high"] },
    "startTier": { "enum": ["potato", "low", "mid", "high"] },
    "maxTier": { "enum": ["potato", "low", "mid", "high"] },
    "score": { "type": "integer", "minimum": 0, "maximum": 100 },
    "findings": { "type": "array" },
    "baseline": { "$ref": "#/$defs/metricsSample" },
    "after": { "$ref": "#/$defs/metricsSample" },
    "deltas": { "type": "object" },
    "appliedPasses": { "type": "array", "items": { "type": "string" } },
    "appliedKnobs": { "type": "array" },
    "failedPasses": { "type": "array" },
    "unsupportedKnobs": { "type": "array", "items": { "type": "string" } },
    "floorFailed": { "type": "boolean" },
    "applyFailed": { "type": "boolean" },
    "incomplete": { "type": "boolean" },
    "ttfiMs": { "type": "number" },
    "adapterUnavailable": { "type": "boolean" },
    "recommendedTier": { "enum": ["potato", "low", "mid", "high"] },
    "profile": { "type": "string" },
    "mode": { "type": "string" }
  },
  "$defs": {
    "metricsSample": {
      "type": "object",
      "required": [
        "avgFps",
        "p95FrameTimeMs",
        "drawCalls",
        "triangles",
        "textureCount",
        "estimatedVramBytes",
        "geometryCount",
        "lightCount",
        "shadowCastingLightCount"
      ],
      "properties": {
        "avgFps": { "type": "number" },
        "p95FrameTimeMs": { "type": "number" },
        "drawCalls": { "type": "number" },
        "triangles": { "type": "number" },
        "textureCount": { "type": "number" },
        "estimatedVramBytes": { "type": "number" },
        "geometryCount": { "type": "number" },
        "lightCount": { "type": "number" },
        "shadowCastingLightCount": { "type": "number" },
        "simPassCount": { "type": "number" },
        "bytesLoaded": { "type": "number" },
        "compileMs": { "type": "number" },
        "drawingBufferPixels": { "type": "number" },
        "ttfiMs": { "type": "number" }
      }
    }
  }
}
```

`docs/superpowers/acceptance/live-ocean-capture.md` — write the full runbook with these sections (no example FPS/TTFI numbers anywhere in the file):

1. **Device class for the bar** — copy the bullet list from spec §3 (mobile UA / coarse pointer / maxTouchPoints, deviceMemory ≤ 4 when reported else unknown mobile as this class, hardwareConcurrency ≤ 8, no WebGPU, CSS ~360×800, DPR ≥ 2, cold cache preferred).
2. **Fixture** — live URL only; do not clone the demo into this repo.
3. **Attach** — load `@threejs-doctor/runtime` + `createOceanAdapter(getPelagicDebug())` from `examples/ocean-adapter` as in that README; `profile: 'game'`.
4. **Pass A (`advise`)** — `new QualityController(doctor, { mode: 'advise' })`, `boot()`, `runLadder()`, `JSON.stringify(report)`. Expect score may already be high; FPS/TTFI are the story. Save the file **off-repo** (phone Files app / AirDrop).
5. **Pass B (`safe-auto`)** — cold load, same camera path, `mode: 'safe-auto'`, record `ttfiMs` and settled windows. Compare to the bar: `ttfiMs < 3000`, then 3 windows with `avgFps ≥ 30` and `p95FrameTimeMs ≤ 33.4`. Visible work: at least one of `simPassCount`, drawing-buffer pixels, RT pixel count, or triangles-across-views moved; score-only does not count.
6. **Incomplete runs** — if after-measure fails or WebGL is missing, keep baseline, set `incomplete: true`, **do not paste fixture or guessed numbers** into notes.
7. **Validate** — paste the saved JSON into a JSON Schema validator against `quality-ladder-report.schema.json`.
8. **CI** — GitHub Actions does not run this. `npx threejs-doctor scan` is a stub. `bench` / `ci` stay headless scene-stat gates.

README: next to the existing v1 bench table disclaimer, add one line: live Quality Ladder proof is captured per `docs/superpowers/acceptance/live-ocean-capture.md`; never invent after metrics.

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
pnpm --filter @threejs-doctor/runtime test -- src/__tests__/acceptance-schema.test.ts
pnpm --filter @threejs-doctor/cli test
pnpm typecheck
pnpm test
```

Expected: PASS. Workflow file still has `node-version: 22` and no Playwright job.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/acceptance packages/runtime/src/__tests__/acceptance-schema.test.ts packages/cli/src/__tests__/cli.test.ts README.md
git commit -m "docs: add live Quality Ladder acceptance schema and capture runbook"
```

---

### Task 8 (OPTIONAL / YAGNI): R3F `qualityMode`, bench null load fields, fake host-loop takeover

**Skip this task** unless Tasks 0–7 are already merged **and** a caller needs `DoctorCanvas` to construct the ladder. Spec §15 phase 8 is stretch. Vanilla `QualityController` in `useEffect` next to `useDoctor()` is the supported R3F path after Task 5.

**Files (only if executing):**
- Modify: `packages/r3f/src/DoctorCanvas.tsx`
- Modify: `packages/r3f/src/useDoctor.ts`
- Modify: `packages/r3f/src/index.ts`
- Modify: `packages/r3f/src/__tests__/DoctorCanvas.test.tsx`
- Create: `packages/r3f/src/__tests__/qualityMode.test.tsx`
- Modify: `packages/cli/src/report/json.ts` (optional `ttfiMs` / `bytesLoaded` keys as JSON `null` **only** on bench reports, never filled from fixtures)
- Create: `packages/runtime/src/__tests__/takeover-host-loop.test.ts`
- Test: `packages/r3f/src/__tests__/qualityMode.test.tsx`
- Test: `packages/runtime/src/__tests__/takeover-host-loop.test.ts`

**Interfaces:**
- Consumes: `QualityController`, `QualityAdapter`, `QualityMode` from runtime/core
- Produces:

```tsx
export interface DoctorCanvasProps extends Omit<CanvasProps, 'children'> {
  profile?: Profile
  mode?: Mode
  showOverlay?: boolean
  qualityMode?: QualityMode
  adapter?: QualityAdapter
  children?: React.ReactNode
}

export interface DoctorContextValue {
  doctor: Doctor | null
  ladder: QualityController | null
  report: DoctorReport | null
  ladderReport: QualityLadderReport | null
  runDiagnose(): Promise<DoctorReport>
  runOptimize(apply?: Array<'safe' | PassId>): Promise<DoctorReport>
  runLadder(): Promise<QualityLadderReport>
}
```

When `qualityMode` is omitted, `ladder` is `null` and v1 `DoctorCanvas` behavior is unchanged.

- [ ] **Step 1: Write failing R3F + host-loop tests**

`packages/r3f/src/__tests__/qualityMode.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('@react-three/fiber', () => {
  const three = {
    scene: { children: [], traverse() {} },
    camera: {},
    gl: {
      info: { render: { calls: 1, triangles: 10 }, memory: { geometries: 1, textures: 1 } },
      getPixelRatio: () => 1,
      setPixelRatio() {},
      pixelRatio: 1,
    },
  }
  return {
    Canvas: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="r3f-canvas">{children}</div>
    ),
    useThree: () => three,
  }
})

import { DoctorCanvas } from '../DoctorCanvas.js'
import { useDoctor } from '../useDoctor.js'

function Probe() {
  const ctx = useDoctor()
  return (
    <div>
      <span data-testid="has-ladder">{String(ctx.ladder !== null)}</span>
    </div>
  )
}

describe('DoctorCanvas qualityMode', () => {
  it('does not construct a ladder when qualityMode is omitted', () => {
    render(
      <DoctorCanvas profile="game">
        <Probe />
      </DoctorCanvas>,
    )
    expect(screen.getByTestId('has-ladder').textContent).toBe('false')
  })

  it('constructs a QualityController when qualityMode is set', () => {
    render(
      <DoctorCanvas profile="game" qualityMode="advise">
        <Probe />
      </DoctorCanvas>,
    )
    expect(screen.getByTestId('has-ladder').textContent).toBe('true')
  })
})
```

`packages/runtime/src/__tests__/takeover-host-loop.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { QualityController } from '../quality-controller.js'
import { createLadderDoctor } from './ladder-harness.js'
import type { QualityAdapter } from '@threejs-doctor/core'

describe('takeover fake host loop', () => {
  it('pauses host effectQuality lerp until dispose', async () => {
    let frozen = false
    let stored = 0.55
    const host = {
      get effectQuality() {
        return stored
      },
      set effectQuality(v: number) {
        if (!frozen) stored = v
      },
    }
    const adapter: QualityAdapter = {
      id: 'host',
      capabilities: () => ['rtScale'],
      snapshot: () => ({}),
      apply: () => ({ rollback() {} }),
      takeExclusiveControl() {
        frozen = true
        return {
          release() {
            frozen = false
          },
        }
      },
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'takeover' })
    ladder.registerAdapter(adapter)
    await ladder.boot()
    host.effectQuality = 1
    expect(host.effectQuality).toBe(0.55)
    ladder.dispose()
    host.effectQuality = 1
    expect(host.effectQuality).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @threejs-doctor/r3f test -- src/__tests__/qualityMode.test.tsx
pnpm --filter @threejs-doctor/runtime test -- src/__tests__/takeover-host-loop.test.ts
```

Expected: FAIL — `qualityMode` not on `DoctorCanvasProps`; `ctx.ladder` missing.

- [ ] **Step 3: Minimal implementation**

`DoctorCanvas`: if `qualityMode` is passed, `new QualityController(d, { mode: qualityMode })`, `registerAdapter(adapter)` when provided, `dispose` on unmount. `useDoctor` exposes `ladder` / `runLadder`. When omitted, do not import-construct the controller.

Bench JSON: only if CLI tests require keys to exist, emit `ttfiMs: null` and `bytesLoaded: null` on **bench** reports. Fixtures must not put real TTFI/FPS from the mock clock into those keys. Do not change `scan` stub shape.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @threejs-doctor/r3f test && pnpm --filter @threejs-doctor/runtime test && pnpm --filter @threejs-doctor/cli test`

Expected: PASS. Existing `DoctorCanvas` child render test still passes without `qualityMode`.

- [ ] **Step 5: Commit**

```bash
git add packages/r3f packages/runtime/src/__tests__/takeover-host-loop.test.ts packages/cli/src/report/json.ts
git commit -m "feat(r3f): optional qualityMode ladder wiring (stretch)"
```

---

## Spec coverage self-check

| Spec section | Task(s) |
|--------------|---------|
| Locked product table (pipeline, modes, hybrid, architecture, ocean acceptance, headless) | Header + Global Constraints |
| §1 ocean cost centers / false 100 score | Global Constraints; Task 4 extras; Task 7 bar |
| §2 goals / non-goals (no split packages, no static rewrite, no ocean vendor, no scan, no WebGPU-only) | Global Constraints; Task 6 example; Task 7 scan stub |
| §3 success bar, modes table, incomplete contract, visible-work rule | Tasks 2, 5, 7 |
| §4 architecture diagram, package layout, Doctor vs QualityController | File map; Tasks 0–5 |
| §5 tiers, generic caps, adapter knobs, hysteresis, dual-controller, potato never climbs to high | Tasks 0, 3, 4, 5 |
| §6 boot vs runtime loop, markBootStart, TTFI, compileMs omit, bytes omit | Tasks 2, 4, 5 |
| §7 quality modes vs v1 Doctor modes, rollback-all, default safe-auto | Tasks 2, 4 |
| §8 v1 passes + v2 pixel/tone/anisotropy, safe order, no generic FFT/RT walk, boot does not call optimize | Tasks 2, 3 |
| §9 QualityAdapter TypeScript contract + ocean mapping + degrade to generic | Tasks 0, 4, 6 |
| §10 metrics required + optional omit, never invent, appliedKnobs/unsupported/floorFailed | Tasks 4, 5, 7 |
| §11 probe inputs, no WEBGL_debug_renderer_info, resolveStartTier table, classifyTier untouched | Task 1 |
| §12 public API sketches (QualityController, boot, runLadder, setMode, dispose, registerAdapter) | Tasks 2, 4, 5 |
| §12 R3F qualityMode | Task 8 optional / YAGNI |
| §13 overlay second line; CLI scan stub; bench not live proof; ci does not gate TTFI | Tasks 5, 7 |
| §14 unit hysteresis/modes/metrics/probe/passes; live ocean not in GHA; CI stays green | Tasks 0–5, 7 |
| §15 phases 0–7 shippable; phase 8 stretch | Tasks 0–7 required; Task 8 skippable |
| §16 defaults: no nightly Playwright; missing pelagic.debug → generic; compileAsync omit; potato still looks like water; do not publish ocean adapter | Tasks 6–7; Task 8 skip |
| Open/non-goals: no glTF, no shader rewrite, no scan AST | Global Constraints |

**Placeholder scan:** no TBD / TODO / “implement later” / “similar to Task N” steps remain. Every code step includes concrete TypeScript.

**Type consistency:** `QualityTier`, `QualityMode`, `QualityAdapter`, `QualityKnobSet`, `AdapterCapability`, `AdapterExtras`, `KnobHandle`, `QualityController`, `QualityLadderReport`, `PassId`, `SAFE_PASSES`, `MetricsSample`, `Doctor`, `evaluateWindow`, `resolveStartTier` are the same names from spec §9 / §11 / §12 through every task.

**Gaps vs spec (intentional):**

- Optional rules package finding `quality/heavy-sim-passes` is emitted by `QualityController` when extras actually include `simPassCount` (Task 4), rather than a new `@threejs-doctor/rules` file — same report shape, no new success bar.
- `drawingBufferPixels` on samples is filled when the renderer exposes drawing-buffer dimensions (pixel-budget tests + controller finalize); omitted otherwise.
- Sliced `compileAsync` after TTFI is specified as omit-if-missing (Task 4); no fake compile timings.
- Task 8 (R3F `qualityMode`, bench null load fields, extra host-loop test) is explicitly YAGNI until 0–7 ship.
- Human CLI printer is not required for live attach (JSON from `JSON.stringify(report)`); overlay covers the HUD copy.

**Stop conditions from spec §15:** hysteresis tests fail → stop after Task 0; v1 probe tests regress → stop after Task 1; TTFI not recorded on fake first-frame hook → stop after Task 2; rollback tests fail → stop after Task 3; controller fills extras itself → stop after Task 4; climb during boot or two-rung jumps → stop after Task 5; forking ocean-simulation into the repo → stop after Task 6; checking in invented FPS → stop after Task 7.
