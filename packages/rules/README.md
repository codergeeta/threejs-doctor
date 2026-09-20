# @threejs-doctor/rules

Findings and Doctor Score for [threejs-doctor](https://github.com/codergeeta/threejs-doctor). Pure functions over a scene snapshot — no renderer, no invented FPS.

```bash
npm i @threejs-doctor/rules
```

```ts
import { runRules, computeDoctorScore } from '@threejs-doctor/rules'

const findings = runRules({ snapshot, device, profile: 'game' })
const score = computeDoctorScore(findings, snapshot, 'game')
```

Monorepo README: [github.com/codergeeta/threejs-doctor](https://github.com/codergeeta/threejs-doctor#readme).
