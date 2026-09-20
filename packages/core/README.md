# @threejs-doctor/core

Probe, scene snapshot, and metrics for [threejs-doctor](https://github.com/codergeeta/threejs-doctor). GPU times are copied only when `EXT_disjoint_timer_query_webgl2` returns a result — never invented.

```bash
npm i @threejs-doctor/core
```

```ts
import { probeDevice } from '@threejs-doctor/core'

const device = probeDevice()
```

Monorepo README: [github.com/codergeeta/threejs-doctor](https://github.com/codergeeta/threejs-doctor#readme).
