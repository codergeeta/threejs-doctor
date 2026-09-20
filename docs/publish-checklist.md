# Publishing `@threejs-doctor/*` and unscoped `threejs-doctor`

Root `package.json` is `@threejs-doctor/monorepo` (`private: true`). Example packages stay private. This repo **does not store registry tokens**.

**0.1.4 is on npm.** First provenance-bearing release via [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) (run 35486295010). Do **not** republish 0.1.4. **0.1.5 is this source line and is not published from this PR.** The next publish **must** be `workflow_dispatch` (confirm by typing `publish`). `scripts/publish.mjs --go` **refuses** unless `GITHUB_ACTIONS=true`. Do **not** run `pnpm publish:npm --go` locally or from a cloud agent VM. Dry-run is still OK: `pnpm publish:dry`.

Org: https://www.npmjs.com/org/threejs-doctor.

```bash
npm i @threejs-doctor/runtime
npx threejs-doctor@0.1.4 scan .
```

Publish order is enforced by `scripts/publish.mjs`:

1. **FIRST** unscoped `threejs-doctor` (name reservation + `npx threejs-doctor` → `@threejs-doctor/cli`)
2. **THEN** scoped `@threejs-doctor/core`, `rules`, `runtime`, `bench`, `cli`, `r3f` with provenance

`workspace:^` rewrites to `^0.1.5` on pack.

```bash
pnpm build
pnpm publish:dry    # no registry write; does not check dist.attestations
# GitHub → Actions → "publish" → type `publish`  (do not publish from a cloud agent VM)
```

Do **not** republish 0.1.3, 0.1.4, or an unpublished 0.1.5 from a cloud agent VM.

Publishable packages set `publishConfig.provenance: true`. **Provenance does not require Trusted Publisher.** `npm publish --provenance` in GitHub Actions with `id-token: write` can produce attestations **with `NPM_TOKEN`**. Trusted Publisher lets you delete `NPM_TOKEN` later. 0.1.0–0.1.3 were token publishes and may have empty `dist.attestations`. **0.1.4 is the first provenance-bearing release** (`npm view <pkg>@0.1.4 dist.attestations` is non-empty).

`publish.yml` runs `node scripts/check-provenance.mjs --published` immediately after publish. That check **retries** `npm view … dist.attestations` with backoff (~2–3 min) when the version is missing (E404) or attestations are empty while npm finishes indexing, then fails hard. Weekly CI (`.github/workflows/provenance.yml`) runs `node scripts/check-provenance.mjs --published --latest` against the version currently on npm.

## Kunal — remaining npm / GitHub steps

**0.1.0–0.1.4 publishes are done.** Do not republish 0.1.4. **0.1.5 is pending publish** (this source line: npm keywords + `report --example`). Coordinator publishes via `publish.yml` after merge.

### 1–6. Historical publishes — done

See git history. 0.1.0–0.1.3 used token publish; `npm view threejs-doctor@0.1.3 dist.attestations` may still be empty. **0.1.4** went out via `publish.yml` run 35486295010 with non-empty `dist.attestations` (first CI provenance-bearing release). That run went red only because the post-publish `check-provenance.mjs --published` hit E404 before npm finished indexing (~45s later the version was visible). Publish itself succeeded; do **not** republish.

Later versions:

1. Merge to `main`.
2. GitHub → **Actions** → **publish** → **Run workflow**.
3. Confirm input: type `publish`.
4. The workflow runs `node scripts/publish.mjs --go` (allowed because `GITHUB_ACTIONS=true`) with `NPM_CONFIG_PROVENANCE=true` and `id-token: write`.
5. Post-publish: `node scripts/check-provenance.mjs --published` retries registry lookups, then requires non-empty `dist.attestations`.
6. Optional later: attach Trusted Publisher on each package, then delete `NPM_TOKEN`.

Trusted Publisher clicks in the npm UI are **out of scope** for this agent.

Exact steps (human) for a **future** version:

```text
1. Open https://github.com/codergeeta/threejs-doctor/actions/workflows/publish.yml
2. Run workflow on branch main
3. Type: publish
4. Confirm npm view threejs-doctor@<new-version>
5. Confirm npm view threejs-doctor@<new-version> dist.attestations is non-empty
```

## Checklist

- [x] Scoped packages have `publishConfig.access: public` and are not `private`.
- [x] Unscoped `threejs-doctor` placeholder exists and depends on `@threejs-doctor/cli`.
- [x] GitHub Actions `publish.yml` uses OIDC (`id-token: write`) + optional `NPM_TOKEN`.
- [x] Create `@threejs-doctor` npm org.
- [x] Set `NPM_TOKEN` GitHub secret (first publish).
- [x] Publish 0.1.0–0.1.3 and confirm `npm view`.
- [x] `scripts/publish.mjs --go` refuses outside GitHub Actions.
- [x] Scheduled provenance check (`--published --latest`).
- [x] Bump publishable packages to 0.1.4.
- [x] Publish 0.1.4 via `publish.yml` workflow_dispatch only (do not publish from a cloud VM; do not `pnpm publish:npm --go`).
- [x] Confirm `npm view <pkg>@0.1.4 dist.attestations` is non-empty.
- [x] `check-provenance.mjs --published` retries E404 / empty attestations after publish (~2–3 min), then fails hard.
- [x] Bump publishable packages to 0.1.5 (this PR — keywords for npm search).
- [ ] Publish 0.1.5 via `publish.yml` workflow_dispatch only (coordinator; do not publish from a cloud VM).
- [ ] Confirm `npm view <pkg>@0.1.5 dist.attestations` is non-empty.
- [ ] (Optional) Attach Trusted Publisher on each package; then delete `NPM_TOKEN`.
- [ ] Confirm npm 2FA remains on for org owners.

## This PR does not

- store registry tokens
- republish 0.1.3 or 0.1.4 to npm
- npm-publish 0.1.5 from a cloud agent VM
- attach Trusted Publisher or delete `NPM_TOKEN`
