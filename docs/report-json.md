# Report JSON keys (`formatHtmlReport`)

`threejs-doctor report <file.json>` and `scan --format html` render a **self-contained** HTML file. No CDN, no telemetry. Missing fields are omitted or shown as **not measured** — never invented.

Print a fully-populated sample:

```bash
npx threejs-doctor report --example
```

The committed fixture is [`docs/sample-report.json`](sample-report.json). CI generates HTML from that file so the GitHub Pages sample cannot drift.

Unknown **top-level** names produce a **warning** on stderr (exit 0). Typos are not dropped silently.

`expectedTradeoffs` is **not** read yet (later punch-list PRs). If you include it today, the report command warns.

## Top-level keys the HTML formatter reads

| Key | Aliases | Section |
|-----|---------|---------|
| `example` | — | Banner: marks a sample fixture, not a live capture |
| `score` | — | Score line. Omitted → “No score in this JSON (not invented).” |
| `profile` | — | Subtitle. Default `unknown` |
| `mode` | `qualityMode` | Subtitle. `qualityMode` is used only when `mode` is missing. Default `diagnose` |
| `incomplete` | — | Subtitle suffix `· incomplete` when `true` |
| `staticScan` | — | Score kind: `true` → `static (source patterns)`; otherwise `runtime (measured)` |
| `repository` | — | GitHub `blob` links for finding sites when `--repo` is not passed. Must be `https://github.com/org/repo` |
| `baseline` | — | Before/after metric cards (required for that section) |
| `after` | — | After values + noise-band verdicts |
| `findings` | — | Findings list |
| `expensiveMeshes` | `topMeshes` | Expensive meshes table |
| `triangleContributorSummary` | — | Fallback mesh row when mesh arrays are absent (`name:triangles`). Also read from `baseline.triangleContributorSummary` |
| `gpuPassTimes` | `passGpuMs` | GPU time per pass table |
| `captures` | `visuals`, `screenshots` | Visuals (`data:image/…` only) |
| `history` | — | Score trend (needs **two or more** points) |
| `noiseBand` | — | Verdicts (`win` / `loss` / `inside-noise`) |
| `claimed` | — | Explicit verdicts; wins over computed band |

Also accepted at the top level (not rendered as their own sections, **no warning**): Doctor fields `deltas`, `appliedPasses`, `failedPasses`, `invalid`, `invalidReason`, `visualDelta`, `gpuTimingSkipped`, `rolledBackDueToVisual`; Quality Ladder fields `phase`, `tier`, `startTier`, `maxTier`, `appliedKnobs`, `unsupportedKnobs`, `floorFailed`, `applyFailed`, `ttfiMs`, `adapterUnavailable`, `recommendedTier`; optional `$schema`.

## `baseline` / `after` metric cards

Each card is shown only when `baseline[key]` is a finite number. `after` is optional.

| Key | Notes |
|-----|--------|
| `avgFps` | Higher is better when scoring a band |
| `p95FrameTimeMs` | Lower is better |
| `drawCalls` | Lower is better |
| `triangles` | Drawn triangles. Lower is better |
| `gpuFrameTimeMs` | Frame GPU ms from `EXT_disjoint_timer_query_webgl2`. **Omit** when not measured (typical on iOS Safari / many phones) |
| `lightCount` | |
| `shadowCastingLightCount` | |
| `drawingBufferPixels` | Lower is better |

Other `MetricsSample` fields (`textureCount`, `estimatedVramBytes`, …) may appear in JSON; the HTML cards do not list them.

If `after[key]` is present but there is no `claimed[key]` and no `noiseBand[key]`, the card shows `no noise band` (not a win).

## `noiseBand` / `claimed`

```json
"noiseBand": { "triangles": { "abs": 100, "rel": 0.01 } },
"claimed": { "triangles": "win" }
```

- `noiseBand.<metric>.abs` and `.rel` must both be finite numbers.
- `claimed.<metric>` is one of `win` | `loss` | `inside-noise`.
- Band math is `max(abs, |before| * rel)` via `claimAbDelta`. Never treat a delta inside the band as a win.

## `findings[]`

| Field | Role |
|-------|------|
| `id` | Heading (default `finding`) |
| `severity` | `info` / `warn` / `error` (default `warn`) |
| `message` | Body |
| `suggestedFix` | Optional `<pre>` |
| `locations[]` | `{ file, line? }` — preferred site list |
| `evidence.file` / `evidence.line` | Fallback site when `locations` is empty |
| `evidence.topContributor` | Fallback mesh label (`name:triangles`) when mesh arrays are empty |

## Expensive meshes

`expensiveMeshes` (alias `topMeshes`) items:

| Field | Aliases |
|-------|---------|
| `name` | `id`, `label` |
| `triangles` | `drawnTriangles` |

Missing triangle counts render as **not measured**.

Fallback if those arrays are absent: `triangleContributorSummary` or `baseline.triangleContributorSummary` or a finding `evidence.topContributor` string containing `:`.

## GPU passes

`gpuPassTimes` (alias `passGpuMs`) items:

| Field | Aliases |
|-------|---------|
| `pass` | `id`, `name` |
| `gpuFrameTimeMs` | `ms`, `gpuMs` |

If the array is empty/absent:

- `baseline.gpuFrameTimeMs` → a single “Frame GPU … ms (no per-pass breakdown)” line
- otherwise → **not measured on this device** plus the `EXT_disjoint_timer_query_webgl2` note

## Visuals

`captures` (aliases `visuals`, `screenshots`) items:

| Field | Aliases |
|-------|---------|
| `dataUrl` | `src` — must start with `data:image/` |
| `label` | default `capture` |

Remote `http(s)` images are ignored (report stays offline).

## `history[]` (score trend)

Needs at least two points.

| Field | Role |
|-------|------|
| `score` | Required finite number |
| `commit` | Label (preferred) |
| `label` | Label if `commit` is missing |

## What HTML does not invent

- FPS, GPU ms, triangles, VRAM, TTFI
- Screenshot pixels (only embedded `data:image/` URLs already in the JSON)
- Wins without a noise band or an explicit `claimed` value
