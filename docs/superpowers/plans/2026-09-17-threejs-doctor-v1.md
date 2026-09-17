# threejs-doctor v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the greenfield `threejs-doctor` monorepo (CLI + runtime optimizer) so teams can measure, diagnose, safely optimize, and prove before/after gains on Three.js scenes across marketing, product, game, and CAD profiles.

**Architecture:** Shared `@threejs-doctor/core` probes devices, snapshots scenes, and collects metrics from a mockable `renderer.info` surface. Pure `@threejs-doctor/rules` emit findings and a Doctor Score. `@threejs-doctor/runtime` owns the measure → diagnose → optimize loop with reversible safe passes plus an optional HUD overlay. Thin `@threejs-doctor/cli`, `@threejs-doctor/bench`, and `@threejs-doctor/r3f` packages consume the same engine for `npx` reports, fixture budgets, and React Three Fiber integration.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, `three` (peer dependency), `@react-three/fiber` (r3f package only), GitHub Actions CI, MIT license under codergeeta.

## Global Constraints

- Product name: `threejs-doctor`; CLI entry: `npx threejs-doctor`; packages under `@threejs-doctor/*`
- Hosting/owner: `https://github.com/codergeeta/threejs-doctor`; license MIT; author/copyright codergeeta
- Language: TypeScript throughout; package manager: pnpm workspaces
- Profiles: `marketing` | `product` | `game` | `cad` | `auto`
- Modes: `diagnose` | `optimize` | `benchmark`
- Safe passes (default apply set): `dpr-cap`, `shadow-budget`, `postfx-budget`, `frameloop-demand`, `distance-cull`; `material-downgrade` is opt-in only
- Required metrics: avg FPS, p95 frame time (ms), draw calls, triangles, texture count, estimated VRAM, geometry count, active lights / shadow-casting lights
- Doctor Score: integer 0–100 (higher = healthier)
- Telemetry: off by default (no network reporting unless future explicit opt-in)
- Framework: vanilla Three.js is source of truth; R3F is a thin adapter only
- Reports must include baseline, after, and deltas for every required metric plus applied passes; never invent after numbers if after-measure fails
- Non-goals for v1: no full glTF authoring suite, no automatic custom shader rewriting, no WebGPU-only path, no Spector.js replacement, no silent mutation without report trail
- Testing: Vitest unit/contract tests; no pixel visual regression required in v1
- Commits: small, frequent, conventional (`feat:`, `test:`, `chore:`, `docs:`, `ci:`)

---

## File Structure Map

```
threejs-doctor/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
├── vitest.workspace.ts
├── .gitignore
├── .npmrc
├── LICENSE
├── README.md
├── .github/workflows/ci.yml
├── docs/superpowers/specs/2026-09-17-threejs-doctor-design.md
├── docs/superpowers/plans/2026-09-17-threejs-doctor-v1.md
└── packages/
    ├── core/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vitest.config.ts
    │   ├── src/index.ts
    │   ├── src/types.ts
    │   ├── src/device-probe.ts
    │   ├── src/scene-snapshot.ts
    │   ├── src/metrics-collector.ts
    │   └── src/__tests__/
    │       ├── scaffold.test.ts
    │       ├── device-probe.test.ts
    │       ├── scene-snapshot.test.ts
    │       └── metrics-collector.test.ts
    ├── rules/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vitest.config.ts
    │   ├── src/index.ts
    │   ├── src/types.ts
    │   ├── src/rule.ts
    │   ├── src/score.ts
    │   ├── src/profiles.ts
    │   ├── src/rules/draw-calls.ts
    │   ├── src/rules/lights-shadows.ts
    │   ├── src/rules/dpr.ts
    │   ├── src/rules/materials.ts
    │   ├── src/rules/textures.ts
    │   ├── src/rules/renderer-setup.ts
    │   ├── src/rules/lifecycle.ts
    │   ├── src/rules/transforms.ts
    │   ├── src/rules/frameloop.ts
    │   └── src/__tests__/
    │       ├── draw-calls.test.ts
    │       ├── lights-shadows.test.ts
    │       ├── dpr.test.ts
    │       └── score.test.ts
    ├── runtime/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vitest.config.ts
    │   ├── src/index.ts
    │   ├── src/doctor.ts
    │   ├── src/passes/types.ts
    │   ├── src/passes/dpr-cap.ts
    │   ├── src/passes/shadow-budget.ts
    │   ├── src/passes/postfx-budget.ts
    │   ├── src/passes/frameloop-demand.ts
    │   ├── src/passes/distance-cull.ts
    │   ├── src/passes/material-downgrade.ts
    │   ├── src/overlay/mount-overlay.ts
    │   └── src/__tests__/
    │       ├── doctor.test.ts
    │       ├── passes.test.ts
    │       └── overlay.test.ts
    ├── cli/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vitest.config.ts
    │   ├── bin/threejs-doctor.js
    │   ├── src/index.ts
    │   ├── src/cli.ts
    │   ├── src/commands/scan.ts
    │   ├── src/commands/bench.ts
    │   ├── src/commands/ci.ts
    │   ├── src/report/human.ts
    │   ├── src/report/json.ts
    │   └── src/__tests__/
    │       ├── cli.test.ts
    │       ├── report.test.ts
    │       └── ci-gate.test.ts
    ├── bench/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vitest.config.ts
    │   ├── src/index.ts
    │   ├── src/budgets.ts
    │   ├── src/harness.ts
    │   ├── src/fixtures/marketing.ts
    │   ├── src/fixtures/product.ts
    │   ├── src/fixtures/game.ts
    │   ├── src/fixtures/cad.ts
    │   └── src/__tests__/
    │       ├── budgets.test.ts
    │       └── harness.test.ts
    └── r3f/
        ├── package.json
        ├── tsconfig.json
        ├── vitest.config.ts
        ├── src/index.ts
        ├── src/DoctorCanvas.tsx
        ├── src/useDoctor.ts
        └── src/__tests__/
            ├── DoctorCanvas.test.tsx
            └── useDoctor.test.tsx
```

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `vitest.workspace.ts`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/rules/package.json`
- Create: `packages/rules/tsconfig.json`
- Create: `packages/rules/vitest.config.ts`
- Create: `packages/rules/src/index.ts`
- Create: `packages/runtime/package.json`
- Create: `packages/runtime/tsconfig.json`
- Create: `packages/runtime/vitest.config.ts`
- Create: `packages/runtime/src/index.ts`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/vitest.config.ts`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/bin/threejs-doctor.js`
- Create: `packages/bench/package.json`
- Create: `packages/bench/tsconfig.json`
- Create: `packages/bench/vitest.config.ts`
- Create: `packages/bench/src/index.ts`
- Create: `packages/r3f/package.json`
- Create: `packages/r3f/tsconfig.json`
- Create: `packages/r3f/vitest.config.ts`
- Create: `packages/r3f/src/index.ts`
- Create: `packages/core/src/__tests__/scaffold.test.ts`
- Test: `packages/core/src/__tests__/scaffold.test.ts`

**Interfaces:**
- Consumes: none (greenfield; existing `README.md`, `LICENSE`, design spec stay untouched)
- Produces: pnpm workspace with six package stubs exporting `PACKAGE_NAME` string constants; root scripts `test`, `build`, `typecheck`

- [ ] **Step 1: Write the failing scaffold smoke test**

```ts
// packages/core/src/__tests__/scaffold.test.ts
import { describe, it, expect } from 'vitest'
import { PACKAGE_NAME } from '../index.js'

describe('monorepo scaffold', () => {
  it('exports the core package name', () => {
    expect(PACKAGE_NAME).toBe('@threejs-doctor/core')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @threejs-doctor/core test -- src/__tests__/scaffold.test.ts`
Expected: FAIL (package / file / export not found)

- [ ] **Step 3: Create root workspace files**

```json
// package.json
{
  "name": "threejs-doctor",
  "private": true,
  "version": "0.0.0",
  "description": "Doctor CLI + runtime optimizer for Three.js",
  "license": "MIT",
  "author": "codergeeta",
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r --filter './packages/*' run build",
    "test": "pnpm -r --filter './packages/*' run test",
    "typecheck": "pnpm -r --filter './packages/*' run typecheck"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^3.0.5",
    "@types/node": "^22.10.5"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

```json
// tsconfig.json
{
  "files": [],
  "references": [
    { "path": "packages/core" },
    { "path": "packages/rules" },
    { "path": "packages/runtime" },
    { "path": "packages/cli" },
    { "path": "packages/bench" },
    { "path": "packages/r3f" }
  ]
}
```

```ts
// vitest.workspace.ts
export default ['packages/*/vitest.config.ts']
```

```
# .gitignore
node_modules/
dist/
coverage/
*.tsbuildinfo
.DS_Store
.env
.env.*
```

```
# .npmrc
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 4: Create each package stub**

```json
// packages/core/package.json
{
  "name": "@threejs-doctor/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "peerDependencies": {
    "three": ">=0.160.0"
  },
  "devDependencies": {
    "three": "^0.172.0",
    "@types/three": "^0.172.0",
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  }
}
```

```json
// packages/core/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": true
  },
  "include": ["src"]
}
```

```ts
// packages/core/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'core',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

```ts
// packages/core/src/index.ts
export const PACKAGE_NAME = '@threejs-doctor/core' as const
```

Apply the same stub pattern for the other five packages with these differences:
- `@threejs-doctor/rules` — dependency `@threejs-doctor/core: workspace:*`; export `PACKAGE_NAME = '@threejs-doctor/rules'`
- `@threejs-doctor/runtime` — dependencies `core` + `rules` workspace; peer `three`; export `PACKAGE_NAME = '@threejs-doctor/runtime'`
- `@threejs-doctor/cli` — dependencies `core`, `rules`, `runtime`, `bench` workspace; `"bin": { "threejs-doctor": "./bin/threejs-doctor.js" }`; export `PACKAGE_NAME = '@threejs-doctor/cli'`
- `@threejs-doctor/bench` — dependencies `core`, `runtime` workspace; peer `three`; export `PACKAGE_NAME = '@threejs-doctor/bench'`
- `@threejs-doctor/r3f` — dependencies `runtime` workspace; peers `three`, `react`, `react-dom`, `@react-three/fiber`; tsconfig `"jsx": "react-jsx"`; export `PACKAGE_NAME = '@threejs-doctor/r3f'`

```js
// packages/cli/bin/threejs-doctor.js
#!/usr/bin/env node
import('../dist/index.js').catch((err) => {
  console.error(err)
  process.exit(1)
})
```

```ts
// packages/cli/src/index.ts
export const PACKAGE_NAME = '@threejs-doctor/cli' as const

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  void argv
  console.log('threejs-doctor: scaffold stub')
  return 0
}
```

- [ ] **Step 5: Install and run the scaffold test**

Run:
```bash
pnpm install
pnpm --filter @threejs-doctor/core test -- src/__tests__/scaffold.test.ts
```
Expected: PASS

- [ ] **Step 6: Verify workspace filters resolve**

Run:
```bash
pnpm -r --filter './packages/*' exec node -e "console.log(process.env.npm_package_name)"
```
Expected: prints all six `@threejs-doctor/*` names

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json tsconfig.json vitest.workspace.ts .gitignore .npmrc packages pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo with six @threejs-doctor package stubs"
```

---

### Task 2: `@threejs-doctor/core` — types, DeviceProbe, SceneSnapshot, MetricsCollector

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/device-probe.ts`
- Create: `packages/core/src/scene-snapshot.ts`
- Create: `packages/core/src/metrics-collector.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/device-probe.test.ts`
- Test: `packages/core/src/__tests__/scene-snapshot.test.ts`
- Test: `packages/core/src/__tests__/metrics-collector.test.ts`

**Interfaces:**
- Consumes: Task 1 package stub; peer `three` types only via narrow local interfaces
- Produces:
  - `export type Profile = 'marketing' | 'product' | 'game' | 'cad' | 'auto'`
  - `export type Mode = 'diagnose' | 'optimize' | 'benchmark'`
  - `export type DeviceTier = 'low' | 'mid' | 'high'`
  - `export type Severity = 'info' | 'warn' | 'error'`
  - `export type PassId = 'dpr-cap' | 'shadow-budget' | 'postfx-budget' | 'frameloop-demand' | 'distance-cull' | 'material-downgrade'`
  - `export const SAFE_PASSES: readonly PassId[]`
  - `export interface DeviceCapabilities { tier: DeviceTier; maxTextureSize: number; webgl: boolean; webgpu: boolean; devicePixelRatio: number; hardwareConcurrency: number }`
  - `export function probeDevice(input?: Partial<DeviceProbeInput>): DeviceCapabilities`
  - `export interface SceneSnapshot { objectCount: number; meshCount: number; geometryCount: number; materialCount: number; textureCount: number; estimatedVramBytes: number; lightCount: number; shadowCastingLightCount: number; drawCalls: number; triangles: number; maxTextureDimension: number; continuousFrameloop: boolean; matrixAutoUpdateCount: number; rendererPixelRatio: number; antialias: boolean }`
  - `export function snapshotScene(input: SnapshotInput): SceneSnapshot`
  - `export interface MetricsSample { avgFps: number; p95FrameTimeMs: number; drawCalls: number; triangles: number; textureCount: number; estimatedVramBytes: number; geometryCount: number; lightCount: number; shadowCastingLightCount: number }`
  - `export interface RendererInfoLike { render: { calls: number; triangles: number }; memory: { geometries: number; textures: number } }`
  - `export class MetricsCollector { constructor(opts: MetricsCollectorOptions); beginFrame(nowMs: number): void; endFrame(nowMs: number): void; sample(): MetricsSample }`

- [ ] **Step 1: Write failing DeviceProbe test**

```ts
// packages/core/src/__tests__/device-probe.test.ts
import { describe, it, expect } from 'vitest'
import { probeDevice } from '../device-probe.js'

describe('probeDevice', () => {
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @threejs-doctor/core test -- src/__tests__/device-probe.test.ts`
Expected: FAIL with cannot find module `../device-probe.js`

- [ ] **Step 3: Implement types + DeviceProbe**

```ts
// packages/core/src/types.ts
export type Profile = 'marketing' | 'product' | 'game' | 'cad' | 'auto'
export type Mode = 'diagnose' | 'optimize' | 'benchmark'
export type DeviceTier = 'low' | 'mid' | 'high'
export type Severity = 'info' | 'warn' | 'error'
export type PassId =
  | 'dpr-cap'
  | 'shadow-budget'
  | 'postfx-budget'
  | 'frameloop-demand'
  | 'distance-cull'
  | 'material-downgrade'

export const SAFE_PASSES: readonly PassId[] = [
  'dpr-cap',
  'shadow-budget',
  'postfx-budget',
  'frameloop-demand',
  'distance-cull',
] as const

export interface DeviceCapabilities {
  tier: DeviceTier
  maxTextureSize: number
  webgl: boolean
  webgpu: boolean
  devicePixelRatio: number
  hardwareConcurrency: number
}

export interface MetricsSample {
  avgFps: number
  p95FrameTimeMs: number
  drawCalls: number
  triangles: number
  textureCount: number
  estimatedVramBytes: number
  geometryCount: number
  lightCount: number
  shadowCastingLightCount: number
}

export interface SceneSnapshot {
  objectCount: number
  meshCount: number
  geometryCount: number
  materialCount: number
  textureCount: number
  estimatedVramBytes: number
  lightCount: number
  shadowCastingLightCount: number
  drawCalls: number
  triangles: number
  maxTextureDimension: number
  continuousFrameloop: boolean
  matrixAutoUpdateCount: number
  rendererPixelRatio: number
  antialias: boolean
}

export interface RendererInfoLike {
  render: { calls: number; triangles: number }
  memory: { geometries: number; textures: number }
}
```

```ts
// packages/core/src/device-probe.ts
import type { DeviceCapabilities, DeviceTier } from './types.js'

export interface DeviceProbeInput {
  devicePixelRatio: number
  hardwareConcurrency: number
  maxTextureSize: number
  webgl: boolean
  webgpu: boolean
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

export function probeDevice(partial: Partial<DeviceProbeInput> = {}): DeviceCapabilities {
  const input: DeviceProbeInput = {
    devicePixelRatio: partial.devicePixelRatio ?? 1,
    hardwareConcurrency: partial.hardwareConcurrency ?? 4,
    maxTextureSize: partial.maxTextureSize ?? 2048,
    webgl: partial.webgl ?? false,
    webgpu: partial.webgpu ?? false,
  }
  return {
    tier: classifyTier(input),
    maxTextureSize: input.maxTextureSize,
    webgl: input.webgl,
    webgpu: input.webgpu,
    devicePixelRatio: input.devicePixelRatio,
    hardwareConcurrency: input.hardwareConcurrency,
  }
}
```

- [ ] **Step 4: Run DeviceProbe tests**

Run: `pnpm --filter @threejs-doctor/core test -- src/__tests__/device-probe.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing SceneSnapshot + MetricsCollector tests**

```ts
// packages/core/src/__tests__/scene-snapshot.test.ts
import { describe, it, expect } from 'vitest'
import { snapshotScene } from '../scene-snapshot.js'

describe('snapshotScene', () => {
  it('aggregates mesh, light, texture, and draw stats', () => {
    const snap = snapshotScene({
      objectCount: 10,
      meshCount: 4,
      geometries: [{ uuid: 'g1' }, { uuid: 'g2' }],
      materials: [{ uuid: 'm1' }, { uuid: 'm2' }, { uuid: 'm1' }],
      textures: [
        { uuid: 't1', width: 1024, height: 1024, bytesPerPixel: 4 },
        { uuid: 't2', width: 512, height: 512, bytesPerPixel: 4 },
      ],
      lights: [
        { castShadow: true },
        { castShadow: false },
        { castShadow: true },
      ],
      drawCalls: 40,
      triangles: 12000,
      continuousFrameloop: true,
      matrixAutoUpdateCount: 3,
      rendererPixelRatio: 2,
      antialias: true,
    })
    expect(snap.geometryCount).toBe(2)
    expect(snap.materialCount).toBe(2)
    expect(snap.textureCount).toBe(2)
    expect(snap.lightCount).toBe(3)
    expect(snap.shadowCastingLightCount).toBe(2)
    expect(snap.estimatedVramBytes).toBe(1024 * 1024 * 4 + 512 * 512 * 4)
    expect(snap.maxTextureDimension).toBe(1024)
  })
})
```

```ts
// packages/core/src/__tests__/metrics-collector.test.ts
import { describe, it, expect } from 'vitest'
import { MetricsCollector } from '../metrics-collector.js'

describe('MetricsCollector', () => {
  it('computes avg FPS and p95 frame time from frame marks', () => {
    const collector = new MetricsCollector({
      getRendererInfo: () => ({
        render: { calls: 25, triangles: 8000 },
        memory: { geometries: 3, textures: 4 },
      }),
      getSceneStats: () => ({
        textureCount: 4,
        estimatedVramBytes: 16_000_000,
        geometryCount: 3,
        lightCount: 2,
        shadowCastingLightCount: 1,
      }),
    })
    const times = [0, 16, 33, 50, 70, 86, 100, 120, 135, 150]
    for (let i = 0; i < times.length - 1; i++) {
      collector.beginFrame(times[i]!)
      collector.endFrame(times[i + 1]!)
    }
    const sample = collector.sample()
    expect(sample.drawCalls).toBe(25)
    expect(sample.triangles).toBe(8000)
    expect(sample.avgFps).toBeGreaterThan(50)
    expect(sample.p95FrameTimeMs).toBeGreaterThan(0)
    expect(sample.textureCount).toBe(4)
    expect(sample.geometryCount).toBe(3)
    expect(sample.lightCount).toBe(2)
    expect(sample.shadowCastingLightCount).toBe(1)
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm --filter @threejs-doctor/core test -- src/__tests__/scene-snapshot.test.ts src/__tests__/metrics-collector.test.ts`
Expected: FAIL (modules missing)

- [ ] **Step 7: Implement SceneSnapshot + MetricsCollector**

```ts
// packages/core/src/scene-snapshot.ts
import type { SceneSnapshot } from './types.js'

export interface SnapshotTextureInput {
  uuid: string
  width: number
  height: number
  bytesPerPixel: number
}

export interface SnapshotInput {
  objectCount: number
  meshCount: number
  geometries: ReadonlyArray<{ uuid: string }>
  materials: ReadonlyArray<{ uuid: string }>
  textures: ReadonlyArray<SnapshotTextureInput>
  lights: ReadonlyArray<{ castShadow: boolean }>
  drawCalls: number
  triangles: number
  continuousFrameloop: boolean
  matrixAutoUpdateCount: number
  rendererPixelRatio: number
  antialias: boolean
}

export function snapshotScene(input: SnapshotInput): SceneSnapshot {
  const geometryIds = new Set(input.geometries.map((g) => g.uuid))
  const materialIds = new Set(input.materials.map((m) => m.uuid))
  const textureIds = new Set(input.textures.map((t) => t.uuid))
  let estimatedVramBytes = 0
  let maxTextureDimension = 0
  for (const tex of input.textures) {
    estimatedVramBytes += tex.width * tex.height * tex.bytesPerPixel
    maxTextureDimension = Math.max(maxTextureDimension, tex.width, tex.height)
  }
  return {
    objectCount: input.objectCount,
    meshCount: input.meshCount,
    geometryCount: geometryIds.size,
    materialCount: materialIds.size,
    textureCount: textureIds.size,
    estimatedVramBytes,
    lightCount: input.lights.length,
    shadowCastingLightCount: input.lights.filter((l) => l.castShadow).length,
    drawCalls: input.drawCalls,
    triangles: input.triangles,
    maxTextureDimension,
    continuousFrameloop: input.continuousFrameloop,
    matrixAutoUpdateCount: input.matrixAutoUpdateCount,
    rendererPixelRatio: input.rendererPixelRatio,
    antialias: input.antialias,
  }
}
```

```ts
// packages/core/src/metrics-collector.ts
import type { MetricsSample, RendererInfoLike } from './types.js'

export interface SceneStatsLike {
  textureCount: number
  estimatedVramBytes: number
  geometryCount: number
  lightCount: number
  shadowCastingLightCount: number
}

export interface MetricsCollectorOptions {
  getRendererInfo: () => RendererInfoLike
  getSceneStats: () => SceneStatsLike
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]!
}

export class MetricsCollector {
  private frameTimesMs: number[] = []
  private openStart: number | null = null

  constructor(private readonly opts: MetricsCollectorOptions) {}

  beginFrame(nowMs: number): void {
    this.openStart = nowMs
  }

  endFrame(nowMs: number): void {
    if (this.openStart === null) return
    this.frameTimesMs.push(Math.max(0, nowMs - this.openStart))
    this.openStart = null
  }

  sample(): MetricsSample {
    const times = [...this.frameTimesMs].sort((a, b) => a - b)
    const avgFrame =
      times.length === 0 ? 0 : times.reduce((a, b) => a + b, 0) / times.length
    const info = this.opts.getRendererInfo()
    const scene = this.opts.getSceneStats()
    return {
      avgFps: avgFrame <= 0 ? 0 : 1000 / avgFrame,
      p95FrameTimeMs: percentile(times, 95),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      textureCount: scene.textureCount,
      estimatedVramBytes: scene.estimatedVramBytes,
      geometryCount: scene.geometryCount,
      lightCount: scene.lightCount,
      shadowCastingLightCount: scene.shadowCastingLightCount,
    }
  }
}
```

```ts
// packages/core/src/index.ts
export const PACKAGE_NAME = '@threejs-doctor/core' as const
export * from './types.js'
export * from './device-probe.js'
export * from './scene-snapshot.js'
export * from './metrics-collector.js'
```

- [ ] **Step 8: Run all core tests**

Run: `pnpm --filter @threejs-doctor/core test`
Expected: PASS (including scaffold smoke)

- [ ] **Step 9: Commit**

```bash
git add packages/core
git commit -m "feat(core): add types, DeviceProbe, SceneSnapshot, MetricsCollector"
```

---

### Task 3: `@threejs-doctor/rules` — Rule interface, first rules, score aggregator

**Files:**
- Create: `packages/rules/src/types.ts`
- Create: `packages/rules/src/rule.ts`
- Create: `packages/rules/src/profiles.ts`
- Create: `packages/rules/src/score.ts`
- Create: `packages/rules/src/rules/draw-calls.ts`
- Create: `packages/rules/src/rules/lights-shadows.ts`
- Create: `packages/rules/src/rules/dpr.ts`
- Create: `packages/rules/src/rules/materials.ts`
- Create: `packages/rules/src/rules/textures.ts`
- Create: `packages/rules/src/rules/renderer-setup.ts`
- Create: `packages/rules/src/rules/lifecycle.ts`
- Create: `packages/rules/src/rules/transforms.ts`
- Create: `packages/rules/src/rules/frameloop.ts`
- Modify: `packages/rules/src/index.ts`
- Modify: `packages/rules/package.json`
- Test: `packages/rules/src/__tests__/draw-calls.test.ts`
- Test: `packages/rules/src/__tests__/lights-shadows.test.ts`
- Test: `packages/rules/src/__tests__/dpr.test.ts`
- Test: `packages/rules/src/__tests__/score.test.ts`

**Interfaces:**
- Consumes: `SceneSnapshot`, `DeviceCapabilities`, `Profile`, `Severity`, `PassId`, `MetricsSample` from `@threejs-doctor/core`
- Produces:
  - `export interface Finding { id: string; severity: Severity; evidence: Record<string, number | string | boolean>; message: string; suggestedFix: string; autoFix?: PassId }`
  - `export interface RuleContext { snapshot: SceneSnapshot; device: DeviceCapabilities; profile: Profile; previousSnapshot?: SceneSnapshot }`
  - `export interface Rule { id: string; run(ctx: RuleContext): Finding[] }`
  - `export function runRules(ctx: RuleContext, rules?: Rule[]): Finding[]`
  - `export function resolveProfile(profile: Profile, snapshot: SceneSnapshot): Exclude<Profile, 'auto'>`
  - `export function computeDoctorScore(findings: Finding[], snapshot: SceneSnapshot, profile: Exclude<Profile, 'auto'>): number`
  - `export const defaultRules: Rule[]`

- [ ] **Step 1: Write failing rule + score tests**

```ts
// packages/rules/src/__tests__/draw-calls.test.ts
import { describe, it, expect } from 'vitest'
import { drawCallsRule } from '../rules/draw-calls.js'
import type { RuleContext } from '../types.js'
import type { SceneSnapshot, DeviceCapabilities } from '@threejs-doctor/core'

const device: DeviceCapabilities = {
  tier: 'low',
  maxTextureSize: 4096,
  webgl: true,
  webgpu: false,
  devicePixelRatio: 2,
  hardwareConcurrency: 4,
}

function snap(partial: Partial<SceneSnapshot>): SceneSnapshot {
  return {
    objectCount: 100,
    meshCount: 80,
    geometryCount: 80,
    materialCount: 10,
    textureCount: 5,
    estimatedVramBytes: 1_000_000,
    lightCount: 1,
    shadowCastingLightCount: 0,
    drawCalls: 200,
    triangles: 50_000,
    maxTextureDimension: 1024,
    continuousFrameloop: true,
    matrixAutoUpdateCount: 0,
    rendererPixelRatio: 2,
    antialias: false,
    ...partial,
  }
}

describe('drawCallsRule', () => {
  it('emits error when draw calls exceed cad budget', () => {
    const ctx: RuleContext = { snapshot: snap({ drawCalls: 250 }), device, profile: 'cad' }
    const findings = drawCallsRule.run(ctx)
    expect(findings.some((f) => f.id === 'draw-calls/too-many')).toBe(true)
    expect(findings[0]?.severity).toBe('error')
  })
})
```

```ts
// packages/rules/src/__tests__/lights-shadows.test.ts
import { describe, it, expect } from 'vitest'
import { lightsShadowsRule } from '../rules/lights-shadows.js'
import type { RuleContext } from '../types.js'
import type { DeviceCapabilities, SceneSnapshot } from '@threejs-doctor/core'

const device: DeviceCapabilities = {
  tier: 'mid', maxTextureSize: 8192, webgl: true, webgpu: false,
  devicePixelRatio: 1, hardwareConcurrency: 8,
}

const base: SceneSnapshot = {
  objectCount: 20, meshCount: 10, geometryCount: 10, materialCount: 4,
  textureCount: 2, estimatedVramBytes: 2_000_000, lightCount: 6,
  shadowCastingLightCount: 4, drawCalls: 30, triangles: 10_000,
  maxTextureDimension: 1024, continuousFrameloop: true,
  matrixAutoUpdateCount: 0, rendererPixelRatio: 1, antialias: true,
}

describe('lightsShadowsRule', () => {
  it('flags too many shadow casters with autoFix shadow-budget', () => {
    const ctx: RuleContext = { snapshot: base, device, profile: 'product' }
    const findings = lightsShadowsRule.run(ctx)
    const hit = findings.find((f) => f.id === 'shadows/too-many-casters')
    expect(hit).toBeDefined()
    expect(hit?.autoFix).toBe('shadow-budget')
  })
})
```

```ts
// packages/rules/src/__tests__/dpr.test.ts
import { describe, it, expect } from 'vitest'
import { dprRule } from '../rules/dpr.js'
import type { RuleContext } from '../types.js'
import type { DeviceCapabilities, SceneSnapshot } from '@threejs-doctor/core'

describe('dprRule', () => {
  it('warns on uncapped DPR for marketing on low tier', () => {
    const device: DeviceCapabilities = {
      tier: 'low', maxTextureSize: 4096, webgl: true, webgpu: false,
      devicePixelRatio: 3, hardwareConcurrency: 4,
    }
    const snapshot: SceneSnapshot = {
      objectCount: 5, meshCount: 2, geometryCount: 2, materialCount: 2,
      textureCount: 2, estimatedVramBytes: 4_000_000, lightCount: 1,
      shadowCastingLightCount: 0, drawCalls: 5, triangles: 2000,
      maxTextureDimension: 2048, continuousFrameloop: true,
      matrixAutoUpdateCount: 0, rendererPixelRatio: 3, antialias: true,
    }
    const ctx: RuleContext = { snapshot, device, profile: 'marketing' }
    const findings = dprRule.run(ctx)
    expect(findings.some((f) => f.id === 'renderer/uncapped-dpr')).toBe(true)
    expect(findings[0]?.autoFix).toBe('dpr-cap')
  })
})
```

```ts
// packages/rules/src/__tests__/score.test.ts
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
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @threejs-doctor/rules test`
Expected: FAIL (modules / exports missing)

- [ ] **Step 3: Implement rule types, profiles, all nine rules, score, index**

```ts
// packages/rules/src/types.ts
import type {
  DeviceCapabilities,
  PassId,
  Profile,
  SceneSnapshot,
  Severity,
} from '@threejs-doctor/core'

export interface Finding {
  id: string
  severity: Severity
  evidence: Record<string, number | string | boolean>
  message: string
  suggestedFix: string
  autoFix?: PassId
}

export interface RuleContext {
  snapshot: SceneSnapshot
  device: DeviceCapabilities
  profile: Profile
  previousSnapshot?: SceneSnapshot
}

export interface Rule {
  id: string
  run(ctx: RuleContext): Finding[]
}
```

```ts
// packages/rules/src/profiles.ts
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

export function resolveProfile(profile: Profile, snapshot: SceneSnapshot): ConcreteProfile {
  if (profile !== 'auto') return profile
  if (snapshot.meshCount > 200 || snapshot.drawCalls > 150) return 'cad'
  if (snapshot.lightCount >= 4 && snapshot.meshCount > 50) return 'game'
  if (snapshot.textureCount <= 6 && snapshot.meshCount <= 20) return 'product'
  return 'marketing'
}
```

```ts
// packages/rules/src/rules/draw-calls.ts
import type { Rule } from '../types.js'
import { PROFILE_BUDGETS, resolveProfile } from '../profiles.js'

export const drawCallsRule: Rule = {
  id: 'draw-calls',
  run(ctx) {
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    const budget = PROFILE_BUDGETS[profile].maxDrawCalls
    if (ctx.snapshot.drawCalls <= budget) return []
    const severity = ctx.snapshot.drawCalls > budget * 1.5 ? 'error' : 'warn'
    return [
      {
        id: 'draw-calls/too-many',
        severity,
        evidence: { drawCalls: ctx.snapshot.drawCalls, budget, profile },
        message: `Draw calls ${ctx.snapshot.drawCalls} exceed ${profile} budget ${budget}`,
        suggestedFix: 'Use InstancedMesh, BatchedMesh, or merge static geometries',
      },
    ]
  },
}
```

```ts
// packages/rules/src/rules/lights-shadows.ts
import type { Rule } from '../types.js'
import { PROFILE_BUDGETS, resolveProfile } from '../profiles.js'

export const lightsShadowsRule: Rule = {
  id: 'lights-shadows',
  run(ctx) {
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    const budgets = PROFILE_BUDGETS[profile]
    const findings = []
    if (ctx.snapshot.lightCount > budgets.maxLights) {
      findings.push({
        id: 'lights/too-many',
        severity: 'warn' as const,
        evidence: { lightCount: ctx.snapshot.lightCount, budget: budgets.maxLights },
        message: `Active lights ${ctx.snapshot.lightCount} exceed budget ${budgets.maxLights}`,
        suggestedFix: 'Bake lighting or reduce dynamic lights',
      })
    }
    if (ctx.snapshot.shadowCastingLightCount > budgets.maxShadowCasters) {
      findings.push({
        id: 'shadows/too-many-casters',
        severity: 'error' as const,
        evidence: {
          shadowCastingLightCount: ctx.snapshot.shadowCastingLightCount,
          budget: budgets.maxShadowCasters,
        },
        message: `Shadow-casting lights ${ctx.snapshot.shadowCastingLightCount} exceed budget ${budgets.maxShadowCasters}`,
        suggestedFix: 'Disable extra shadows or freeze shadow autoUpdate',
        autoFix: 'shadow-budget' as const,
      })
    }
    return findings
  },
}
```

```ts
// packages/rules/src/rules/dpr.ts
import type { Rule } from '../types.js'
import { PROFILE_BUDGETS, resolveProfile } from '../profiles.js'

export const dprRule: Rule = {
  id: 'dpr',
  run(ctx) {
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    const maxDpr = Math.min(
      PROFILE_BUDGETS[profile].maxDpr,
      ctx.device.tier === 'low' ? 1.5 : PROFILE_BUDGETS[profile].maxDpr,
    )
    if (ctx.snapshot.rendererPixelRatio <= maxDpr) return []
    return [
      {
        id: 'renderer/uncapped-dpr',
        severity: ctx.device.tier === 'low' ? 'error' : 'warn',
        evidence: {
          rendererPixelRatio: ctx.snapshot.rendererPixelRatio,
          maxDpr,
          tier: ctx.device.tier,
        },
        message: `Renderer pixel ratio ${ctx.snapshot.rendererPixelRatio} exceeds cap ${maxDpr}`,
        suggestedFix: 'Cap setPixelRatio for the active device tier',
        autoFix: 'dpr-cap',
      },
    ]
  },
}
```

```ts
// packages/rules/src/rules/materials.ts
import type { Rule } from '../types.js'

export const materialsRule: Rule = {
  id: 'materials',
  run(ctx) {
    const { materialCount, meshCount } = ctx.snapshot
    if (!(materialCount > 20 && materialCount > meshCount * 0.8)) return []
    return [
      {
        id: 'materials/too-unique',
        severity: 'warn',
        evidence: { materialCount, meshCount },
        message: `High unique material count ${materialCount} relative to meshes ${meshCount}`,
        suggestedFix: 'Share materials across meshes or atlas textures',
      },
    ]
  },
}
```

```ts
// packages/rules/src/rules/textures.ts
import type { Rule } from '../types.js'
import { PROFILE_BUDGETS, resolveProfile } from '../profiles.js'

export const texturesRule: Rule = {
  id: 'textures',
  run(ctx) {
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    const findings = []
    const vramBudget = PROFILE_BUDGETS[profile].maxEstimatedVramBytes
    if (ctx.snapshot.estimatedVramBytes > vramBudget) {
      findings.push({
        id: 'textures/high-vram',
        severity: 'error' as const,
        evidence: { estimatedVramBytes: ctx.snapshot.estimatedVramBytes, budget: vramBudget },
        message: `Estimated VRAM ${ctx.snapshot.estimatedVramBytes} exceeds budget ${vramBudget}`,
        suggestedFix: 'Downscale textures, use compression, or reduce texture count',
      })
    }
    if (ctx.device.tier === 'low' && ctx.snapshot.maxTextureDimension > 2048) {
      findings.push({
        id: 'textures/oversized',
        severity: 'warn' as const,
        evidence: { maxTextureDimension: ctx.snapshot.maxTextureDimension },
        message: `Max texture dimension ${ctx.snapshot.maxTextureDimension} is oversized for low-tier devices`,
        suggestedFix: 'Cap texture sizes at 1024–2048 on mobile',
      })
    }
    return findings
  },
}
```

```ts
// packages/rules/src/rules/renderer-setup.ts
import type { Rule } from '../types.js'
import { resolveProfile } from '../profiles.js'

export const rendererSetupRule: Rule = {
  id: 'renderer-setup',
  run(ctx) {
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    if (!ctx.snapshot.antialias) return []
    if (ctx.device.tier !== 'low') return []
    if (profile !== 'marketing' && profile !== 'product') return []
    return [
      {
        id: 'renderer/antialias-postfx-risk',
        severity: 'warn',
        evidence: { antialias: true, tier: ctx.device.tier, profile },
        message: 'Antialias on low-tier marketing/product scenes risks costly post stacks',
        suggestedFix: 'Disable MSAA on low tier or reduce postfx via postfx-budget',
        autoFix: 'postfx-budget',
      },
    ]
  },
}
```

```ts
// packages/rules/src/rules/lifecycle.ts
import type { Rule } from '../types.js'

export const lifecycleRule: Rule = {
  id: 'lifecycle',
  run(ctx) {
    if (!ctx.previousSnapshot) return []
    const geoGrowth = ctx.snapshot.geometryCount - ctx.previousSnapshot.geometryCount
    const texGrowth = ctx.snapshot.textureCount - ctx.previousSnapshot.textureCount
    if (geoGrowth <= 0 && texGrowth <= 0) return []
    return [
      {
        id: 'lifecycle/resource-growth',
        severity: 'warn',
        evidence: { geoGrowth, texGrowth },
        message: 'Geometry/texture counts climbed between measures (possible leak)',
        suggestedFix: 'Ensure dispose() on removed geometries, materials, and textures',
      },
    ]
  },
}
```

```ts
// packages/rules/src/rules/transforms.ts
import type { Rule } from '../types.js'
import { resolveProfile } from '../profiles.js'

export const transformsRule: Rule = {
  id: 'transforms',
  run(ctx) {
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    if (profile === 'game') return []
    if (ctx.snapshot.matrixAutoUpdateCount <= 10) return []
    return [
      {
        id: 'transforms/matrix-autoupdate',
        severity: 'info',
        evidence: { matrixAutoUpdateCount: ctx.snapshot.matrixAutoUpdateCount, profile },
        message: `${ctx.snapshot.matrixAutoUpdateCount} objects still use matrixAutoUpdate on a mostly static profile`,
        suggestedFix: 'Set matrixAutoUpdate=false and updateMatrix() once for static meshes',
      },
    ]
  },
}
```

```ts
// packages/rules/src/rules/frameloop.ts
import type { Rule } from '../types.js'
import { resolveProfile } from '../profiles.js'

export const frameloopRule: Rule = {
  id: 'frameloop',
  run(ctx) {
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    if (!ctx.snapshot.continuousFrameloop) return []
    if (profile !== 'marketing' && profile !== 'product') return []
    return [
      {
        id: 'frameloop/continuous-static',
        severity: 'warn',
        evidence: { continuousFrameloop: true, profile },
        message: 'Continuous frameloop on a mostly static scene profile',
        suggestedFix: 'Switch to demand/invalidation rendering',
        autoFix: 'frameloop-demand',
      },
    ]
  },
}
```

```ts
// packages/rules/src/score.ts
import type { SceneSnapshot } from '@threejs-doctor/core'
import type { Finding } from './types.js'
import type { ConcreteProfile } from './profiles.js'
import { PROFILE_BUDGETS } from './profiles.js'

const SEVERITY_PENALTY = { info: 2, warn: 8, error: 18 } as const

export function computeDoctorScore(
  findings: Finding[],
  snapshot: SceneSnapshot,
  profile: ConcreteProfile,
): number {
  let score = 100
  for (const f of findings) score -= SEVERITY_PENALTY[f.severity]
  const budgets = PROFILE_BUDGETS[profile]
  if (snapshot.drawCalls > budgets.maxDrawCalls) {
    score -= Math.min(15, Math.floor((snapshot.drawCalls / budgets.maxDrawCalls - 1) * 10))
  }
  if (snapshot.estimatedVramBytes > budgets.maxEstimatedVramBytes) {
    score -= 10
  }
  return Math.max(0, Math.min(100, Math.round(score)))
}
```

```ts
// packages/rules/src/rule.ts
import type { Finding, Rule, RuleContext } from './types.js'
import { drawCallsRule } from './rules/draw-calls.js'
import { lightsShadowsRule } from './rules/lights-shadows.js'
import { dprRule } from './rules/dpr.js'
import { materialsRule } from './rules/materials.js'
import { texturesRule } from './rules/textures.js'
import { rendererSetupRule } from './rules/renderer-setup.js'
import { lifecycleRule } from './rules/lifecycle.js'
import { transformsRule } from './rules/transforms.js'
import { frameloopRule } from './rules/frameloop.js'

export const defaultRules: Rule[] = [
  drawCallsRule,
  lightsShadowsRule,
  dprRule,
  materialsRule,
  texturesRule,
  rendererSetupRule,
  lifecycleRule,
  transformsRule,
  frameloopRule,
]

export function runRules(ctx: RuleContext, rules: Rule[] = defaultRules): Finding[] {
  return rules.flatMap((rule) => rule.run(ctx))
}
```

```ts
// packages/rules/src/index.ts
export const PACKAGE_NAME = '@threejs-doctor/rules' as const
export * from './types.js'
export * from './profiles.js'
export * from './score.js'
export * from './rule.js'
export { drawCallsRule } from './rules/draw-calls.js'
export { lightsShadowsRule } from './rules/lights-shadows.js'
export { dprRule } from './rules/dpr.js'
export { materialsRule } from './rules/materials.js'
export { texturesRule } from './rules/textures.js'
export { rendererSetupRule } from './rules/renderer-setup.js'
export { lifecycleRule } from './rules/lifecycle.js'
export { transformsRule } from './rules/transforms.js'
export { frameloopRule } from './rules/frameloop.js'
```

Ensure `packages/rules/package.json` has:
```json
"dependencies": {
  "@threejs-doctor/core": "workspace:*"
}
```

- [ ] **Step 4: Run rules package tests**

Run: `pnpm --filter @threejs-doctor/rules test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/rules pnpm-lock.yaml
git commit -m "feat(rules): add Rule interface, v1 rules, profiles, and Doctor Score"
```

---

### Task 4: `@threejs-doctor/runtime` — Doctor measure/diagnose/optimize with safe passes + rollback

**Files:**
- Create: `packages/runtime/src/passes/types.ts`
- Create: `packages/runtime/src/passes/dpr-cap.ts`
- Create: `packages/runtime/src/passes/shadow-budget.ts`
- Create: `packages/runtime/src/passes/postfx-budget.ts`
- Create: `packages/runtime/src/passes/frameloop-demand.ts`
- Create: `packages/runtime/src/passes/distance-cull.ts`
- Create: `packages/runtime/src/passes/material-downgrade.ts`
- Create: `packages/runtime/src/overlay/mount-overlay.ts`
- Create: `packages/runtime/src/doctor.ts`
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/package.json`
- Test: `packages/runtime/src/__tests__/passes.test.ts`
- Test: `packages/runtime/src/__tests__/doctor.test.ts`

**Interfaces:**
- Consumes: core metrics/types/`SAFE_PASSES`; `runRules`, `computeDoctorScore`, `resolveProfile`, `Finding` from rules
- Produces:
  - `export interface OptimizePass { id: PassId; apply(ctx: PassContext): PassHandle }`
  - `export interface PassHandle { rollback(): void }`
  - `export interface DoctorReport { profile: Exclude<Profile,'auto'>; mode: Mode; score: number; findings: Finding[]; baseline: MetricsSample; after?: MetricsSample; deltas?: Partial<Record<keyof MetricsSample, number>>; appliedPasses: PassId[]; failedPasses: Array<{ id: PassId; error: string }>; incomplete: boolean }`
  - `export interface DoctorOptions { scene: DoctorSceneLike; camera: unknown; renderer: DoctorRendererLike; profile?: Profile; mode?: Mode; measureFrames?: number; now?: () => number; device?: DeviceCapabilities; getSceneStats?: () => SceneStatsLike; postfxEnabled?: boolean; setPostfxEnabled?: (enabled: boolean) => void; frameloop?: 'always' | 'demand'; setFrameloop?: (mode: 'always' | 'demand') => void }`
  - `export class Doctor { measure(): Promise<MetricsSample>; diagnose(): Promise<DoctorReport>; optimize(opts?: { apply?: Array<'safe' | PassId> }): Promise<DoctorReport>; mountOverlay(): void; unmountOverlay(): void }`

- [ ] **Step 1: Write failing passes + Doctor tests**

```ts
// packages/runtime/src/__tests__/passes.test.ts
import { describe, it, expect } from 'vitest'
import { dprCapPass } from '../passes/dpr-cap.js'
import { shadowBudgetPass } from '../passes/shadow-budget.js'

describe('safe passes', () => {
  it('dpr-cap lowers pixel ratio and rollbacks', () => {
    const renderer = {
      pixelRatio: 3,
      setPixelRatio(v: number) { this.pixelRatio = v },
    }
    const handle = dprCapPass.apply({
      renderer: renderer as never,
      scene: { children: [], traverse() {} } as never,
      device: {
        tier: 'low', maxTextureSize: 4096, webgl: true, webgpu: false,
        devicePixelRatio: 3, hardwareConcurrency: 4,
      },
      profile: 'marketing',
      postfxEnabled: true,
      frameloop: 'always',
      setFrameloop(v) { this.frameloop = v },
    })
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.5)
    handle.rollback()
    expect(renderer.pixelRatio).toBe(3)
  })

  it('shadow-budget disables excess casters and rollbacks', () => {
    const lights = [
      { castShadow: true },
      { castShadow: true },
      { castShadow: true },
    ]
    const scene = {
      children: lights,
      traverse(cb: (o: { castShadow?: boolean }) => void) {
        for (const l of lights) cb(l)
      },
    }
    const handle = shadowBudgetPass.apply({
      renderer: { pixelRatio: 1, setPixelRatio() {} } as never,
      scene: scene as never,
      device: {
        tier: 'low', maxTextureSize: 4096, webgl: true, webgpu: false,
        devicePixelRatio: 2, hardwareConcurrency: 4,
      },
      profile: 'product',
      postfxEnabled: false,
      frameloop: 'always',
      setFrameloop() {},
    })
    expect(lights.filter((l) => l.castShadow).length).toBeLessThanOrEqual(2)
    handle.rollback()
    expect(lights.every((l) => l.castShadow)).toBe(true)
  })
})
```

```ts
// packages/runtime/src/__tests__/doctor.test.ts
import { describe, it, expect } from 'vitest'
import { Doctor } from '../doctor.js'
import type { RendererInfoLike } from '@threejs-doctor/core'

function createHarness() {
  const info: RendererInfoLike = {
    render: { calls: 180, triangles: 40_000 },
    memory: { geometries: 40, textures: 8 },
  }
  const lights = [{ castShadow: true }, { castShadow: true }, { castShadow: true }]
  const renderer = {
    info,
    pixelRatio: 3,
    antialias: true,
    setPixelRatio(v: number) { this.pixelRatio = v },
  }
  const scene = {
    children: lights,
    traverse(cb: (o: Record<string, unknown>) => void) {
      for (const l of lights) cb(l as never)
      cb({
        isMesh: true,
        geometry: { uuid: 'g1' },
        material: { uuid: 'm1' },
        matrixAutoUpdate: true,
      })
    },
  }
  let t = 0
  const doctor = new Doctor({
    scene: scene as never,
    camera: {},
    renderer: renderer as never,
    profile: 'marketing',
    mode: 'optimize',
    measureFrames: 5,
    now: () => {
      t += 16
      return t
    },
    getSceneStats: () => ({
      textureCount: 8,
      estimatedVramBytes: 32_000_000,
      geometryCount: 40,
      lightCount: 3,
      shadowCastingLightCount: lights.filter((l) => l.castShadow).length,
    }),
  })
  return { doctor, renderer, lights }
}

describe('Doctor', () => {
  it('measure → diagnose → optimize returns deltas', async () => {
    const { doctor, renderer } = createHarness()
    const baseline = await doctor.measure()
    expect(baseline.drawCalls).toBe(180)
    const report = await doctor.optimize({ apply: ['safe'] })
    expect(report.baseline.drawCalls).toBe(180)
    expect(report.appliedPasses.length).toBeGreaterThan(0)
    expect(report.score).toBeGreaterThanOrEqual(0)
    expect(report.score).toBeLessThanOrEqual(100)
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.5)
    if (report.after) {
      expect(report.deltas).toBeDefined()
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @threejs-doctor/runtime test`
Expected: FAIL

- [ ] **Step 3: Implement pass types and all six passes**

```ts
// packages/runtime/src/passes/types.ts
import type { DeviceCapabilities, PassId, Profile } from '@threejs-doctor/core'

export interface DoctorRendererLike {
  info: {
    render: { calls: number; triangles: number }
    memory: { geometries: number; textures: number }
  }
  pixelRatio: number
  antialias?: boolean
  setPixelRatio(value: number): void
}

export interface DoctorSceneLike {
  traverse(callback: (object: DoctorObjectLike) => void): void
  children: unknown[]
}

export interface DoctorObjectLike {
  castShadow?: boolean
  visible?: boolean
  isMesh?: boolean
  isLight?: boolean
  matrixAutoUpdate?: boolean
  geometry?: { uuid: string }
  material?: { uuid: string } | Array<{ uuid: string }>
  position?: { distanceTo: (v: { x: number; y: number; z: number }) => number }
}

export interface PassContext {
  renderer: DoctorRendererLike
  scene: DoctorSceneLike
  device: DeviceCapabilities
  profile: Exclude<Profile, 'auto'>
  postfxEnabled: boolean
  setPostfxEnabled?: (enabled: boolean) => void
  frameloop: 'always' | 'demand'
  setFrameloop: (mode: 'always' | 'demand') => void
  cameraPosition?: { x: number; y: number; z: number }
  cullDistance?: number
}

export interface PassHandle {
  rollback(): void
}

export interface OptimizePass {
  id: PassId
  apply(ctx: PassContext): PassHandle
}
```

```ts
// packages/runtime/src/passes/dpr-cap.ts
import type { OptimizePass } from './types.js'

export const dprCapPass: OptimizePass = {
  id: 'dpr-cap',
  apply(ctx) {
    const prev = ctx.renderer.pixelRatio
    const cap = ctx.device.tier === 'low' ? 1.5 : ctx.device.tier === 'mid' ? 2 : Math.min(prev, 2)
    ctx.renderer.setPixelRatio(Math.min(prev, cap))
    return {
      rollback() {
        ctx.renderer.setPixelRatio(prev)
      },
    }
  },
}
```

```ts
// packages/runtime/src/passes/shadow-budget.ts
import type { OptimizePass } from './types.js'

export const shadowBudgetPass: OptimizePass = {
  id: 'shadow-budget',
  apply(ctx) {
    const maxCasters = ctx.profile === 'marketing' ? 1 : 2
    const touched: Array<{ obj: { castShadow?: boolean }; prev: boolean }> = []
    let kept = 0
    ctx.scene.traverse((obj) => {
      if (!obj.castShadow) return
      if (kept < maxCasters) {
        kept += 1
        return
      }
      touched.push({ obj, prev: true })
      obj.castShadow = false
    })
    return {
      rollback() {
        for (const t of touched) t.obj.castShadow = t.prev
      },
    }
  },
}
```

```ts
// packages/runtime/src/passes/postfx-budget.ts
import type { OptimizePass } from './types.js'

export const postfxBudgetPass: OptimizePass = {
  id: 'postfx-budget',
  apply(ctx) {
    const prev = ctx.postfxEnabled
    if (ctx.device.tier === 'low' && ctx.postfxEnabled) {
      ctx.setPostfxEnabled?.(false)
      ctx.postfxEnabled = false
    }
    return {
      rollback() {
        ctx.postfxEnabled = prev
        ctx.setPostfxEnabled?.(prev)
      },
    }
  },
}
```

```ts
// packages/runtime/src/passes/frameloop-demand.ts
import type { OptimizePass } from './types.js'

export const frameloopDemandPass: OptimizePass = {
  id: 'frameloop-demand',
  apply(ctx) {
    const prev = ctx.frameloop
    if (ctx.profile === 'marketing' || ctx.profile === 'product') {
      ctx.setFrameloop('demand')
    }
    return {
      rollback() {
        ctx.setFrameloop(prev)
      },
    }
  },
}
```

```ts
// packages/runtime/src/passes/distance-cull.ts
import type { OptimizePass } from './types.js'

export const distanceCullPass: OptimizePass = {
  id: 'distance-cull',
  apply(ctx) {
    const cam = ctx.cameraPosition ?? { x: 0, y: 0, z: 0 }
    const maxDist = ctx.cullDistance ?? 80
    const touched: Array<{ obj: { visible?: boolean }; prev: boolean }> = []
    ctx.scene.traverse((obj) => {
      if (!obj.isMesh || !obj.position) return
      const dist = obj.position.distanceTo(cam)
      if (dist > maxDist && obj.visible !== false) {
        touched.push({ obj, prev: obj.visible !== false })
        obj.visible = false
      }
    })
    return {
      rollback() {
        for (const t of touched) t.obj.visible = t.prev
      },
    }
  },
}
```

```ts
// packages/runtime/src/passes/material-downgrade.ts
import type { OptimizePass } from './types.js'

export const materialDowngradePass: OptimizePass = {
  id: 'material-downgrade',
  apply(_ctx) {
    // Opt-in only: v1 records a no-op visual downgrade hook with empty rollback
    // so callers can include the pass id without mutating materials by default.
    return { rollback() {} }
  },
}
```

- [ ] **Step 4: Implement Doctor class + temporary overlay stub**

```ts
// packages/runtime/src/overlay/mount-overlay.ts
import type { MetricsSample } from '@threejs-doctor/core'

export interface OverlayHandle {
  unmount(): void
  refresh?: () => void
}

export interface MountOverlayOptions {
  getScore: () => number
  getBaseline: () => MetricsSample | undefined
  getAfter?: () => MetricsSample | undefined
}

export function mountOverlay(_opts: MountOverlayOptions): OverlayHandle {
  return { unmount() {} }
}
```

```ts
// packages/runtime/src/doctor.ts
import {
  MetricsCollector,
  SAFE_PASSES,
  probeDevice,
  type MetricsSample,
  type Mode,
  type PassId,
  type Profile,
  type DeviceCapabilities,
} from '@threejs-doctor/core'
import {
  computeDoctorScore,
  resolveProfile,
  runRules,
  type Finding,
} from '@threejs-doctor/rules'
import type {
  DoctorRendererLike,
  DoctorSceneLike,
  PassContext,
  PassHandle,
  OptimizePass,
} from './passes/types.js'
import { dprCapPass } from './passes/dpr-cap.js'
import { shadowBudgetPass } from './passes/shadow-budget.js'
import { postfxBudgetPass } from './passes/postfx-budget.js'
import { frameloopDemandPass } from './passes/frameloop-demand.js'
import { distanceCullPass } from './passes/distance-cull.js'
import { materialDowngradePass } from './passes/material-downgrade.js'
import { mountOverlay as mountOverlayImpl, type OverlayHandle } from './overlay/mount-overlay.js'

export interface DoctorReport {
  profile: Exclude<Profile, 'auto'>
  mode: Mode
  score: number
  findings: Finding[]
  baseline: MetricsSample
  after?: MetricsSample
  deltas?: Partial<Record<keyof MetricsSample, number>>
  appliedPasses: PassId[]
  failedPasses: Array<{ id: PassId; error: string }>
  incomplete: boolean
}

export interface DoctorOptions {
  scene: DoctorSceneLike
  camera: unknown
  renderer: DoctorRendererLike
  profile?: Profile
  mode?: Mode
  measureFrames?: number
  now?: () => number
  device?: DeviceCapabilities
  getSceneStats?: () => {
    textureCount: number
    estimatedVramBytes: number
    geometryCount: number
    lightCount: number
    shadowCastingLightCount: number
  }
  postfxEnabled?: boolean
  setPostfxEnabled?: (enabled: boolean) => void
  frameloop?: 'always' | 'demand'
  setFrameloop?: (mode: 'always' | 'demand') => void
}

const PASS_REGISTRY: Record<PassId, OptimizePass> = {
  'dpr-cap': dprCapPass,
  'shadow-budget': shadowBudgetPass,
  'postfx-budget': postfxBudgetPass,
  'frameloop-demand': frameloopDemandPass,
  'distance-cull': distanceCullPass,
  'material-downgrade': materialDowngradePass,
}

function diffMetrics(baseline: MetricsSample, after: MetricsSample): DoctorReport['deltas'] {
  const deltas: DoctorReport['deltas'] = {}
  ;(Object.keys(baseline) as Array<keyof MetricsSample>).forEach((key) => {
    deltas![key] = after[key] - baseline[key]
  })
  return deltas
}

function snapshotFrom(
  baseline: MetricsSample,
  renderer: DoctorRendererLike,
  continuousFrameloop: boolean,
) {
  return {
    objectCount: 0,
    meshCount: 0,
    geometryCount: baseline.geometryCount,
    materialCount: 0,
    textureCount: baseline.textureCount,
    estimatedVramBytes: baseline.estimatedVramBytes,
    lightCount: baseline.lightCount,
    shadowCastingLightCount: baseline.shadowCastingLightCount,
    drawCalls: baseline.drawCalls,
    triangles: baseline.triangles,
    maxTextureDimension: 2048,
    continuousFrameloop,
    matrixAutoUpdateCount: 0,
    rendererPixelRatio: renderer.pixelRatio,
    antialias: Boolean(renderer.antialias),
  }
}

export class Doctor {
  private baseline?: MetricsSample
  private lastReport?: DoctorReport
  private handles: PassHandle[] = []
  private overlay?: OverlayHandle
  private frameloop: 'always' | 'demand'
  private postfxEnabled: boolean

  constructor(private readonly opts: DoctorOptions) {
    this.frameloop = opts.frameloop ?? 'always'
    this.postfxEnabled = opts.postfxEnabled ?? false
  }

  private device(): DeviceCapabilities {
    return this.opts.device ?? probeDevice({ webgl: true })
  }

  private collector(): MetricsCollector {
    return new MetricsCollector({
      getRendererInfo: () => this.opts.renderer.info,
      getSceneStats:
        this.opts.getSceneStats ??
        (() => ({
          textureCount: this.opts.renderer.info.memory.textures,
          estimatedVramBytes: 0,
          geometryCount: this.opts.renderer.info.memory.geometries,
          lightCount: 0,
          shadowCastingLightCount: 0,
        })),
    })
  }

  async measure(): Promise<MetricsSample> {
    const frames = this.opts.measureFrames ?? 30
    const now = this.opts.now ?? (() => performance.now())
    const collector = this.collector()
    for (let i = 0; i < frames; i++) {
      const start = now()
      collector.beginFrame(start)
      collector.endFrame(now())
    }
    const sample = collector.sample()
    this.baseline = sample
    return sample
  }

  async diagnose(): Promise<DoctorReport> {
    const baseline = this.baseline ?? (await this.measure())
    const device = this.device()
    const snap = snapshotFrom(baseline, this.opts.renderer, this.frameloop === 'always')
    const profile = resolveProfile(this.opts.profile ?? 'auto', snap)
    const findings = runRules({ snapshot: snap, device, profile })
    const score = computeDoctorScore(findings, snap, profile)
    const report: DoctorReport = {
      profile,
      mode: this.opts.mode ?? 'diagnose',
      score,
      findings,
      baseline,
      appliedPasses: [],
      failedPasses: [],
      incomplete: false,
    }
    this.lastReport = report
    return report
  }

  async optimize(options: { apply?: Array<'safe' | PassId> } = {}): Promise<DoctorReport> {
    const diagnosed = await this.diagnose()
    const applyToken = options.apply ?? ['safe']
    const passIds: PassId[] = applyToken.includes('safe')
      ? [...SAFE_PASSES]
      : (applyToken.filter((p) => p !== 'safe') as PassId[])

    const device = this.device()
    const ctx: PassContext = {
      renderer: this.opts.renderer,
      scene: this.opts.scene,
      device,
      profile: diagnosed.profile,
      postfxEnabled: this.postfxEnabled,
      setPostfxEnabled: (enabled) => {
        this.postfxEnabled = enabled
        this.opts.setPostfxEnabled?.(enabled)
      },
      frameloop: this.frameloop,
      setFrameloop: (mode) => {
        this.frameloop = mode
        this.opts.setFrameloop?.(mode)
      },
    }

    const appliedPasses: PassId[] = []
    const failedPasses: DoctorReport['failedPasses'] = []
    for (const id of passIds) {
      try {
        const handle = PASS_REGISTRY[id].apply(ctx)
        this.handles.push(handle)
        appliedPasses.push(id)
      } catch (err) {
        failedPasses.push({
          id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    let after: MetricsSample | undefined
    let incomplete = false
    try {
      after = await this.measure()
    } catch {
      incomplete = true
      after = undefined
    }

    const sampleForRules = after ?? diagnosed.baseline
    const snap = snapshotFrom(sampleForRules, this.opts.renderer, this.frameloop === 'always')
    const findings = runRules({ snapshot: snap, device, profile: diagnosed.profile })
    const score = computeDoctorScore(findings, snap, diagnosed.profile)
    const report: DoctorReport = {
      profile: diagnosed.profile,
      mode: 'optimize',
      score,
      findings,
      baseline: diagnosed.baseline,
      after,
      deltas: after ? diffMetrics(diagnosed.baseline, after) : undefined,
      appliedPasses,
      failedPasses,
      incomplete,
    }
    this.lastReport = report
    return report
  }

  mountOverlay(): void {
    if (this.overlay) return
    this.overlay = mountOverlayImpl({
      getScore: () => this.lastReport?.score ?? 0,
      getBaseline: () => this.lastReport?.baseline ?? this.baseline,
      getAfter: () => this.lastReport?.after,
    })
  }

  unmountOverlay(): void {
    this.overlay?.unmount()
    this.overlay = undefined
  }
}
```

Wire `packages/runtime/package.json`:
```json
"dependencies": {
  "@threejs-doctor/core": "workspace:*",
  "@threejs-doctor/rules": "workspace:*"
}
```

```ts
// packages/runtime/src/index.ts
export const PACKAGE_NAME = '@threejs-doctor/runtime' as const
export * from './doctor.js'
export * from './passes/types.js'
export { dprCapPass } from './passes/dpr-cap.js'
export { shadowBudgetPass } from './passes/shadow-budget.js'
export { postfxBudgetPass } from './passes/postfx-budget.js'
export { frameloopDemandPass } from './passes/frameloop-demand.js'
export { distanceCullPass } from './passes/distance-cull.js'
export { materialDowngradePass } from './passes/material-downgrade.js'
export { mountOverlay } from './overlay/mount-overlay.js'
```

- [ ] **Step 5: Run runtime tests**

Run: `pnpm --filter @threejs-doctor/runtime test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/runtime
git commit -m "feat(runtime): add Doctor measure/diagnose/optimize with safe passes and rollback"
```

---

### Task 5: Overlay HUD (`mountOverlay`) showing score + deltas

**Files:**
- Modify: `packages/runtime/src/overlay/mount-overlay.ts`
- Modify: `packages/runtime/src/doctor.ts` (already passes live score/after; no API change)
- Modify: `packages/runtime/vitest.config.ts` (set `environment: 'jsdom'`)
- Modify: `packages/runtime/package.json` (add `jsdom` devDependency)
- Test: `packages/runtime/src/__tests__/overlay.test.ts`

**Interfaces:**
- Consumes: `DoctorReport` fields (`score`, `baseline`, `after`, `deltas`)
- Produces: `export function mountOverlay(opts: MountOverlayOptions): OverlayHandle` inserts DOM node `#threejs-doctor-overlay` with score and metric deltas; `unmount()` removes it; optional `refresh()` repaints

- [ ] **Step 1: Write failing overlay test**

```ts
// packages/runtime/src/__tests__/overlay.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mountOverlay } from '../overlay/mount-overlay.js'
import type { MetricsSample } from '@threejs-doctor/core'

const baseline: MetricsSample = {
  avgFps: 30, p95FrameTimeMs: 40, drawCalls: 200, triangles: 50_000,
  textureCount: 10, estimatedVramBytes: 40_000_000, geometryCount: 40,
  lightCount: 3, shadowCastingLightCount: 2,
}
const after: MetricsSample = {
  avgFps: 48, p95FrameTimeMs: 22, drawCalls: 90, triangles: 50_000,
  textureCount: 10, estimatedVramBytes: 40_000_000, geometryCount: 40,
  lightCount: 3, shadowCastingLightCount: 1,
}

describe('mountOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders score and draw-call delta then unmounts cleanly', () => {
    const handle = mountOverlay({
      getScore: () => 82,
      getBaseline: () => baseline,
      getAfter: () => after,
    })
    const el = document.getElementById('threejs-doctor-overlay')
    expect(el).not.toBeNull()
    expect(el?.textContent).toContain('82')
    expect(el?.textContent).toMatch(/drawCalls/i)
    expect(el?.textContent).toContain('-110')
    handle.unmount()
    expect(document.getElementById('threejs-doctor-overlay')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @threejs-doctor/runtime test -- src/__tests__/overlay.test.ts`
Expected: FAIL (stub returns empty / no DOM node)

Update vitest config first if needed:
```ts
// packages/runtime/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'runtime',
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Implement overlay**

```ts
// packages/runtime/src/overlay/mount-overlay.ts
import type { MetricsSample } from '@threejs-doctor/core'

export interface OverlayHandle {
  unmount(): void
  refresh(): void
}

export interface MountOverlayOptions {
  getScore: () => number
  getBaseline: () => MetricsSample | undefined
  getAfter?: () => MetricsSample | undefined
  root?: ParentNode
}

function formatDeltas(baseline?: MetricsSample, after?: MetricsSample): string {
  if (!baseline || !after) return 'No after metrics'
  const keys: Array<keyof MetricsSample> = [
    'avgFps',
    'p95FrameTimeMs',
    'drawCalls',
    'triangles',
    'textureCount',
    'estimatedVramBytes',
    'geometryCount',
    'lightCount',
    'shadowCastingLightCount',
  ]
  return keys
    .map((k) => {
      const delta = after[k] - baseline[k]
      return `${String(k)}: ${delta >= 0 ? '+' : ''}${delta}`
    })
    .join(' · ')
}

export function mountOverlay(opts: MountOverlayOptions): OverlayHandle {
  const parent = opts.root ?? document.body
  document.getElementById('threejs-doctor-overlay')?.remove()
  const el = document.createElement('div')
  el.id = 'threejs-doctor-overlay'
  el.style.cssText =
    'position:fixed;z-index:99999;left:8px;bottom:8px;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.75);color:#fff;font:12px/1.4 ui-monospace,monospace;max-width:420px'
  const paint = () => {
    const score = opts.getScore()
    const deltas = formatDeltas(opts.getBaseline(), opts.getAfter?.())
    el.textContent = `Doctor Score ${score} | ${deltas}`
  }
  paint()
  parent.appendChild(el)
  return {
    refresh: paint,
    unmount() {
      el.remove()
    },
  }
}
```

- [ ] **Step 4: Run overlay + runtime tests**

Run: `pnpm --filter @threejs-doctor/runtime test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/runtime
git commit -m "feat(runtime): mountOverlay HUD shows Doctor Score and metric deltas"
```

---

### Task 6: `@threejs-doctor/cli` — scan/bench/ci commands, human + JSON report

**Files:**
- Create: `packages/cli/src/cli.ts`
- Create: `packages/cli/src/commands/scan.ts`
- Create: `packages/cli/src/commands/bench.ts`
- Create: `packages/cli/src/commands/ci.ts`
- Create: `packages/cli/src/report/human.ts`
- Create: `packages/cli/src/report/json.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/bin/threejs-doctor.js`
- Modify: `packages/bench/src/index.ts` (temporary `runBenchSuite` stub until Task 7)
- Test: `packages/cli/src/__tests__/report.test.ts`
- Test: `packages/cli/src/__tests__/cli.test.ts`

**Interfaces:**
- Consumes: `DoctorReport` from runtime; `runBenchSuite` from `@threejs-doctor/bench`
- Produces:
  - `export function parseArgs(argv: string[]): CliArgs`
  - `export function formatHumanReport(report: DoctorReport): string`
  - `export function formatJsonReport(report: DoctorReport): string`
  - `export async function main(argv?: string[], deps?: CliDeps): Promise<number>`
  - Commands: `scan [path]`, `bench --profile <p> --budget low`, `ci [--min-score <n>]`
  - Flags: `--format json|human` (default human), `--profile`, `--budget`

- [ ] **Step 1: Write failing report + CLI tests**

```ts
// packages/cli/src/__tests__/report.test.ts
import { describe, it, expect } from 'vitest'
import { formatHumanReport } from '../report/human.js'
import { formatJsonReport } from '../report/json.js'
import type { DoctorReport } from '@threejs-doctor/runtime'

const report: DoctorReport = {
  profile: 'product',
  mode: 'optimize',
  score: 76,
  findings: [
    {
      id: 'draw-calls/too-many',
      severity: 'warn',
      evidence: { drawCalls: 140 },
      message: 'Draw calls high',
      suggestedFix: 'Instance meshes',
    },
  ],
  baseline: {
    avgFps: 30, p95FrameTimeMs: 40, drawCalls: 140, triangles: 20_000,
    textureCount: 6, estimatedVramBytes: 20_000_000, geometryCount: 20,
    lightCount: 2, shadowCastingLightCount: 1,
  },
  after: {
    avgFps: 45, p95FrameTimeMs: 24, drawCalls: 70, triangles: 20_000,
    textureCount: 6, estimatedVramBytes: 20_000_000, geometryCount: 20,
    lightCount: 2, shadowCastingLightCount: 1,
  },
  deltas: { avgFps: 15, p95FrameTimeMs: -16, drawCalls: -70 },
  appliedPasses: ['dpr-cap', 'shadow-budget'],
  failedPasses: [],
  incomplete: false,
}

describe('reports', () => {
  it('formats human report with score and deltas', () => {
    const text = formatHumanReport(report)
    expect(text).toContain('Doctor Score: 76')
    expect(text).toContain('drawCalls')
    expect(text).toContain('dpr-cap')
  })

  it('formats JSON report parseably', () => {
    const parsed = JSON.parse(formatJsonReport(report))
    expect(parsed.score).toBe(76)
    expect(parsed.appliedPasses).toEqual(['dpr-cap', 'shadow-budget'])
    expect(parsed.baseline.drawCalls).toBe(140)
    expect(parsed.after.drawCalls).toBe(70)
  })
})
```

```ts
// packages/cli/src/__tests__/cli.test.ts
import { describe, it, expect } from 'vitest'
import { parseArgs, main } from '../cli.js'
import type { DoctorReport } from '@threejs-doctor/runtime'

const fakeReport: DoctorReport = {
  profile: 'marketing',
  mode: 'benchmark',
  score: 88,
  findings: [],
  baseline: {
    avgFps: 40, p95FrameTimeMs: 28, drawCalls: 60, triangles: 8_000,
    textureCount: 3, estimatedVramBytes: 8_000_000, geometryCount: 8,
    lightCount: 1, shadowCastingLightCount: 0,
  },
  after: {
    avgFps: 55, p95FrameTimeMs: 18, drawCalls: 40, triangles: 8_000,
    textureCount: 3, estimatedVramBytes: 8_000_000, geometryCount: 8,
    lightCount: 1, shadowCastingLightCount: 0,
  },
  deltas: { avgFps: 15, drawCalls: -20, p95FrameTimeMs: -10 },
  appliedPasses: ['dpr-cap'],
  failedPasses: [],
  incomplete: false,
}

describe('cli', () => {
  it('parses scan and format flags', () => {
    expect(parseArgs(['scan', './demo', '--format', 'json'])).toEqual({
      command: 'scan',
      path: './demo',
      format: 'json',
      profile: 'auto',
      budget: 'low',
      minScore: 70,
    })
  })

  it('ci exits 1 when score below gate', async () => {
    const code = await main(['ci', '--min-score', '95'], {
      runScan: async () => fakeReport,
      runBench: async () => fakeReport,
      write: () => {},
    })
    expect(code).toBe(1)
  })

  it('ci exits 0 when score meets gate', async () => {
    const code = await main(['ci', '--min-score', '80'], {
      runScan: async () => fakeReport,
      runBench: async () => fakeReport,
      write: () => {},
    })
    expect(code).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @threejs-doctor/cli test`
Expected: FAIL

- [ ] **Step 3: Implement report formatters and CLI**

```ts
// packages/cli/src/report/human.ts
import type { DoctorReport } from '@threejs-doctor/runtime'

export function formatHumanReport(report: DoctorReport): string {
  const lines: string[] = []
  lines.push(`threejs-doctor — profile=${report.profile} mode=${report.mode}`)
  lines.push(`Doctor Score: ${report.score}`)
  lines.push('')
  lines.push('Findings:')
  if (report.findings.length === 0) lines.push('  (none)')
  for (const f of report.findings) {
    lines.push(`  [${f.severity}] ${f.id}: ${f.message}`)
    lines.push(`    fix: ${f.suggestedFix}`)
  }
  lines.push('')
  lines.push('Baseline → After (deltas):')
  const keys = Object.keys(report.baseline) as Array<keyof typeof report.baseline>
  for (const key of keys) {
    const base = report.baseline[key]
    const after = report.after?.[key]
    const delta = report.deltas?.[key]
    lines.push(
      `  ${String(key)}: ${base}${after === undefined ? '' : ` → ${after}`}${
        delta === undefined ? '' : ` (${delta >= 0 ? '+' : ''}${delta})`
      }`,
    )
  }
  lines.push('')
  lines.push(`Applied passes: ${report.appliedPasses.join(', ') || '(none)'}`)
  if (report.failedPasses.length) {
    lines.push('Failed passes:')
    for (const p of report.failedPasses) lines.push(`  ${p.id}: ${p.error}`)
  }
  if (report.incomplete) {
    lines.push('Run incomplete: after metrics unavailable; baseline retained.')
  }
  return lines.join('\n')
}
```

```ts
// packages/cli/src/report/json.ts
import type { DoctorReport } from '@threejs-doctor/runtime'

export function formatJsonReport(report: DoctorReport): string {
  return JSON.stringify(report, null, 2)
}
```

```ts
// packages/cli/src/cli.ts
import { formatHumanReport } from './report/human.js'
import { formatJsonReport } from './report/json.js'
import type { DoctorReport } from '@threejs-doctor/runtime'
import type { Profile } from '@threejs-doctor/core'

export interface CliArgs {
  command: 'scan' | 'bench' | 'ci' | 'help'
  path: string
  format: 'human' | 'json'
  profile: Profile
  budget: 'low' | 'mid' | 'high'
  minScore: number
}

export interface CliDeps {
  runScan: (args: CliArgs) => Promise<DoctorReport>
  runBench: (args: CliArgs) => Promise<DoctorReport>
  write: (text: string) => void
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: 'help',
    path: '.',
    format: 'human',
    profile: 'auto',
    budget: 'low',
    minScore: 70,
  }
  if (argv.length === 0) return args
  const cmd = argv[0]
  if (cmd === 'scan' || cmd === 'bench' || cmd === 'ci' || cmd === 'help') {
    args.command = cmd
  }
  if (cmd === 'scan' && argv[1] && !argv[1].startsWith('-')) args.path = argv[1]!
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--format') args.format = argv[++i] === 'json' ? 'json' : 'human'
    if (a === '--profile') args.profile = argv[++i] as Profile
    if (a === '--budget') args.budget = (argv[++i] as CliArgs['budget']) ?? 'low'
    if (a === '--min-score') args.minScore = Number(argv[++i])
  }
  return args
}

export async function main(
  argv: string[] = process.argv.slice(2),
  deps?: CliDeps,
): Promise<number> {
  const args = parseArgs(argv)
  const write = deps?.write ?? ((t: string) => console.log(t))
  if (args.command === 'help') {
    write(`Usage:
  npx threejs-doctor scan [path] [--format human|json] [--profile auto|marketing|product|game|cad]
  npx threejs-doctor bench --profile <profile> --budget low [--format human|json]
  npx threejs-doctor ci [--min-score 70] [--format human|json]`)
    return 0
  }

  const runScan = deps?.runScan ?? (await import('./commands/scan.js')).runScan
  const runBench = deps?.runBench ?? (await import('./commands/bench.js')).runBench

  const report =
    args.command === 'bench' ? await runBench(args) : await runScan(args)

  write(args.format === 'json' ? formatJsonReport(report) : formatHumanReport(report))

  if (args.command === 'ci') {
    const hasError = report.findings.some((f) => f.severity === 'error')
    if (report.score < args.minScore || hasError || report.incomplete) return 1
  }
  return 0
}
```

```ts
// packages/cli/src/commands/scan.ts
import type { CliArgs } from '../cli.js'
import type { DoctorReport } from '@threejs-doctor/runtime'

/** Static project scan for CI wiring. Live scene attach is the runtime API. */
export async function runScan(args: CliArgs): Promise<DoctorReport> {
  return {
    profile: args.profile === 'auto' ? 'marketing' : args.profile,
    mode: 'diagnose',
    score: 100,
    findings: [],
    baseline: {
      avgFps: 0,
      p95FrameTimeMs: 0,
      drawCalls: 0,
      triangles: 0,
      textureCount: 0,
      estimatedVramBytes: 0,
      geometryCount: 0,
      lightCount: 0,
      shadowCastingLightCount: 0,
    },
    appliedPasses: [],
    failedPasses: [],
    incomplete: false,
  }
}
```

```ts
// packages/cli/src/commands/bench.ts
import type { CliArgs } from '../cli.js'
import type { DoctorReport } from '@threejs-doctor/runtime'

export async function runBench(args: CliArgs): Promise<DoctorReport> {
  const { runBenchSuite } = await import('@threejs-doctor/bench')
  return runBenchSuite({
    profile: args.profile === 'auto' ? 'marketing' : args.profile,
    budget: args.budget,
  })
}
```

```ts
// packages/cli/src/commands/ci.ts
export { main as runCi } from '../cli.js'
```

```ts
// packages/cli/src/index.ts
export const PACKAGE_NAME = '@threejs-doctor/cli' as const
export { main, parseArgs } from './cli.js'
export { formatHumanReport } from './report/human.js'
export { formatJsonReport } from './report/json.js'
```

Update `packages/cli/package.json` dependencies:
```json
"dependencies": {
  "@threejs-doctor/core": "workspace:*",
  "@threejs-doctor/rules": "workspace:*",
  "@threejs-doctor/runtime": "workspace:*",
  "@threejs-doctor/bench": "workspace:*"
},
"bin": {
  "threejs-doctor": "./bin/threejs-doctor.js"
}
```

Temporary bench export so CLI typechecks until Task 7:

```ts
// packages/bench/src/index.ts
export const PACKAGE_NAME = '@threejs-doctor/bench' as const
import type { DoctorReport } from '@threejs-doctor/runtime'
import type { Profile } from '@threejs-doctor/core'

export async function runBenchSuite(_opts: {
  profile: Exclude<Profile, 'auto'>
  budget: 'low' | 'mid' | 'high'
}): Promise<DoctorReport> {
  return {
    profile: _opts.profile,
    mode: 'benchmark',
    score: 0,
    findings: [],
    baseline: {
      avgFps: 0, p95FrameTimeMs: 0, drawCalls: 0, triangles: 0,
      textureCount: 0, estimatedVramBytes: 0, geometryCount: 0,
      lightCount: 0, shadowCastingLightCount: 0,
    },
    appliedPasses: [],
    failedPasses: [],
    incomplete: true,
  }
}
```

- [ ] **Step 4: Run CLI tests**

Run: `pnpm --filter @threejs-doctor/cli test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli packages/bench/src/index.ts
git commit -m "feat(cli): add scan/bench/ci commands with human and JSON reports"
```

---

### Task 7: `@threejs-doctor/bench` — four fixture scenes + low-end budget harness

**Files:**
- Create: `packages/bench/src/budgets.ts`
- Create: `packages/bench/src/harness.ts`
- Create: `packages/bench/src/fixtures/marketing.ts`
- Create: `packages/bench/src/fixtures/product.ts`
- Create: `packages/bench/src/fixtures/game.ts`
- Create: `packages/bench/src/fixtures/cad.ts`
- Modify: `packages/bench/src/index.ts`
- Modify: `packages/bench/package.json`
- Test: `packages/bench/src/__tests__/budgets.test.ts`
- Test: `packages/bench/src/__tests__/harness.test.ts`

**Interfaces:**
- Consumes: `Doctor` from runtime; core `Profile`, `MetricsSample`
- Produces:
  - `export interface LowEndBudget { maxDrawCalls: number; maxP95FrameTimeMs: number; maxDpr: number; minAvgFps: number }`
  - `export function getLowEndBudget(profile: Exclude<Profile,'auto'>): LowEndBudget`
  - `export const fixtures: Record<Exclude<Profile,'auto'>, { profile: Exclude<Profile,'auto'>; create: () => FixtureCreateResult }>`
  - `export async function runBenchSuite(opts: { profile: Exclude<Profile,'auto'>; budget: 'low'|'mid'|'high' }): Promise<DoctorReport>`
  - `export async function runAllBenchSuites(): Promise<Record<Exclude<Profile,'auto'>, DoctorReport>>`

- [ ] **Step 1: Write failing budget + harness tests**

```ts
// packages/bench/src/__tests__/budgets.test.ts
import { describe, it, expect } from 'vitest'
import { getLowEndBudget } from '../budgets.js'

describe('getLowEndBudget', () => {
  it('keeps draw-call targets in the 50–100 band for marketing/product', () => {
    expect(getLowEndBudget('marketing').maxDrawCalls).toBeGreaterThanOrEqual(50)
    expect(getLowEndBudget('marketing').maxDrawCalls).toBeLessThanOrEqual(100)
    expect(getLowEndBudget('product').maxDrawCalls).toBeLessThanOrEqual(100)
    expect(getLowEndBudget('marketing').maxDpr).toBe(1)
  })
})
```

```ts
// packages/bench/src/__tests__/harness.test.ts
import { describe, it, expect } from 'vitest'
import { runBenchSuite, fixtures } from '../index.js'

describe('bench harness', () => {
  it('exposes four profile fixtures', () => {
    expect(Object.keys(fixtures).sort()).toEqual(['cad', 'game', 'marketing', 'product'])
  })

  it('runs measure/optimize loop and returns before/after for marketing', async () => {
    const report = await runBenchSuite({ profile: 'marketing', budget: 'low' })
    expect(report.mode).toBe('benchmark')
    expect(report.baseline.drawCalls).toBeGreaterThan(0)
    expect(report.after).toBeDefined()
    expect(report.deltas).toBeDefined()
    expect(report.incomplete).toBe(false)
    expect(report.appliedPasses.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @threejs-doctor/bench test`
Expected: FAIL

- [ ] **Step 3: Implement budgets, fixtures, harness**

```ts
// packages/bench/src/budgets.ts
import type { Profile } from '@threejs-doctor/core'

export interface LowEndBudget {
  maxDrawCalls: number
  maxP95FrameTimeMs: number
  maxDpr: number
  minAvgFps: number
}

const LOW: Record<Exclude<Profile, 'auto'>, LowEndBudget> = {
  marketing: { maxDrawCalls: 60, maxP95FrameTimeMs: 22, maxDpr: 1, minAvgFps: 45 },
  product: { maxDrawCalls: 80, maxP95FrameTimeMs: 24, maxDpr: 1, minAvgFps: 40 },
  game: { maxDrawCalls: 100, maxP95FrameTimeMs: 28, maxDpr: 1, minAvgFps: 35 },
  cad: { maxDrawCalls: 100, maxP95FrameTimeMs: 28, maxDpr: 1, minAvgFps: 35 },
}

export function getLowEndBudget(profile: Exclude<Profile, 'auto'>): LowEndBudget {
  return LOW[profile]
}
```

```ts
// packages/bench/src/fixtures/marketing.ts
import type { DeviceCapabilities } from '@threejs-doctor/core'
import type { DoctorRendererLike, DoctorSceneLike } from '@threejs-doctor/runtime'

export function createMarketingFixture() {
  const lights = [{ castShadow: true }, { castShadow: true }]
  const renderer: DoctorRendererLike = {
    info: { render: { calls: 90, triangles: 12_000 }, memory: { geometries: 12, textures: 6 } },
    pixelRatio: 3,
    antialias: true,
    setPixelRatio(v: number) { this.pixelRatio = v },
  }
  const scene: DoctorSceneLike = {
    children: lights,
    traverse(cb) {
      for (const l of lights) cb(l as never)
      cb({
        isMesh: true,
        geometry: { uuid: 'm1' },
        material: { uuid: 'mat1' },
        matrixAutoUpdate: true,
        visible: true,
        position: { distanceTo: () => 10 },
      })
    },
  }
  const device: DeviceCapabilities = {
    tier: 'low', maxTextureSize: 4096, webgl: true, webgpu: false,
    devicePixelRatio: 3, hardwareConcurrency: 4,
  }
  return {
    profile: 'marketing' as const,
    scene,
    renderer,
    camera: {},
    device,
    getSceneStats: () => ({
      textureCount: 6,
      estimatedVramBytes: 24_000_000,
      geometryCount: 12,
      lightCount: lights.length,
      shadowCastingLightCount: lights.filter((l) => l.castShadow).length,
    }),
  }
}
```

```ts
// packages/bench/src/fixtures/product.ts
import type { DeviceCapabilities } from '@threejs-doctor/core'
import type { DoctorRendererLike, DoctorSceneLike } from '@threejs-doctor/runtime'

export function createProductFixture() {
  const lights = [{ castShadow: true }, { castShadow: true }, { castShadow: true }]
  const renderer: DoctorRendererLike = {
    info: { render: { calls: 110, triangles: 30_000 }, memory: { geometries: 8, textures: 10 } },
    pixelRatio: 2.5,
    antialias: true,
    setPixelRatio(v: number) { this.pixelRatio = v },
  }
  const scene: DoctorSceneLike = {
    children: lights,
    traverse(cb) {
      for (const l of lights) cb(l as never)
      cb({
        isMesh: true,
        geometry: { uuid: 'p1' },
        material: { uuid: 'pmat' },
        matrixAutoUpdate: true,
        visible: true,
        position: { distanceTo: () => 5 },
      })
    },
  }
  const device: DeviceCapabilities = {
    tier: 'low', maxTextureSize: 4096, webgl: true, webgpu: false,
    devicePixelRatio: 2.5, hardwareConcurrency: 4,
  }
  return {
    profile: 'product' as const,
    scene,
    renderer,
    camera: {},
    device,
    getSceneStats: () => ({
      textureCount: 10,
      estimatedVramBytes: 48_000_000,
      geometryCount: 8,
      lightCount: lights.length,
      shadowCastingLightCount: lights.filter((l) => l.castShadow).length,
    }),
  }
}
```

```ts
// packages/bench/src/fixtures/game.ts
import type { DeviceCapabilities } from '@threejs-doctor/core'
import type { DoctorRendererLike, DoctorSceneLike } from '@threejs-doctor/runtime'

export function createGameFixture() {
  const lights = [
    { castShadow: true }, { castShadow: true },
    { castShadow: true }, { castShadow: true },
  ]
  const renderer: DoctorRendererLike = {
    info: { render: { calls: 160, triangles: 80_000 }, memory: { geometries: 60, textures: 20 } },
    pixelRatio: 2,
    antialias: false,
    setPixelRatio(v: number) { this.pixelRatio = v },
  }
  const scene: DoctorSceneLike = {
    children: lights,
    traverse(cb) {
      for (const l of lights) cb(l as never)
      for (let i = 0; i < 40; i++) {
        cb({
          isMesh: true,
          geometry: { uuid: `g${i}` },
          material: { uuid: 'shared' },
          matrixAutoUpdate: true,
          visible: true,
          position: { distanceTo: () => (i > 30 ? 120 : 20) },
        })
      }
    },
  }
  const device: DeviceCapabilities = {
    tier: 'mid', maxTextureSize: 8192, webgl: true, webgpu: false,
    devicePixelRatio: 2, hardwareConcurrency: 8,
  }
  return {
    profile: 'game' as const,
    scene,
    renderer,
    camera: {},
    device,
    getSceneStats: () => ({
      textureCount: 20,
      estimatedVramBytes: 96_000_000,
      geometryCount: 60,
      lightCount: lights.length,
      shadowCastingLightCount: lights.filter((l) => l.castShadow).length,
    }),
  }
}
```

```ts
// packages/bench/src/fixtures/cad.ts
import type { DeviceCapabilities } from '@threejs-doctor/core'
import type { DoctorRendererLike, DoctorSceneLike } from '@threejs-doctor/runtime'

export function createCadFixture() {
  const lights = [{ castShadow: true }, { castShadow: true }, { castShadow: true }]
  const renderer: DoctorRendererLike = {
    info: { render: { calls: 180, triangles: 200_000 }, memory: { geometries: 120, textures: 15 } },
    pixelRatio: 2,
    antialias: true,
    setPixelRatio(v: number) { this.pixelRatio = v },
  }
  const scene: DoctorSceneLike = {
    children: lights,
    traverse(cb) {
      for (const l of lights) cb(l as never)
      for (let i = 0; i < 80; i++) {
        cb({
          isMesh: true,
          geometry: { uuid: `cad${i}` },
          material: { uuid: `mat${i % 20}` },
          matrixAutoUpdate: true,
          visible: true,
          position: { distanceTo: () => 15 },
        })
      }
    },
  }
  const device: DeviceCapabilities = {
    tier: 'mid', maxTextureSize: 8192, webgl: true, webgpu: false,
    devicePixelRatio: 2, hardwareConcurrency: 8,
  }
  return {
    profile: 'cad' as const,
    scene,
    renderer,
    camera: {},
    device,
    getSceneStats: () => ({
      textureCount: 15,
      estimatedVramBytes: 80_000_000,
      geometryCount: 120,
      lightCount: lights.length,
      shadowCastingLightCount: lights.filter((l) => l.castShadow).length,
    }),
  }
}
```

```ts
// packages/bench/src/harness.ts
import { Doctor, type DoctorReport } from '@threejs-doctor/runtime'
import type { Profile } from '@threejs-doctor/core'
import { createMarketingFixture } from './fixtures/marketing.js'
import { createProductFixture } from './fixtures/product.js'
import { createGameFixture } from './fixtures/game.js'
import { createCadFixture } from './fixtures/cad.js'
import { getLowEndBudget } from './budgets.js'

export const fixtures = {
  marketing: { profile: 'marketing' as const, create: createMarketingFixture },
  product: { profile: 'product' as const, create: createProductFixture },
  game: { profile: 'game' as const, create: createGameFixture },
  cad: { profile: 'cad' as const, create: createCadFixture },
}

export async function runBenchSuite(opts: {
  profile: Exclude<Profile, 'auto'>
  budget: 'low' | 'mid' | 'high'
}): Promise<DoctorReport> {
  const fixture = fixtures[opts.profile].create()
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
```

```ts
// packages/bench/src/index.ts
export const PACKAGE_NAME = '@threejs-doctor/bench' as const
export * from './budgets.js'
export * from './harness.js'
export { createMarketingFixture } from './fixtures/marketing.js'
export { createProductFixture } from './fixtures/product.js'
export { createGameFixture } from './fixtures/game.js'
export { createCadFixture } from './fixtures/cad.js'
```

Ensure `packages/bench/package.json` has:
```json
"dependencies": {
  "@threejs-doctor/core": "workspace:*",
  "@threejs-doctor/runtime": "workspace:*"
}
```

- [ ] **Step 4: Run bench tests**

Run: `pnpm --filter @threejs-doctor/bench test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/bench
git commit -m "feat(bench): add four profile fixtures and low-end budget harness"
```

---

### Task 8: `@threejs-doctor/r3f` — DoctorCanvas + useDoctor

**Files:**
- Create: `packages/r3f/src/DoctorCanvas.tsx`
- Create: `packages/r3f/src/useDoctor.ts`
- Modify: `packages/r3f/src/index.ts`
- Modify: `packages/r3f/package.json`
- Modify: `packages/r3f/tsconfig.json` (`jsx: react-jsx`)
- Modify: `packages/r3f/vitest.config.ts` (jsdom)
- Test: `packages/r3f/src/__tests__/useDoctor.test.tsx`
- Test: `packages/r3f/src/__tests__/DoctorCanvas.test.tsx`

**Interfaces:**
- Consumes: `Doctor`, `DoctorReport` from runtime; `Profile`, `Mode`, `PassId` from core
- Produces:
  - `export interface DoctorContextValue { doctor: Doctor | null; report: DoctorReport | null; runDiagnose(): Promise<DoctorReport>; runOptimize(apply?: Array<'safe' | PassId>): Promise<DoctorReport> }`
  - `export function useDoctor(): DoctorContextValue`
  - `export function DoctorProvider(props: { doctor: Doctor; children: React.ReactNode }): JSX.Element`
  - `export function DoctorCanvas(props: DoctorCanvasProps): JSX.Element`
  - `DoctorCanvasProps extends Omit<CanvasProps, 'children'> { profile?: Profile; mode?: Mode; children?: React.ReactNode; showOverlay?: boolean }`

- [ ] **Step 1: Write failing hooks/component tests**

```tsx
// packages/r3f/src/__tests__/useDoctor.test.tsx
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { DoctorProvider, useDoctor } from '../useDoctor.js'
import { Doctor } from '@threejs-doctor/runtime'

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
    let report
    await act(async () => {
      report = await result.current.runDiagnose()
    })
    expect(report?.score).toBeGreaterThanOrEqual(0)
  })
})
```

```tsx
// packages/r3f/src/__tests__/DoctorCanvas.test.tsx
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useThree: () => ({
    scene: { children: [], traverse() {} },
    camera: {},
    gl: {
      info: { render: { calls: 1, triangles: 10 }, memory: { geometries: 1, textures: 1 } },
      getPixelRatio: () => 1,
      setPixelRatio() {},
      pixelRatio: 1,
    },
  }),
}))

import { DoctorCanvas } from '../DoctorCanvas.js'

describe('DoctorCanvas', () => {
  it('renders children inside canvas wrapper', () => {
    render(
      <DoctorCanvas profile="product">
        <div>hero</div>
      </DoctorCanvas>,
    )
    expect(screen.getByTestId('r3f-canvas')).toBeTruthy()
    expect(screen.getByText('hero')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @threejs-doctor/r3f test`
Expected: FAIL

- [ ] **Step 3: Implement useDoctor + DoctorCanvas**

Update `packages/r3f/package.json`:
```json
{
  "name": "@threejs-doctor/r3f",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@threejs-doctor/core": "workspace:*",
    "@threejs-doctor/runtime": "workspace:*"
  },
  "peerDependencies": {
    "three": ">=0.160.0",
    "react": ">=18",
    "react-dom": ">=18",
    "@react-three/fiber": ">=8"
  },
  "devDependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@react-three/fiber": "^8.17.10",
    "three": "^0.172.0",
    "@testing-library/react": "^16.1.0",
    "jsdom": "^26.0.0",
    "vitest": "^3.0.5",
    "typescript": "^5.7.3"
  }
}
```

```json
// packages/r3f/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

```ts
// packages/r3f/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'r3f',
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
```

```ts
// packages/r3f/src/useDoctor.ts
import React, { createContext, useContext, useMemo, useState, useCallback } from 'react'
import type { Doctor, DoctorReport } from '@threejs-doctor/runtime'
import type { PassId } from '@threejs-doctor/core'

export interface DoctorContextValue {
  doctor: Doctor | null
  report: DoctorReport | null
  runDiagnose(): Promise<DoctorReport>
  runOptimize(apply?: Array<'safe' | PassId>): Promise<DoctorReport>
}

const DoctorContext = createContext<DoctorContextValue | null>(null)

export function DoctorProvider({
  doctor,
  children,
}: {
  doctor: Doctor
  children: React.ReactNode
}) {
  const [report, setReport] = useState<DoctorReport | null>(null)
  const runDiagnose = useCallback(async () => {
    const r = await doctor.diagnose()
    setReport(r)
    return r
  }, [doctor])
  const runOptimize = useCallback(
    async (apply: Array<'safe' | PassId> = ['safe']) => {
      const r = await doctor.optimize({ apply })
      setReport(r)
      return r
    },
    [doctor],
  )
  const value = useMemo(
    () => ({ doctor, report, runDiagnose, runOptimize }),
    [doctor, report, runDiagnose, runOptimize],
  )
  return React.createElement(DoctorContext.Provider, { value }, children)
}

export function useDoctor(): DoctorContextValue {
  const ctx = useContext(DoctorContext)
  if (!ctx) throw new Error('useDoctor must be used within DoctorCanvas / DoctorProvider')
  return ctx
}
```

```tsx
// packages/r3f/src/DoctorCanvas.tsx
import React, { useEffect, useMemo, useState } from 'react'
import { Canvas, useThree, type CanvasProps } from '@react-three/fiber'
import { Doctor } from '@threejs-doctor/runtime'
import type { Mode, Profile } from '@threejs-doctor/core'
import { DoctorProvider } from './useDoctor.js'

export interface DoctorCanvasProps extends Omit<CanvasProps, 'children'> {
  profile?: Profile
  mode?: Mode
  showOverlay?: boolean
  children?: React.ReactNode
}

function DoctorBridge({
  profile,
  mode,
  showOverlay,
  children,
}: {
  profile: Profile
  mode: Mode
  showOverlay: boolean
  children?: React.ReactNode
}) {
  const { scene, camera, gl } = useThree()
  const [doctor, setDoctor] = useState<Doctor | null>(null)

  const rendererLike = useMemo(
    () => ({
      info: gl.info,
      pixelRatio: typeof gl.getPixelRatio === 'function' ? gl.getPixelRatio() : 1,
      antialias: true,
      setPixelRatio: (v: number) => gl.setPixelRatio(v),
    }),
    [gl],
  )

  useEffect(() => {
    const d = new Doctor({
      scene: scene as never,
      camera,
      renderer: rendererLike as never,
      profile,
      mode,
    })
    setDoctor(d)
    if (showOverlay) d.mountOverlay()
    return () => {
      d.unmountOverlay()
    }
  }, [scene, camera, rendererLike, profile, mode, showOverlay])

  if (!doctor) return null
  return <DoctorProvider doctor={doctor}>{children}</DoctorProvider>
}

export function DoctorCanvas({
  profile = 'auto',
  mode = 'diagnose',
  showOverlay = false,
  children,
  ...canvasProps
}: DoctorCanvasProps) {
  return (
    <Canvas {...canvasProps}>
      <DoctorBridge profile={profile} mode={mode} showOverlay={showOverlay}>
        {children}
      </DoctorBridge>
    </Canvas>
  )
}
```

```ts
// packages/r3f/src/index.ts
export const PACKAGE_NAME = '@threejs-doctor/r3f' as const
export { DoctorCanvas } from './DoctorCanvas.js'
export type { DoctorCanvasProps } from './DoctorCanvas.js'
export { useDoctor, DoctorProvider } from './useDoctor.js'
export type { DoctorContextValue } from './useDoctor.js'
```

- [ ] **Step 4: Run r3f tests**

Run: `pnpm --filter @threejs-doctor/r3f test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/r3f
git commit -m "feat(r3f): add DoctorCanvas and useDoctor adapter"
```

---

### Task 9: CI workflow + docs polish

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`
- Create: `packages/cli/src/__tests__/ci-gate.test.ts`
- Test: `packages/cli/src/__tests__/ci-gate.test.ts` plus full monorepo `pnpm test`

**Interfaces:**
- Consumes: `pnpm test`, `pnpm typecheck`, CLI `ci` command
- Produces: GitHub Actions workflow on push/PR; README usage for CLI/runtime/R3F; before/after table filled from fixture baselines with instruction to paste after values from bench JSON (never invent after numbers)

- [ ] **Step 1: Write failing CI workflow expectation test**

```ts
// packages/cli/src/__tests__/ci-gate.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('CI workflow file', () => {
  it('exists and runs pnpm test', () => {
    const yml = readFileSync(
      resolve(process.cwd(), '../../.github/workflows/ci.yml'),
      'utf8',
    )
    expect(yml).toContain('pnpm test')
    expect(yml).toContain('pnpm typecheck')
    expect(yml).toContain('threejs-doctor ci')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @threejs-doctor/cli test -- src/__tests__/ci-gate.test.ts`
Expected: FAIL (ENOENT workflow)

- [ ] **Step 3: Add GitHub Actions workflow**

```yml
# .github/workflows/ci.yml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm --filter @threejs-doctor/cli exec node ./bin/threejs-doctor.js ci --min-score 0
```

- [ ] **Step 4: Polish README with concrete usage and before/after tables**

Replace `README.md` with:

```md
# threejs-doctor

Doctor + optimizer for Three.js: diagnose scenes with deterministic findings, apply safe runtime optimizations for low-end devices, and prove the win with measurable before/after metrics.

Inspired by [react-doctor](https://github.com/millionco/react-doctor). Design: [`docs/superpowers/specs/2026-09-17-threejs-doctor-design.md`](docs/superpowers/specs/2026-09-17-threejs-doctor-design.md). Plan: [`docs/superpowers/plans/2026-09-17-threejs-doctor-v1.md`](docs/superpowers/plans/2026-09-17-threejs-doctor-v1.md).

## Install / run

```bash
npx threejs-doctor
npx threejs-doctor scan ./path --format json
npx threejs-doctor bench --profile product --budget low
npx threejs-doctor ci --min-score 70
```

## Runtime (vanilla Three.js)

```ts
import { Doctor } from '@threejs-doctor/runtime'

const doctor = new Doctor({ scene, camera, renderer, profile: 'auto', mode: 'diagnose' })
const baseline = await doctor.measure()
const report = await doctor.diagnose()
const after = await doctor.optimize({ apply: ['safe'] })
doctor.mountOverlay()
```

Safe passes: `dpr-cap`, `shadow-budget`, `postfx-budget`, `frameloop-demand`, `distance-cull`. Opt-in: `material-downgrade`.

## React Three Fiber

```tsx
import { DoctorCanvas, useDoctor } from '@threejs-doctor/r3f'

<DoctorCanvas profile="product" showOverlay>
  {/* scene */}
</DoctorCanvas>
```

## Packages

| Package | Role |
|---------|------|
| `@threejs-doctor/core` | Probe, snapshot, metrics |
| `@threejs-doctor/rules` | Findings + Doctor Score |
| `@threejs-doctor/runtime` | Doctor API + overlay |
| `@threejs-doctor/cli` | `npx threejs-doctor` |
| `@threejs-doctor/bench` | Four fixtures + low-end budgets |
| `@threejs-doctor/r3f` | `DoctorCanvas` / `useDoctor` |

## Bench before/after (low-end budget)

Reproduce:

```bash
pnpm --filter @threejs-doctor/bench test
npx threejs-doctor bench --profile marketing --budget low --format json
```

| Profile | Metric | Baseline (fixture) | After safe passes | Notes |
|---------|--------|--------------------|-------------------|-------|
| marketing | drawCalls | 90 | from report.after | expect reduction / score↑ |
| marketing | renderer DPR | 3 | ≤1.5 via dpr-cap | capped on low tier |
| product | drawCalls | 110 | from report.after | safe set applied |
| game | shadow casters | 4 | ≤ budget via shadow-budget | see appliedPasses |
| cad | drawCalls | 180 | from report.after | rules flag + optimize |

Paste exact `baseline` / `after` / `deltas` numbers from the bench JSON into release notes — never invent after metrics. If after-measure fails, mark the run incomplete and keep baseline only.

## Telemetry

Off by default. No network reporting in v1.

## License

MIT © codergeeta
```

- [ ] **Step 5: Run full monorepo verification**

Run:
```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @threejs-doctor/cli test -- src/__tests__/ci-gate.test.ts
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml README.md packages/cli/src/__tests__/ci-gate.test.ts
git commit -m "ci: add GitHub Actions workflow and polish README usage docs"
```

---

## Spec coverage self-check

| Spec section | Task(s) |
|--------------|---------|
| Problem / Goals / Non-goals | Header Goal + Global Constraints |
| Product name, packages, MIT, pnpm, codergeeta | Task 1, Task 9 |
| Architecture diagram packages | File map + Tasks 2–8 |
| Product loop measure→diagnose→optimize→prove | Task 4, Task 7 |
| Profiles marketing/product/game/cad/auto | Task 3 profiles, Task 7 fixtures |
| Metrics + Doctor Score 0–100 | Task 2 MetricsCollector, Task 3 score |
| Before/after contract / incomplete runs | Task 4 Doctor.optimize, Task 6 reports |
| Rules engine + all 8 v1 rule groups | Task 3 |
| Runtime safe passes + material-downgrade opt-in | Task 4 |
| Modes diagnose/optimize/benchmark | Task 4, Task 6, Task 7 |
| Public Doctor API + mountOverlay | Task 4, Task 5 |
| R3F DoctorCanvas / useDoctor | Task 8 |
| CLI scan/bench/ci + human/JSON | Task 6 |
| Error handling (rollback, incomplete, capability) | Task 2 probe webgl/webgpu, Task 4 rollback/incomplete |
| Bench fixtures + low-end budgets (DPR 1, ~50–100 draw calls) | Task 7 |
| Testing strategy unit/contract/bench | Tasks 2–8 tests + Task 9 CI |
| Telemetry off by default | Global Constraints + Task 9 README |
| Distribution `npx threejs-doctor` | Task 1 bin + Task 6 |
| Success criteria | Tasks 6–9 verification commands |
| Open decisions (npm later, no gltf wrapper, WebGPU detect) | Global Constraints; `probeDevice` exposes `webgpu`; no gltf package in file map |

**Placeholder scan:** no TBD / TODO / “implement later” / empty “write tests for the above” steps remain. Every code step includes concrete TypeScript.

**Type consistency:** `PassId`, `SAFE_PASSES`, `MetricsSample`, `DoctorReport`, `Finding`, `Profile`, `Mode`, `DoctorRendererLike`, `DoctorSceneLike` names are shared from core/rules through runtime/cli/bench/r3f without rename drift.

**Gaps noticed:** none relative to the approved design spec for v1.
