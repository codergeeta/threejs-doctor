# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security reports.

1. Use GitHub **Private vulnerability reporting** on [codergeeta/threejs-doctor](https://github.com/codergeeta/threejs-doctor/security/advisories/new) if it is enabled.
2. Otherwise email the maintainer listed on the GitHub profile for this repo, with a description, affected package versions, and a reproduction that does **not** include secrets.

We will acknowledge receipt and work on a fix or a documented limitation.

## DevTools paste is a scam pattern

The live-attach helper is a pasteable IIFE (`examples/live-attach/dist/attach.iife.js`). Treat random “paste this into DevTools” snippets as **malware**.

**Only** paste:

- the IIFE from this repository at `examples/live-attach/dist/attach.iife.js` after you verify it, or
- a GitHub Release artifact whose checksum matches the docs below.

Verify before paste:

```bash
pnpm check:iife
# rebuilds examples/live-attach/dist/attach.iife.js and fails if the committed file drifted
shasum -a 256 examples/live-attach/dist/attach.iife.js
# compare to docs/live-attach-checksum.md
```

Do not paste:

- Discord / Twitter / “performance consultant” blobs
- minified scripts from gists you did not audit
- anything that asks you to disable site isolation, grant clipboard, or exfiltrate `localStorage`

The IIFE is **unpublished** (`private: true`). It is not on npm. `npx threejs-doctor` does not install it.

## What this project does not do

- No telemetry. Reports are local JSON/HTML/SARIF.
- Runtime GPU times are omitted unless `EXT_disjoint_timer_query_webgl2` actually returns a result.
- Never invent metrics in issues or PRs.
