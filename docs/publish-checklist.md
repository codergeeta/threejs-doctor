# Publishing `@threejs-doctor/*` and unscoped `threejs-doctor`

Root `package.json` is `@threejs-doctor/monorepo` (`private: true`). Example packages stay private. This repo **does not store registry tokens**.

**0.1.0 is published** — unscoped `threejs-doctor` plus `@threejs-doctor/{core,rules,runtime,bench,cli,r3f}`. Org: https://www.npmjs.com/org/threejs-doctor.

```bash
npm i @threejs-doctor/runtime
npx threejs-doctor
```

Publish order is enforced by `scripts/publish.mjs`:

1. **FIRST** unscoped `threejs-doctor` (name reservation + `npx threejs-doctor` → `@threejs-doctor/cli`)
2. **THEN** scoped `@threejs-doctor/core`, `rules`, `runtime`, `bench`, `cli`, `r3f` with provenance

```bash
pnpm build
pnpm publish:dry    # no registry write
# later publishes (after Trusted Publisher):
pnpm publish:npm    # or GitHub Action "publish"
```

Do **not** bump versions or republish from this docs update.

## Kunal — remaining npm / GitHub steps

Org create, first publish, and `npm view` are **done**. Remaining: attach Trusted Publisher on each package, then delete `NPM_TOKEN`.

### 1. Create the npm org — done

Org **`@threejs-doctor`**: https://www.npmjs.com/org/threejs-doctor

### 2. First publish with `NPM_TOKEN` — done

0.1.0 is on the registry (`npm view threejs-doctor` / `npm view @threejs-doctor/runtime`). The first publish used a granular automation token in the `NPM_TOKEN` GitHub secret.

### 3. Then Trusted Publisher (OIDC, later publishes) — remaining

For **each** of `threejs-doctor` and `@threejs-doctor/*`:

1. npm → package → **Settings** → **Trusted Publisher** → GitHub Actions
   - Repository: `codergeeta/threejs-doctor`
   - Workflow filename: `publish.yml`
   - Environment: leave empty unless you add one
2. Delete the `NPM_TOKEN` repo secret. Empty `NODE_AUTH_TOKEN` is fine; the workflow unsets it and uses OIDC.

Provenance: the workflow sets `id-token: write` and `NPM_CONFIG_PROVENANCE=true` (`npm publish --provenance` via pnpm).

## Checklist

- [x] Scoped packages have `publishConfig.access: public` and are not `private`.
- [x] Unscoped `threejs-doctor` placeholder exists and depends on `@threejs-doctor/cli`.
- [x] GitHub Actions `publish.yml` uses OIDC (`id-token: write`) + optional `NPM_TOKEN`.
- [x] Create `@threejs-doctor` npm org.
- [x] Set `NPM_TOKEN` GitHub secret (first publish).
- [x] `pnpm typecheck` / `pnpm test` / `pnpm build` green on `main`.
- [x] Run **Publish npm** (confirm `publish`) **or** `pnpm publish:npm`.
- [x] Confirm `npm view threejs-doctor` and `npm view @threejs-doctor/runtime` (0.1.0).
- [ ] Attach Trusted Publisher on each package; then delete `NPM_TOKEN`.
- [ ] Confirm npm 2FA remains on for org owners (org + packages exist).

## This PR does not

- store registry tokens
- bump versions or republish
- attach Trusted Publisher or delete `NPM_TOKEN`
