# Unpublished ocean QualityAdapter

Thin wrapper around `window.pelagic.debug` for the live
[ocean-simulation](https://iamtechartist.github.io/ocean-simulation/) demo.

**This repository does not vendor, submodule, or publish that demo.** Do not add
`iamtechartist/ocean-simulation` here. The adapter lives in this unpublished
example (`private: true`) and is **not** `@threejs-doctor/ocean-adapter`.

## Live attach

Preferred path: paste the unpublished IIFE from
[`examples/live-attach`](../live-attach/README.md) into DevTools on the live
page. That helper constructs Doctor + QualityController, registers this adapter
only when `window.pelagic.debug` exists, and logs `JSON.stringify(report)`.

Manual equivalent (`profile: 'game'`):

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
const ladder = new QualityController(doctor, { mode: 'safe-auto' })
ladder.registerAdapter(createOceanAdapter(getPelagicDebug()))
await ladder.boot()
const report = await ladder.runLadder()
console.log(JSON.stringify(report))
```

If `window.pelagic.debug` is missing (or has no cascades/targets),
`createOceanAdapter` reports `capabilities: []`. The controller then sets
`adapterUnavailable: true` and still runs **generic** Three.js caps only.
Do not invent `simPassCount` / `after` metrics in that case.

`threejs-doctor scan` / `ci` are not implemented (exit 1) and are **not** an acceptance path for ocean
quality. Headless CI runs unit tests only. Live TTFI/FPS proof is a phone
capture against the URL above, not a checked-in JSON fixture.
