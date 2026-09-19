# Publishing `@threejs-doctor/*` and unscoped `threejs-doctor`

Root `package.json` is `@threejs-doctor/monorepo` (`private: true`). Example packages stay private. This repo **does not store registry tokens**.

Publish order is enforced by `scripts/publish.mjs`:

1. **FIRST** unscoped `threejs-doctor` (name reservation + `npx threejs-doctor` → `@threejs-doctor/cli`)
2. **THEN** scoped `@threejs-doctor/core`, `rules`, `runtime`, `bench`, `cli`, `r3f` with provenance

```bash
pnpm build
pnpm publish:dry    # no registry write
# only after org/token exists:
pnpm publish:npm    # or GitHub Action "publish"
```

## Kunal — one-time npm / GitHub steps

Do these once. The agent cannot create the org, mint a token, or attach Trusted Publisher. **First publish needs a token** because Trusted Publisher is configured on packages that already exist.

### 1. Create the npm org

1. Sign in to npm as the owner account (2FA on).
2. Create the org **`@threejs-doctor`**: https://www.npmjs.com/org/create  
   Add the GitHub user that owns `codergeeta/threejs-doctor` as an owner.

### 2. First publish with `NPM_TOKEN` (required once)

1. npm → Access Tokens → **Granular Automation Token**  
   Permission: **Read and write** (publish) for `@threejs-doctor` and unscoped `threejs-doctor`.  
   Do not use a classic token with delete rights if you can avoid it.
2. GitHub repo → Settings → Secrets and variables → Actions → New repository secret  
   Name: **`NPM_TOKEN`**  
   Value: the granular token.
3. Merge this plumbing PR to `main`.
4. Actions → **Publish npm** → Run workflow → type `publish`.  
   That publishes `threejs-doctor` first, then `@threejs-doctor/{core,rules,runtime,bench,cli,r3f}` with `NPM_CONFIG_PROVENANCE=true`.

   Or locally (never commit the token):

   ```bash
   export NPM_TOKEN=npm_...
   echo '//registry.npmjs.org/:_authToken=${NPM_TOKEN}' > ~/.npmrc
   pnpm build
   pnpm publish:npm
   ```

5. Confirm `npm view threejs-doctor` and `npm view @threejs-doctor/runtime`.

### 3. Then Trusted Publisher (OIDC, later publishes)

After the packages exist, for **each** of `threejs-doctor` and `@threejs-doctor/*`:

1. npm → package → **Settings** → **Trusted Publisher** → GitHub Actions  
   - Repository: `codergeeta/threejs-doctor`  
   - Workflow filename: `publish.yml`  
   - Environment: leave empty unless you add one
2. Delete the `NPM_TOKEN` repo secret. Empty `NODE_AUTH_TOKEN` is fine; the workflow unsets it and uses OIDC.

Provenance: the workflow sets `id-token: write` and `NPM_CONFIG_PROVENANCE=true` (`npm publish --provenance` via pnpm).

## Pre-publish checklist

- [x] Scoped packages have `publishConfig.access: public` and are not `private`.
- [x] Unscoped `threejs-doctor` placeholder exists and depends on `@threejs-doctor/cli`.
- [x] GitHub Actions `publish.yml` uses OIDC (`id-token: write`) + optional `NPM_TOKEN`.
- [ ] Create `@threejs-doctor` npm org (Kunal).
- [ ] Set `NPM_TOKEN` GitHub secret (first publish).
- [ ] `pnpm typecheck` / `pnpm test` / `pnpm build` green on `main`.
- [ ] Run **Publish npm** (confirm `publish`) **or** `pnpm publish:npm`.
- [ ] Confirm `npm view threejs-doctor` and `npm view @threejs-doctor/runtime`.
- [ ] Attach Trusted Publisher on each package; then delete `NPM_TOKEN`.
- [ ] npm 2FA / org ownership for `@threejs-doctor` and unscoped `threejs-doctor`.

## This PR does not

- store registry tokens
- run `npm publish` from the agent
- claim the packages are already on the registry until Kunal completes the steps above
