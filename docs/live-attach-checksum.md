# live-attach IIFE checksum

Paste **only** `examples/live-attach/dist/attach.iife.js` from this repo (or a GitHub Release that matches this hash).

Verify:

```bash
pnpm check:iife
shasum -a 256 examples/live-attach/dist/attach.iife.js
```

Expected SHA-256 (sha256sum / `shasum -a 256`) is recorded after each IIFE rebuild in the table below. If it does not match, do not paste.

| File | SHA-256 |
|------|---------|
| `examples/live-attach/dist/attach.iife.js` | `7227687f7c780c4200db132afa48b1b82e9cbfe24624230ffcb7b9714492c61b` |

A motion GIF of the paste flow is a follow-up; this file is the checksum source of truth.
