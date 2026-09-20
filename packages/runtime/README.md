# @threejs-doctor/runtime

`Doctor` API, overlay, and reversible safe passes for Three.js. Part of [threejs-doctor](https://github.com/codergeeta/threejs-doctor).

```bash
npm i @threejs-doctor/runtime
```

```ts
import { Doctor, waitGpuMacrotask } from '@threejs-doctor/runtime'

const doctor = new Doctor({
  scene,
  camera,
  renderer,
  waitFrame: () => waitGpuMacrotask(),
})
console.log(await doctor.diagnose())
```

Monorepo README: [github.com/codergeeta/threejs-doctor](https://github.com/codergeeta/threejs-doctor#readme).
