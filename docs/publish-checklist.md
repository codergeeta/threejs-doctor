# Publishing `@threejs-doctor/*` and unscoped `threejs-doctor`

Root `package.json` is `@threejs-doctor/monorepo` (`private: true`). Example packages stay private. This repo **does not store registry tokens**.

**0.1.2 is on npm** — unscoped `threejs-doctor` plus `@threejs-doctor/{core,rules,runtime,bench,cli,r3f}`. Org: https://www.npmjs.com/org/threejs-doctor.

**0.1.3 is not published from this PR.** Publish **only** via [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) **after Trusted Publisher is attached**, then delete the `NPM_TOKEN` repo secret. Do **not** claim Trusted Publisher is attached until it is. 0.1.0–0.1.2 were token publishes and have empty `dist.attestations` despite `publishConfig.provenance`.

```bash
npm i @threejs-doctor/runtime
npx threejs-doctor@0.1.2
npx threejs-doctor@0.1.2 scan ./path --format json
```

Publish order is enforced by `scripts/publish.mjs`:

1. **FIRST** unscoped `threejs-doctor` (name reservation + `npx threejs-doctor` → `@threejs-doctor/cli`)
2. **THEN** scoped `@threejs-doctor/core`, `rules`, `runtime`, `bench`, `cli`, `r3f` with provenance

`workspace:^` rewrites to `^0.1.3` on pack.

```bash
pnpm build
pnpm publish:dry    # no registry write; does not check dist.attestations
# after Trusted Publisher is attached (human npm UI), then:
# GitHub Action "publish" (publish.yml) — do not publish from a cloud agent VM
```

Do **not** publish from a cloud agent VM. Do **not** republish 0.1.2. Do **not** publish 0.1.3 with `NPM_TOKEN` once Trusted Publisher exists — token publishes leave `dist.attestations` empty and `scripts/check-provenance.mjs --published` fails.

Publishable packages set `publishConfig.provenance: true` (npm 9.5+; equivalent to `npm publish --provenance` / `NPM_CONFIG_PROVENANCE=true`). **Provenance attestations still require Trusted Publisher (OIDC)** on GitHub Actions. This checklist does not attach Trusted Publisher.

## Kunal — remaining npm / GitHub steps

**0.1.0, 0.1.1, and 0.1.2 publishes are done.** **0.1.3 is code-ready, not on npm.** Remaining: attach Trusted Publisher on each package, delete `NPM_TOKEN`, then run **Publish npm** (`publish.yml`).

### 1. Create the npm org — done

Org **`@threejs-doctor`**: https://www.npmjs.com/org/threejs-doctor

### 2. First publish with `NPM_TOKEN` — done

0.1.0 is on the registry. The first publish used a granular automation token in the `NPM_TOKEN` GitHub secret.

### 3. Publish 0.1.1 — done

0.1.1 is on the registry (`npm view threejs-doctor` / `npm view @threejs-doctor/runtime`). Changelog: real static scan + `ci --min-score`.

### 4. Publish 0.1.2 — done

0.1.2 is on the registry (`npm view threejs-doctor` / `npm view @threejs-doctor/runtime`). Changelog: real-host audit (rAF hang, visual rollback, static scan). Token publish was used again. `npm view threejs-doctor@0.1.2 dist.attestations` is empty.

### 5. Trusted Publisher (OIDC) — required before 0.1.3

For **each** of `threejs-doctor` and `@threejs-doctor/*`:

1. npm → package → **Settings** → **Trusted Publisher** → GitHub Actions
   - Repository: `codergeeta/threejs-doctor`
   - Workflow filename: `publish.yml`
   - Environment: leave empty unless you add one
2. Delete the `NPM_TOKEN` repo secret. Empty `NODE_AUTH_TOKEN` is fine; the workflow unsets it and uses OIDC.
3. Run **Publish npm** (confirm `publish`) from GitHub Actions. The workflow then runs `node scripts/check-provenance.mjs --published` and **fails** if `dist.attestations` is empty.

Provenance: the workflow sets `id-token: write` and `NPM_CONFIG_PROVENANCE=true` (`npm publish --provenance` via pnpm). Packages also set `publishConfig.provenance: true`. **OIDC provenance still needs Trusted Publisher clicks in the npm UI** (this checklist does not perform those clicks).

## Checklist

- [x] Scoped packages have `publishConfig.access: public` and are not `private`.
- [x] Unscoped `threejs-doctor` placeholder exists and depends on `@threejs-doctor/cli`.
- [x] GitHub Actions `publish.yml` uses OIDC (`id-token: write`) + optional `NPM_TOKEN`.
- [x] Create `@threejs-doctor` npm org.
- [x] Set `NPM_TOKEN` GitHub secret (first publish).
- [x] `pnpm typecheck` / `pnpm test` / `pnpm build` green on `main`.
- [x] Run **Publish npm** (confirm `publish`) **or** `pnpm publish:npm` for 0.1.0.
- [x] Confirm `npm view threejs-doctor` and `npm view @threejs-doctor/runtime` (0.1.0).
- [x] Bump publishable packages to 0.1.1.
- [x] Publish 0.1.1 and confirm `npm view` (do not publish from a cloud VM).
- [x] Bump publishable packages to 0.1.2 + `publishConfig.provenance: true`.
- [x] Publish 0.1.2 and confirm `npm view` (do not publish from a cloud VM).
- [x] Bump publishable packages to 0.1.3.
- [x] Post-publish provenance check script (`scripts/check-provenance.mjs --published`).
- [ ] Attach Trusted Publisher on each package; then delete `NPM_TOKEN`.
- [ ] Publish 0.1.3 via `publish.yml` only (do not publish from a cloud VM).
- [ ] Confirm `npm view <pkg>@0.1.3 dist.attestations` is non-empty.
- [ ] Confirm npm 2FA remains on for org owners (org + packages exist).

## This PR does not

- store registry tokens
- republish 0.1.2 to npm
- publish 0.1.3 to npm
- attach Trusted Publisher or delete `NPM_TOKEN`
