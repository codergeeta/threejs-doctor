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

Use the unpublished IIFE in [`examples/live-attach`](../../../examples/live-attach/README.md): paste `examples/live-attach/dist/attach.iife.js` into DevTools on the live URL. It constructs `Doctor` + `QualityController` (`profile: 'game'`), registers `createOceanAdapter` only when `window.pelagic.debug` exists, then `boot()` + `runLadder()`. Default mode is `advise`. For Pass B, reload and set `window.__THREEJS_DOCTOR_ATTACH__ = { mode: 'safe-auto' }` before pasting again.

The helper logs `console.log(JSON.stringify(report))` and assigns `window.__THREEJS_DOCTOR_LAST_REPORT__` after boot and after `runLadder()` so a dropped console line can still be copied. Do not invent `avgFps` / `ttfiMs` / `after` / `simPassCount`. Paste-after-load omits `ttfiMs` (it is not cold-load TTFI). Pass a `waitForFirstInteractive` hook only if you attached from document-start.

Equivalent TypeScript (if you construct it yourself):

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
if (debug) ladder.registerAdapter(createOceanAdapter(debug))
await ladder.boot()
const report = await ladder.runLadder()
console.log(JSON.stringify(report))
```

If `window.pelagic.debug` is missing, skip `registerAdapter` (the IIFE does this). An adapter with empty capabilities sets `adapterUnavailable: true` and still runs generic Three.js caps only. Do not invent `simPassCount` / `after` in that case.

## 4. Pass A (`advise`)

Cold load on the device class above.

1. Construct `new QualityController(doctor, { mode: 'advise' })`.
2. `registerAdapter(createOceanAdapter(getPelagicDebug()))`.
3. `await ladder.boot()` then `await ladder.runLadder()`.
4. `JSON.stringify(report)` and save the file **off-repo** (phone Files app / AirDrop), or `copy(JSON.stringify(window.__THREEJS_DOCTOR_LAST_REPORT__))` after a live-attach paste. Do not commit it.

Expect score may already be high; FPS (and TTFI when captured from document-start) are the story. Overlay stays read-only. `advise` must not mutate the scene.

## 5. Pass B (`safe-auto`)

Cold load again. Same camera path as Pass A.

1. `mode: 'safe-auto'`.
2. Record settled windows from the report. Record `ttfiMs` only if it is present (document-start `waitForFirstInteractive`). Paste-after-load omits `ttfiMs` — do not fill it in.
3. Compare to the bar:
   - `ttfiMs < 3000` when that field was captured from cold load
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

- [2600th/Kinema](https://github.com/2600th/Kinema) — live app [kinema-play.vercel.app](https://kinema-play.vercel.app); force WebGL with [/?forceWebGL=1](https://kinema-play.vercel.app/?forceWebGL=1) so the §1 “No WebGPU” class still applies.
- [Kevin-Liu-01/claude-of-tanks](https://github.com/Kevin-Liu-01/claude-of-tanks) — live WebGL at [cot.kevinliu.studio](https://cot.kevinliu.studio/).

For these hosts, paste the same live-attach IIFE (`profile: 'game'`, generic caps). It registers the ocean adapter only when `window.pelagic.debug` exists; otherwise generic passes only. If you register an adapter with empty capabilities, the controller sets `adapterUnavailable: true`.

Same bar as Pass B: TTFI under the 3000 ms threshold, then hold `avgFps ≥ 30` / `p95FrameTimeMs ≤ 33.4` for three windows, with **real** `baseline` / `after` / `deltas` from the device. Score-only does not count. Never invent after metrics. Save JSON off-repo; validate against the same schema.
