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
paste without rebuilding). Rebuild after changing attach source.

## Pass A (`advise`, default)

1. Open one of the live URLs below. Wait until the WebGL canvas is visible.
2. Open DevTools → Console.
3. Paste the **entire** contents of `dist/attach.iife.js` and press Enter.
4. Wait until a JSON line is logged. Save that file **off-repo**. Do not commit it.
5. Validate against
   [`docs/superpowers/acceptance/quality-ladder-report.schema.json`](../../docs/superpowers/acceptance/quality-ladder-report.schema.json).

Default mode is `advise` (read-only: no pass/adapter mutation). Overlay mounts
when `document.body` exists.

If auto-run is unwanted:

```js
window.__THREEJS_DOCTOR_ATTACH__ = { autoRun: false }
```

Then paste the IIFE and call:

```js
await ThreejsDoctorLiveAttach.attachQualityLadder({ mode: 'advise' })
```

## Pass B (`safe-auto`)

Cold load again (reload the live page). Same camera path as Pass A.

```js
window.__THREEJS_DOCTOR_ATTACH__ = { mode: 'safe-auto' }
```

Paste `dist/attach.iife.js` again. Save the JSON off-repo. Compare `ttfiMs` and
settled windows to the bar in
[`docs/superpowers/acceptance/live-ocean-capture.md`](../../docs/superpowers/acceptance/live-ocean-capture.md).
Do not type guessed after metrics.

## Live URLs (do not vendor)

| Host | URL | Adapter |
|------|-----|---------|
| ocean-simulation | https://iamtechartist.github.io/ocean-simulation/ | Registers `createOceanAdapter` when `window.pelagic.debug` exists. If it is missing, generic Three.js caps only (`adapterUnavailable` on apply). |
| claude-of-tanks | https://cot.kevinliu.studio/ | Generic caps. No ocean adapter. |
| Kinema | https://kinema-play.vercel.app/?forceWebGL=1 | Generic caps. Use the documented WebGL compatibility query so the capture stays on WebGL. Homepage: https://kinema-play.vercel.app |

If discovery cannot find `scene` / `camera` / `renderer`:

```js
await ThreejsDoctorLiveAttach.attachQualityLadder({
  mode: 'advise',
  scene,
  camera,
  renderer,
})
```

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
