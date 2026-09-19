# Contributing

## Setup

Node >= 20, [pnpm](https://pnpm.io) 9 (see root `packageManager`).

```bash
git clone https://github.com/codergeeta/threejs-doctor.git
cd threejs-doctor
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm check:iife
```

## Layout

| Path | Role |
|------|------|
| `packages/core` | Probe, snapshot, A/B noise band |
| `packages/rules` | Findings + Doctor Score |
| `packages/runtime` | `Doctor` + safe passes |
| `packages/cli` | `scan` / `ci` / `bench` / `report` |
| `packages/bench` | Headless fixtures |
| `packages/r3f` | `DoctorCanvas` |
| `examples/live-attach` | Unpublished DevTools IIFE |

Do not add `distance-cull` or `frameloop-demand` to default `SAFE_PASSES` for games.

## Tests

- Prefer Vitest unit tests next to the code (`src/__tests__`).
- Static scan fixtures live in `packages/cli/src/__tests__/fixtures/`.
- Do **not** invent FPS, GPU ms, or triangle counts in tests or docs. Copy numbers from JSON or omit the field.
- After changing live-attach or runtime code that it bundles, rebuild `examples/live-attach/dist/attach.iife.js` so `pnpm check:iife` stays green.

## Pull requests

1. Branch from `main`.
2. Keep the PR focused. One launch pack is OK when the issue says so.
3. Fill the issue template fields if you are reporting a host bug (three.js version, composer, browser/GPU, JSON report).
4. Do not publish to npm from your laptop. `pnpm publish:npm --go` is refused outside GitHub Actions. Maintainers run `.github/workflows/publish.yml`.

## Code style

Match the surrounding TypeScript. No extra markdown files unless the change is docs. No telemetry.
