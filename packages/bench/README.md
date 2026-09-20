# @threejs-doctor/bench

Headless fixtures and low-end budgets for [threejs-doctor](https://github.com/codergeeta/threejs-doctor). No WebGL — CI-safe mock scenes.

```bash
npm i @threejs-doctor/bench
```

```ts
import { runBenchSuite } from '@threejs-doctor/bench'

const report = await runBenchSuite({ profile: 'game', budget: 'low' })
```

Or via CLI: `npx threejs-doctor bench --profile game --budget low`.

Monorepo README: [github.com/codergeeta/threejs-doctor](https://github.com/codergeeta/threejs-doctor#readme).
