# @threejs-doctor/cli

CLI for [threejs-doctor](https://github.com/codergeeta/threejs-doctor): static `scan` / `ci`, headless `bench`, and offline HTML `report`. Unscoped `npx threejs-doctor` forwards here.

```bash
npm i -g @threejs-doctor/cli
# or
npx threejs-doctor scan .
```

```bash
npx threejs-doctor scan ./src --format html -o report.html
npx threejs-doctor report --example
npx threejs-doctor report ./doctor-report.json -o report.html
```

Monorepo README: [github.com/codergeeta/threejs-doctor](https://github.com/codergeeta/threejs-doctor#readme).
