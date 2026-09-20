# Publishing `@threejs-doctor/*` and unscoped `threejs-doctor`

Root `package.json` is `@threejs-doctor/monorepo` (`private: true`). Example packages stay private. This repo **does not store registry tokens**.

**0.1.5 is on npm.** Keywords, Parts A–C report, GitHub Pages sample. Via [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) (run 35489954729). Non-empty `dist.attestations` on all seven packages. Do **not** republish 0.1.5. The first post-publish provenance check went red after 6 retries (`@threejs-doctor/cli@0.1.5` still E404); minutes later attestations were visible. That check is still flaky until the longer (~5–8 min) retry lands. Later publishes **must** use `workflow_dispatch` (confirm by typing `publish`). `scripts/publish.mjs --go` **refuses** unless `GITHUB_ACTIONS=true`. Do **not** run `pnpm publish:npm --go` locally or from a cloud agent VM. Dry-run is still OK: `pnpm publish:dry`.

Org: https://www.npmjs.com/org/threejs-doctor.

```bash
npm i @threejs-doctor/runtime
npx threejs-doctor@0.1.5 scan .
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

Do **not** republish 0.1.3, 0.1.4, or 0.1.5 from a cloud agent VM.

Publishable packages set `publishConfig.provenance: true`. **Provenance does not require Trusted Publisher.** `npm publish --provenance` in GitHub Actions with `id-token: write` can produce attestations **with `NPM_TOKEN`**. Trusted Publisher lets you delete `NPM_TOKEN` later. 0.1.0–0.1.3 were token publishes and may have empty `dist.attestations`. **0.1.4 is the first provenance-bearing release.** **0.1.5 also has non-empty `dist.attestations`** (`npm view <pkg>@0.1.5 dist.attestations`).

`publish.yml` runs `node scripts/check-provenance.mjs --published` immediately after publish. That check **retries** `npm view … dist.attestations` with backoff (~5–8 min) when the version is missing (E404) or attestations are empty while npm finishes indexing, then fails hard. The 0.1.5 first check was still flaky (~2–3 min / 6 retries; `@threejs-doctor/cli` lagged) until this longer wait lands. Weekly CI (`.github/workflows/provenance.yml`) runs `node scripts/check-provenance.mjs --published --latest` against the version currently on npm.

## Kunal — remaining npm / GitHub steps

**0.1.0–0.1.5 publishes are done.** Do not republish 0.1.5.

### 1–6. Historical publishes — done

See git history. 0.1.0–0.1.3 used token publish; `npm view threejs-doctor@0.1.3 dist.attestations` may still be empty. **0.1.4** went out via `publish.yml` run 35486295010 with non-empty `dist.attestations` (first CI provenance-bearing release). **0.1.5** went out via `publish.yml` run 35489954729 (keywords, Parts A–C report, Pages). Publish itself succeeded and all seven packages have non-empty `dist.attestations`; the first post-publish check went red after 6 retries because `@threejs-doctor/cli@0.1.5` was still E404. Do **not** republish.

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
- [x] Bump publishable packages to 0.1.5 (keywords for npm search).
- [x] Publish 0.1.5 via `publish.yml` workflow_dispatch only (do not publish from a cloud VM; do not `pnpm publish:npm --go`).
- [x] Confirm `npm view <pkg>@0.1.5 dist.attestations` is non-empty.
- [x] `check-provenance.mjs --published` retries E404 / empty attestations after publish (~5–8 min), then fails hard. (0.1.5 first check was still flaky on the shorter ~2–3 min budget.)
- [ ] (Optional) Attach Trusted Publisher on each package; then delete `NPM_TOKEN`.
- [ ] Confirm npm 2FA remains on for org owners.

## This PR does not

- store registry tokens
- republish 0.1.3, 0.1.4, or 0.1.5 to npm
- npm-publish from a cloud agent VM
- attach Trusted Publisher or delete `NPM_TOKEN`
