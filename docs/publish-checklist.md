# Publishing `@threejs-doctor/*` (follow-up — not this PR)

This repository is **not published to npm**. Root `package.json` is `private: true`. Do **not** run `npm publish` / `pnpm publish` until the checklist below is complete. This PR does not include registry tokens and must not publish.

## Reserve names (order matters)

1. **FIRST** reserve the **unscoped** name `threejs-doctor` as a **placeholder** (the current unpublished root name; `npx threejs-doctor` can otherwise run a squat). Do this before any scoped publish.
2. **THEN** publish scoped packages under `@threejs-doctor/*` (`core`, `rules`, `runtime`, `cli`, `bench`, `r3f`) with **OIDC provenance** from CI (`npm publish --provenance`), not a laptop and not a stored token in this repo.
3. Keep example packages (`live-attach`, fixtures) `private: true`.

## Pre-publish checklist

- [ ] Reserve unscoped `threejs-doctor` as a placeholder **before** scoped packages.
- [ ] `pnpm typecheck` and `pnpm test` green on `main`.
- [ ] Rebuild `examples/live-attach` IIFE; CI checksum job is green (committed `dist/attach.iife.js` matches a fresh esbuild).
- [ ] Playwright real-three fixture green (WebGL2 GPU sampler wiring, composer mismatch, InstancedMesh bounds, drawn-triangle drop after chunking).
- [ ] Provenance: `npm publish --provenance` (or pnpm equivalent) from CI with OIDC, not a laptop. No registry tokens in git or this PR.
- [ ] Set `publishConfig.access` / remove `"private": true` only on the packages that should ship.
- [ ] Confirm no invented metrics in README bench tables; paste numbers from a real `bench` JSON.
- [ ] npm 2FA / org ownership for `@threejs-doctor` and unscoped `threejs-doctor`.

## This PR does not

- npm publish
- store registry tokens
- claim a registry listing exists
- run `npm publish` from an agent or laptop
