# Unpublished Quality Ladder live-attach helper

Browser IIFE that pastes into DevTools on a **live** Three.js page, constructs
`Doctor` + `QualityController` from `@threejs-doctor/runtime`, optionally
registers `createOceanAdapter` when `window.pelagic.debug` exists, then
`boot()` + `runLadder()`. The report is logged with `console.log(JSON.stringify(report))`.
Metrics come from that run only — **do not invent `avgFps` / `ttfiMs` / `after`**.

**This package is `private: true`.** It is not published. This repository does
not vendor ocean-simulation, claude-of-tanks, or Kinema.

## Build

From the repo root (after `pnpm install`):

```bash
pnpm --filter @threejs-doctor/live-attach-example build
```

That writes `examples/live-attach/dist/attach.iife.js` (committed so you can
paste without rebuilding). Rebuild and commit `dist/` after changing attach
source — unit tests compare the committed IIFE to a fresh build.

## Pass A (`advise`, default)

1. Open one of the live URLs below. Wait until the WebGL canvas is visible.
2. Open DevTools → Console.
3. Paste the **entire** contents of `dist/attach.iife.js` and press Enter.
4. Wait until a JSON line is logged. Save that file **off-repo**. Do not commit it.
5. Validate against
   [`docs/superpowers/acceptance/quality-ladder-report.schema.json`](../../docs/superpowers/acceptance/quality-ladder-report.schema.json).

Default mode is `advise` (no pass/adapter mutation). Overlay mounts when
`document.body` exists. Frame samples wait for `renderer.info.render.frame` to
advance when that counter exists.

If auto-run is unwanted:

```js
window.__THREEJS_DOCTOR_ATTACH__ = { autoRun: false }
```

Then paste the IIFE and call:

```js
await ThreejsDoctorLiveAttach.attachQualityLadder({ mode: 'advise' })
```

Paste-after-load **cannot** measure cold-load TTFI. `ttfiMs` is omitted unless
you pass `waitForFirstInteractive` from a document-start hook. Do not treat a
missing `ttfiMs` as a failed bar, and do not fill it in by hand.

## Pass B (`safe-auto`)

Cold load again (reload the live page). Same camera path as Pass A.

```js
window.__THREEJS_DOCTOR_ATTACH__ = { mode: 'safe-auto' }
```

Paste `dist/attach.iife.js` again. Save the JSON off-repo. Compare settled
`baseline` / `after` / `deltas` to the bar in
[`docs/superpowers/acceptance/live-ocean-capture.md`](../../docs/superpowers/acceptance/live-ocean-capture.md).
Do not type guessed after metrics. Do not treat paste-after-load `ttfiMs` as
cold TTFI (it will be absent by default).

## Live URLs (do not vendor)

| Host | URL | Adapter |
|------|-----|---------|
| ocean-simulation | https://iamtechartist.github.io/ocean-simulation/ | Registers `createOceanAdapter` when `window.pelagic.debug` exists. If it is missing, the IIFE skips `registerAdapter` and runs generic Three.js caps only. |
| claude-of-tanks | https://cot.kevinliu.studio/ | Generic caps. No ocean adapter. |
| Kinema | https://kinema-play.vercel.app/?forceWebGL=1 | Generic caps. Use the documented WebGL compatibility query so the capture stays on WebGL. Homepage: https://kinema-play.vercel.app |

## If discovery cannot find scene / camera / renderer

Bundled apps often keep Three.js objects in module closures. The IIFE walks
enumerable globals (and `window.pelagic.debug`) only.

1. In the page’s own sources, find the live `scene`, `camera`, and
   `WebGLRenderer` (breakpoint on `WebGLRenderer.render`, Three inspector, or
   whatever global the demo already exposes).
2. Then:

```js
window.__THREEJS_DOCTOR_ATTACH__ = { autoRun: false }
// paste attach.iife.js
await ThreejsDoctorLiveAttach.attachQualityLadder({
  mode: 'advise',
  scene,
  camera,
  renderer,
})
```

Ocean: `window.pelagic.debug` usually has `scene` and `renderer`; camera may be
on that bag or in the scene graph.

## Bookmarklet

The IIFE is the pasteable artifact. A bookmarklet that `fetch`es this file will
fail on GitHub raw (CORS) for a private clone. Either paste the IIFE, or host
`attach.iife.js` yourself and use:

```
javascript:(function(){var s=document.createElement('script');s.src='https://YOUR_HOST/attach.iife.js';document.documentElement.appendChild(s)})();
```

Set `window.__THREEJS_DOCTOR_ATTACH__` **before** the script runs to choose
`mode: 'safe-auto'`.

## Notes

- `npx threejs-doctor scan` is a stub and is not this path.
- Headless CI does not gate live TTFI/FPS.
- Incomplete runs: keep baseline, set `incomplete: true`, do not paste fixture numbers.
