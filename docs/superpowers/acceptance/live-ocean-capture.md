# Live Quality Ladder capture (phone / WebGL)

How to capture a `QualityLadderReport` JSON on a real device. **Do not check capture JSON into this repo.** Store schema only (`quality-ladder-report.schema.json`). Never invent `avgFps`, `ttfiMs`, `after`, or `deltas`.

Headless CI does not gate TTFI or 30 FPS. This runbook is the live proof path.

## 1. Device class for the bar

All of:

- Mobile UA / coarse pointer / `maxTouchPoints ≥ 1`
- `navigator.deviceMemory ≤ 4` when reported, else treat unknown mobile as this class
- `hardwareConcurrency ≤ 8`
- No WebGPU
- CSS viewport ~360×800 logical CSS pixels, DPR ≥ 2
- Network: recorded session; cold cache preferred

## 2. Fixture

Use the **live URL only**. Do not clone, submodule, vendor, or copy the demo into this repository.

Primary fixture:

- [ocean-simulation](https://iamtechartist.github.io/ocean-simulation/)

Acceptance is **not** complete with ocean-simulation alone. After the ocean capture, repeat Pass A / Pass B on **1–2 additional heavy Three.js demos** (see [Additional heavy demos](#additional-heavy-demos)). Same device class, same bar (TTFI then hold FPS), same rule: real measurable deltas only.

## 3. Attach

Load `@threejs-doctor/runtime` plus `createOceanAdapter(getPelagicDebug())` from `examples/ocean-adapter` as in that README. Use `profile: 'game'`.

```ts
import { Doctor, QualityController } from '@threejs-doctor/runtime'
import { createOceanAdapter, getPelagicDebug } from './src/index.js'

const debug = getPelagicDebug()
const doctor = new Doctor({
  scene: debug?.scene,
  camera,
  renderer: debug?.renderer,
  profile: 'game',
})
const ladder = new QualityController(doctor, { mode: 'advise' })
ladder.registerAdapter(createOceanAdapter(getPelagicDebug()))
await ladder.boot()
const report = await ladder.runLadder()
console.log(JSON.stringify(report))
```

Bookmarklet, local overlay, or pasted module are all fine. If `window.pelagic.debug` is missing, `createOceanAdapter` reports empty capabilities; the controller sets `adapterUnavailable: true` and still runs generic Three.js caps only. Do not invent `simPassCount` / `after` in that case.

## 4. Pass A (`advise`)

Cold load on the device class above.

1. Construct `new QualityController(doctor, { mode: 'advise' })`.
2. `registerAdapter(createOceanAdapter(getPelagicDebug()))`.
3. `await ladder.boot()` then `await ladder.runLadder()`.
4. `JSON.stringify(report)` and save the file **off-repo** (phone Files app / AirDrop). Do not commit it.

Expect score may already be high; FPS/TTFI are the story. Overlay stays read-only. `advise` must not mutate the scene.

## 5. Pass B (`safe-auto`)

Cold load again. Same camera path as Pass A.

1. `mode: 'safe-auto'`.
2. Record `ttfiMs` and settled windows from the report.
3. Compare to the bar:
   - `ttfiMs < 3000`
   - then 3 windows with `avgFps ≥ 30` and `p95FrameTimeMs ≤ 33.4`
4. Visible work: at least one of `simPassCount`, drawing-buffer pixels, RT pixel count, or triangles-across-views moved; score-only does not count.
5. Save the JSON **off-repo**.

Deltas must come from the same sample windows on the same camera path. Do not type guessed after metrics.

## 6. Incomplete runs

If after-measure fails or WebGL is missing: keep baseline, set `incomplete: true`, **do not paste fixture or guessed numbers** into notes. Mark the run skipped. A stub `npx threejs-doctor scan` report is not a substitute.

## 7. Validate

Paste the saved JSON into a JSON Schema validator against `quality-ladder-report.schema.json`. Required keys must be present. Optional keys (`ttfiMs`, `after`, `deltas`, `adapterUnavailable`, `recommendedTier`, and on samples `simPassCount`, `bytesLoaded`, `compileMs`, `drawingBufferPixels`) may be omitted. Do not fill omitted keys from fixtures.

## 8. CI

GitHub Actions does not run this. `npx threejs-doctor scan` is a stub (score 100, empty findings, zeroed baseline) and is non-authoritative. `bench` / `ci` stay headless scene-stat gates. No Playwright live job. No GPU job.

## Additional heavy demos

Ocean-simulation is required. Also capture **1–2 more** heavy Three.js demos on the same device class. Candidates (live URL only — do not vendor them here):

- [2600th/Kinema](https://github.com/2600th/Kinema) — use the project's published live WebGL URL (WebGPU-first; force the WebGL compatibility path so the §3 “No WebGPU” class still applies).
- [Kevin-Liu-01/claude-of-tanks](https://github.com/Kevin-Liu-01/claude-of-tanks) — live WebGL at [cot.kevinliu.studio](https://cot.kevinliu.studio/).

For these hosts, attach `Doctor` + `QualityController` with `profile: 'game'` and generic caps. Register an adapter only if that host exposes equivalent knobs; otherwise expect `adapterUnavailable: true` and generic passes only.

Same bar as Pass B: TTFI under the 3000 ms threshold, then hold `avgFps ≥ 30` / `p95FrameTimeMs ≤ 33.4` for three windows, with **real** `baseline` / `after` / `deltas` from the device. Score-only does not count. Never invent after metrics. Save JSON off-repo; validate against the same schema.
